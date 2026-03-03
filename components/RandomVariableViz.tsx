"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import {
  generateHexGrid,
  hexToPixel,
  hexCorners,
  pixelToHex,
  hexKey,
} from "@/lib/hex";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Configuration ─────────────────────────────────────────────────────
const HEX_COLS = 14;
const HEX_ROWS = 10;
const HEX_SIZE = 28;
const GRID_OFFSET_X = 40;
const GRID_OFFSET_Y = 40;

// Falling dot color — always black for max contrast
const DOT_COLOR = "#0a0a0a";

// Group colors — all light/saturated, good contrast against black dots
const GROUP_COLORS = [
  "#5ec4a8", // teal/mint
  "#a7d86e", // lime green
  "#f7e04b", // bright yellow
  "#e87ea1", // rose pink
  "#9b8fef", // lavender
  "#6cc3e0", // sky blue
  "#f5a755", // warm orange
  "#f27e63", // coral
];

interface HexGroup {
  value: number;
  color: string;
  hexes: Set<string>;
}

interface SampleDot {
  id: number;
  x: number;
  y: number;
  color: string;
  phase: "falling" | "landed" | "fading";
  isHit: boolean;
  fallDuration: number;
}

type PresetType = "none" | "coin" | "d6" | "binomial" | "uniform";

interface PresetConfig {
  type: PresetType;
  binN: number;
  binP: number;
  uniA: number;
  uniB: number;
}

// ── Distribution Math ─────────────────────────────────────────────────

function binomialCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

function getDistributionBins(
  preset: PresetConfig
): { value: number; prob: number }[] {
  switch (preset.type) {
    case "coin":
      return [
        { value: 0, prob: 0.5 },
        { value: 1, prob: 0.5 },
      ];
    case "d6":
      return Array.from({ length: 6 }, (_, i) => ({
        value: i + 1,
        prob: 1 / 6,
      }));
    case "binomial": {
      const { binN: n, binP: p } = preset;
      return Array.from({ length: n + 1 }, (_, k) => ({
        value: k,
        prob:
          binomialCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k),
      }));
    }
    case "uniform": {
      const { uniA: a, uniB: b } = preset;
      const range = b - a + 1;
      if (range <= 0) return [];
      return Array.from({ length: range }, (_, i) => ({
        value: a + i,
        prob: 1 / range,
      }));
    }
    default:
      return [];
  }
}

/**
 * Allocate totalHexes cells to bins proportionally (largest-remainder rounding).
 */
function allocateHexes(
  bins: { value: number; prob: number }[],
  totalHexes: number
): { value: number; count: number }[] {
  const raw = bins.map((b) => ({
    value: b.value,
    count: Math.floor(b.prob * totalHexes),
    remainder: (b.prob * totalHexes) % 1,
  }));

  const remaining = totalHexes - raw.reduce((s, r) => s + r.count, 0);

  // Give one extra hex to bins with the largest fractional remainders
  const sorted = [...raw].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining && i < sorted.length; i++) {
    sorted[i].count++;
  }

  return raw.map((r) => ({ value: r.value, count: r.count }));
}

// ── Sub-components ────────────────────────────────────────────────────

function LegendTable({ groups }: { groups: HexGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="viz-legend-empty">
        <p>
          Paint hexagons on the grid, then assign a numeric value to define your
          random variable.
        </p>
      </div>
    );
  }
  return (
    <table className="viz-legend-table">
      <thead>
        <tr>
          <th>Color</th>
          <th>Value</th>
          <th>Hexes</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr key={i}>
            <td>
              <span
                className="viz-color-swatch"
                style={{ backgroundColor: g.color }}
              />
            </td>
            <td className="viz-value-cell">{g.value}</td>
            <td className="viz-count-cell">{g.hexes.size}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DistributionChart({
  groups,
  sampleCounts,
  totalSamples,
}: {
  groups: HexGroup[];
  sampleCounts: Map<number, number>;
  totalSamples: number;
}) {
  if (groups.length === 0) return null;

  const values = groups.map((g) => g.value).sort((a, b) => a - b);
  const uniqueValues = [...new Set(values)];

  const maxFreq =
    totalSamples > 0
      ? Math.max(
          ...uniqueValues.map(
            (v) => (sampleCounts.get(v) ?? 0) / totalSamples
          ),
          0.05
        )
      : 1;

  const chartH = 200;
  const chartW = Math.max(uniqueValues.length * 64, 280);
  const barW = 40;
  const gap = 64;

  return (
    <div className="viz-chart-wrap viz-chart-wrap--full">
      <div className="viz-chart-label">Empirical Distribution</div>
      <svg
        width="100%"
        height={chartH + 48}
        viewBox={`0 0 ${chartW + 48} ${chartH + 48}`}
        preserveAspectRatio="xMidYMid meet"
        className="viz-chart-svg"
      >
        {/* Y axis */}
        <line
          x1={36}
          y1={4}
          x2={36}
          y2={chartH + 4}
          stroke="currentColor"
          strokeWidth={1.5}
          opacity={0.3}
        />
        {/* X axis */}
        <line
          x1={36}
          y1={chartH + 4}
          x2={chartW + 44}
          y2={chartH + 4}
          stroke="currentColor"
          strokeWidth={1.5}
          opacity={0.3}
        />
        {/* Y labels */}
        <text x={30} y={10} textAnchor="end" className="viz-chart-text">
          1.0
        </text>
        <text
          x={30}
          y={chartH / 2 + 4}
          textAnchor="end"
          className="viz-chart-text"
        >
          0.5
        </text>
        <text
          x={30}
          y={chartH + 8}
          textAnchor="end"
          className="viz-chart-text"
        >
          0.0
        </text>
        {/* Bars */}
        {uniqueValues.map((v, i) => {
          const count = sampleCounts.get(v) ?? 0;
          const freq = totalSamples > 0 ? count / totalSamples : 0;
          const barH = (freq / Math.max(maxFreq, 1)) * chartH;
          const x = 44 + i * gap;
          const groupForColor = groups.find((g) => g.value === v);
          return (
            <g key={v}>
              <rect
                x={x}
                y={chartH + 4 - barH}
                width={barW}
                height={Math.max(barH, 0)}
                fill={groupForColor?.color ?? "#ccc"}
                rx={3}
                opacity={0.85}
              />
              {totalSamples > 0 && freq > 0.02 && (
                <text
                  x={x + barW / 2}
                  y={chartH - barH - 2}
                  textAnchor="middle"
                  className="viz-chart-text viz-chart-freq"
                >
                  {freq.toFixed(2)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={chartH + 22}
                textAnchor="middle"
                className="viz-chart-text viz-chart-val"
              >
                {v}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function RandomVariableViz() {
  const hexes = useMemo(() => generateHexGrid(HEX_COLS, HEX_ROWS), []);
  const totalHexes = hexes.length;

  // ── State ──────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<HexGroup[]>([]);
  const [selectedHexes, setSelectedHexes] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sampleCounts, setSampleCounts] = useState<Map<number, number>>(
    new Map()
  );
  const [totalSamples, setTotalSamples] = useState(0);
  const [isSampling, setIsSampling] = useState(false);
  const [sampleDots, setSampleDots] = useState<SampleDot[]>([]);
  const samplingRef = useRef(false);
  const dotIdRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);

  // Drag mode: paint or erase, determined by first cell on mousedown
  const dragModeRef = useRef<"paint" | "erase" | null>(null);
  const dragVisitedRef = useRef<Set<string>>(new Set());

  // Keep a ref to selectedHexes so drag handler stays stable
  const selectedHexesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedHexesRef.current = selectedHexes;
  }, [selectedHexes]);

  // Preset distribution controls
  const [preset, setPreset] = useState<PresetConfig>({
    type: "none",
    binN: 5,
    binP: 0.5,
    uniA: 1,
    uniB: 4,
  });

  // Assigned hex → group index lookup (memo for render, ref for handlers)
  const assignedHexMap = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g, idx) => {
      g.hexes.forEach((h) => map.set(h, idx));
    });
    return map;
  }, [groups]);
  const assignedHexMapRef = useRef(assignedHexMap);
  useEffect(() => {
    assignedHexMapRef.current = assignedHexMap;
  }, [assignedHexMap]);

  // ── Grid dimensions — symmetric padding ────────────────────────────
  // Content spans from OFFSET - SIZE (leftmost vertex) to
  // OFFSET + 1.5*SIZE*(COLS-1) + SIZE (rightmost vertex).
  // 2*OFFSET + center-to-center span = equal margin on both sides.
  const gridW = GRID_OFFSET_X * 2 + HEX_SIZE * 1.5 * (HEX_COLS - 1);
  const gridH =
    GRID_OFFSET_Y * 2 + HEX_SIZE * Math.sqrt(3) * (HEX_ROWS - 1);

  // Bounds for random dot spawning (hex-center range)
  const contentLeft = GRID_OFFSET_X;
  const contentRight = GRID_OFFSET_X + HEX_SIZE * 1.5 * (HEX_COLS - 1);
  const contentTop = GRID_OFFSET_Y;
  const contentBottom =
    GRID_OFFSET_Y + HEX_SIZE * Math.sqrt(3) * (HEX_ROWS - 1);

  // ── Hex interaction ────────────────────────────────────────────────
  const getHexFromEvent = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      return pixelToHex(
        px,
        py,
        HEX_SIZE,
        hexes,
        GRID_OFFSET_X,
        GRID_OFFSET_Y
      );
    },
    [hexes]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const hex = getHexFromEvent(e);
      if (!hex) return;
      const key = hexKey(hex.col, hex.row);
      if (assignedHexMapRef.current.has(key)) return;

      // Determine drag mode from first-touched cell
      const isSelected = selectedHexesRef.current.has(key);
      dragModeRef.current = isSelected ? "erase" : "paint";
      dragVisitedRef.current = new Set([key]);
      setIsDragging(true);

      setSelectedHexes((prev) => {
        const next = new Set(prev);
        if (dragModeRef.current === "erase") next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [getHexFromEvent]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging || !dragModeRef.current) return;
      const hex = getHexFromEvent(e);
      if (!hex) return;
      const key = hexKey(hex.col, hex.row);
      if (assignedHexMapRef.current.has(key)) return;
      if (dragVisitedRef.current.has(key)) return;

      dragVisitedRef.current.add(key);

      setSelectedHexes((prev) => {
        const next = new Set(prev);
        if (dragModeRef.current === "erase") next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [isDragging, getHexFromEvent]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragModeRef.current = null;
    dragVisitedRef.current = new Set();
  }, []);

  // ── Assign value ──────────────────────────────────────────────────
  const handleAssign = useCallback(() => {
    const val = parseFloat(inputValue);
    if (isNaN(val) || selectedHexes.size === 0) return;

    const colorIdx = groups.length % GROUP_COLORS.length;
    setGroups((prev) => [
      ...prev,
      {
        value: val,
        color: GROUP_COLORS[colorIdx],
        hexes: new Set(selectedHexes),
      },
    ]);
    setSelectedHexes(new Set());
    setInputValue("");
  }, [inputValue, selectedHexes, groups.length]);

  // ── Apply preset ──────────────────────────────────────────────────
  const handleApplyPreset = useCallback(() => {
    if (preset.type === "none") return;
    const bins = getDistributionBins(preset);
    if (bins.length === 0) return;

    const allocs = allocateHexes(bins, totalHexes);

    // Assign hexes in stable column-major order
    const newGroups: HexGroup[] = [];
    let hexIdx = 0;
    let colorIdx = 0;

    for (const alloc of allocs) {
      if (alloc.count === 0) continue;
      const groupHexes = new Set<string>();
      for (
        let j = 0;
        j < alloc.count && hexIdx < hexes.length;
        j++, hexIdx++
      ) {
        groupHexes.add(hexKey(hexes[hexIdx].col, hexes[hexIdx].row));
      }
      newGroups.push({
        value: alloc.value,
        color: GROUP_COLORS[colorIdx % GROUP_COLORS.length],
        hexes: groupHexes,
      });
      colorIdx++;
    }

    setGroups(newGroups);
    setSelectedHexes(new Set());
    setSampleCounts(new Map());
    setTotalSamples(0);
    setSampleDots([]);
    setIsSampling(false);
  }, [preset, totalHexes, hexes]);

  // ── Sampling — falling dots ────────────────────────────────────────
  const doSample = useCallback(() => {
    if (groups.length === 0) return;

    // Random landing position within grid content area
    const landX =
      contentLeft + Math.random() * (contentRight - contentLeft);
    const landY =
      contentTop + Math.random() * (contentBottom - contentTop);

    // Resolve to nearest hex (nearest-center tiebreak on borders)
    const hex = pixelToHex(
      landX,
      landY,
      HEX_SIZE,
      hexes,
      GRID_OFFSET_X,
      GRID_OFFSET_Y
    );
    if (!hex) return;

    const key = hexKey(hex.col, hex.row);
    const groupIdx = assignedHexMapRef.current.get(key);
    const isHit = groupIdx !== undefined;

    // Count only assigned-hex hits
    if (isHit) {
      const group = groups[groupIdx];
      setSampleCounts((prev) => {
        const next = new Map(prev);
        next.set(group.value, (next.get(group.value) ?? 0) + 1);
        return next;
      });
      setTotalSamples((prev) => prev + 1);
    }

    // Fall duration scales with depth so upper dots arrive sooner
    const fallDuration = 0.3 + 0.15 * (landY / gridH);

    const dotId = dotIdRef.current++;
    const dotColor = DOT_COLOR;

    const newDot: SampleDot = {
      id: dotId,
      x: landX,
      y: landY,
      color: dotColor,
      phase: "falling",
      isHit,
      fallDuration,
    };

    setSampleDots((prev) => [...prev.slice(-24), newDot]);

    if (isHit) {
      // Falling → landed → fading → remove
      setTimeout(() => {
        setSampleDots((prev) =>
          prev.map((d) =>
            d.id === dotId ? { ...d, phase: "landed" as const } : d
          )
        );
      }, fallDuration * 1000);

      setTimeout(() => {
        setSampleDots((prev) =>
          prev.map((d) =>
            d.id === dotId ? { ...d, phase: "fading" as const } : d
          )
        );
      }, (fallDuration + 0.3) * 1000);

      setTimeout(() => {
        setSampleDots((prev) => prev.filter((d) => d.id !== dotId));
      }, (fallDuration + 0.6) * 1000);
    } else {
      // Non-hits: fall then fade quickly
      setTimeout(() => {
        setSampleDots((prev) =>
          prev.map((d) =>
            d.id === dotId ? { ...d, phase: "fading" as const } : d
          )
        );
      }, fallDuration * 1000);

      setTimeout(() => {
        setSampleDots((prev) => prev.filter((d) => d.id !== dotId));
      }, (fallDuration + 0.25) * 1000);
    }
  }, [
    groups,
    hexes,
    contentLeft,
    contentRight,
    contentTop,
    contentBottom,
    gridH,
  ]);

  useEffect(() => {
    if (!isSampling) return;
    samplingRef.current = true;
    const interval = setInterval(() => {
      if (samplingRef.current) doSample();
    }, 180);
    return () => {
      clearInterval(interval);
      samplingRef.current = false;
    };
  }, [isSampling, doSample]);

  const handleStartSampling = useCallback(() => {
    const hasAssigned = groups.some((g) => g.hexes.size > 0);
    if (!hasAssigned) return;
    setIsSampling(true);
  }, [groups]);

  const handleStopSampling = useCallback(() => {
    setIsSampling(false);
  }, []);

  const handleReset = useCallback(() => {
    setIsSampling(false);
    setGroups([]);
    setSelectedHexes(new Set());
    setSampleCounts(new Map());
    setTotalSamples(0);
    setSampleDots([]);
    setInputValue("");
    setPreset((p) => ({ ...p, type: "none" }));
  }, []);

  // ── Computed ──────────────────────────────────────────────────────
  const assignedCount = groups.reduce((sum, g) => sum + g.hexes.size, 0);
  const unassignedCount = totalHexes - assignedCount;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="viz-layout">
      <div className="viz-container">
      {/* Left panel */}
      <div className="viz-panel-left">
        <div className="viz-section">
          <h2 className="viz-heading">Random Variable</h2>
          <p className="viz-description">
            Paint hexagons on the grid to select outcomes, then assign a numeric
            value. This defines a random variable on a uniform probability
            space.
          </p>
        </div>

        {/* ── Preset Distributions ─────────────────────────────────── */}
        <div className="viz-section viz-preset-section">
          <h3 className="viz-subheading">Preset Distributions</h3>
          <div className="viz-preset-controls">
            <Select
              value={preset.type}
              onValueChange={(val) =>
                setPreset((p) => ({
                  ...p,
                  type: val as PresetType,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Custom…</SelectItem>
                <SelectItem value="coin">Coin Toss (Bernoulli)</SelectItem>
                <SelectItem value="d6">Fair Die (d6)</SelectItem>
                <SelectItem value="binomial">Binomial</SelectItem>
                <SelectItem value="uniform">Discrete Uniform</SelectItem>
              </SelectContent>
            </Select>

            {preset.type === "binomial" && (
              <div className="viz-preset-params">
                <label className="viz-param-label">
                  n
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={preset.binN}
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        binN: Math.max(
                          1,
                          Math.min(20, parseInt(e.target.value) || 1)
                        ),
                      }))
                    }
                    className="viz-input viz-input-sm"
                  />
                </label>
                <label className="viz-param-label">
                  p
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={preset.binP}
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        binP: Math.max(
                          0,
                          Math.min(1, parseFloat(e.target.value) || 0)
                        ),
                      }))
                    }
                    className="viz-input viz-input-sm"
                  />
                </label>
              </div>
            )}

            {preset.type === "uniform" && (
              <div className="viz-preset-params">
                <label className="viz-param-label">
                  a
                  <input
                    type="number"
                    value={preset.uniA}
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        uniA: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="viz-input viz-input-sm"
                  />
                </label>
                <label className="viz-param-label">
                  b
                  <input
                    type="number"
                    value={preset.uniB}
                    onChange={(e) =>
                      setPreset((p) => ({
                        ...p,
                        uniB: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="viz-input viz-input-sm"
                  />
                </label>
              </div>
            )}

            {preset.type !== "none" && (
              <button
                onClick={handleApplyPreset}
                className="viz-btn viz-btn-assign"
                disabled={
                  preset.type === "uniform" && preset.uniA > preset.uniB
                }
              >
                Apply Preset
              </button>
            )}
          </div>
        </div>

        <LegendTable groups={groups} />

        {/* Unassigned hex info */}
        <div className="viz-hex-info">
          <span className="viz-hex-info-swatch viz-hex-unassigned" />
          <span>
            {unassignedCount} unassigned
            {selectedHexes.size > 0 && (
              <>
                {" "}
                · <strong>{selectedHexes.size} selected</strong>
              </>
            )}
          </span>
        </div>

        {/* Assignment controls */}
        <div className="viz-assign-controls">
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Value…"
            className="viz-input"
            disabled={selectedHexes.size === 0}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAssign();
            }}
          />
          <button
            onClick={handleAssign}
            className="viz-btn viz-btn-assign"
            disabled={
              selectedHexes.size === 0 ||
              inputValue === "" ||
              isNaN(parseFloat(inputValue))
            }
          >
            Assign Value
          </button>
        </div>

        {/* Sampling section */}
        <div className="viz-section viz-sample-section">
          <h3 className="viz-subheading">Sampling</h3>
          <p className="viz-description">
            Sample from the probability space to generate the empirical
            distribution of your random variable.
          </p>
          <div className="viz-sample-controls">
            {!isSampling ? (
              <button
                onClick={handleStartSampling}
                className="viz-btn viz-btn-sample"
                disabled={assignedCount === 0}
              >
                Sample Distribution
              </button>
            ) : (
              <button
                onClick={handleStopSampling}
                className="viz-btn viz-btn-pause"
              >
                Pause
              </button>
            )}
            <button onClick={handleReset} className="viz-btn viz-btn-reset">
              Reset
            </button>
            {totalSamples > 0 && (
              <span className="viz-sample-count">n = {totalSamples}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right panel — hex grid */}
      <div className="viz-panel-right">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${gridW} ${gridH}`}
          className="viz-hex-svg"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            {/* Circular glow — generous filter region prevents square clipping */}
            <filter
              id="dot-glow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
              filterUnits="objectBoundingBox"
            >
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {hexes.map((hex) => {
            const center = hexToPixel(hex.col, hex.row, HEX_SIZE);
            const cx = center.x + GRID_OFFSET_X;
            const cy = center.y + GRID_OFFSET_Y;
            const key = hexKey(hex.col, hex.row);
            const isSelected = selectedHexes.has(key);
            const groupIdx = assignedHexMap.get(key);
            const isAssigned = groupIdx !== undefined;
            const group = isAssigned ? groups[groupIdx] : null;

            let fill = "var(--hex-empty)";
            let strokeColor = "var(--hex-stroke)";
            let strokeW = 1;

            if (isAssigned && group) {
              fill = group.color;
              strokeColor = group.color;
              strokeW = 1.5;
            } else if (isSelected) {
              fill = "var(--hex-selected)";
              strokeColor = "var(--hex-selected-stroke)";
              strokeW = 2;
            }

            return (
              <polygon
                key={key}
                points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                fill={fill}
                stroke={strokeColor}
                strokeWidth={strokeW}
                className="viz-hex"
                data-col={hex.col}
                data-row={hex.row}
              />
            );
          })}

          {/* Falling sample dots */}
          {sampleDots.map((dot) => (
            <motion.circle
              key={dot.id}
              cx={dot.x}
              cy={dot.y}
              r={5}
              fill={dot.color}
              initial={{ y: -(dot.y - 5), opacity: 0.85 }}
              animate={{
                y: 0,
                opacity:
                  dot.phase === "fading"
                    ? 0
                    : 0.9,
              }}
              transition={{
                y: {
                  duration: dot.fallDuration,
                  ease: [0.42, 0, 1, 1],
                },
                opacity: {
                  duration: dot.phase === "fading" ? 0.25 : 0.15,
                },
              }}
              filter="url(#dot-glow)"
              className="viz-sample-dot"
            />
          ))}
        </svg>
      </div>
      </div>

      {/* Distribution chart — full width below grid */}
      <DistributionChart
        groups={groups}
        sampleCounts={sampleCounts}
        totalSamples={totalSamples}
      />
    </div>
  );
}
