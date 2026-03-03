"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  generateHexGrid,
  hexToPixel,
  hexCorners,
  pixelToHex,
  hexKey,
  type HexCoord,
} from "@/lib/hex";

// ── Configuration ─────────────────────────────────────────────────────
const HEX_COLS = 14;
const HEX_ROWS = 10;
const HEX_SIZE = 28;
const GRID_OFFSET_X = 40;
const GRID_OFFSET_Y = 40;

// Group colors — warm, distinctive palette matching screenshot vibe
const GROUP_COLORS = [
  "#5ec4a8", // teal/mint
  "#a7d86e", // lime green
  "#f7e04b", // bright yellow
  "#f5a755", // warm orange
  "#e87ea1", // rose pink
  "#9b8fef", // lavender
  "#6cc3e0", // sky blue
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
  opacity: number;
}

// ── Sub-components ────────────────────────────────────────────────────

function LegendTable({
  groups,
}: {
  groups: HexGroup[];
}) {
  if (groups.length === 0) {
    return (
      <div className="viz-legend-empty">
        <p>Paint hexagons on the grid, then assign a numeric value to define your random variable.</p>
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

  const maxFreq = totalSamples > 0
    ? Math.max(...uniqueValues.map((v) => (sampleCounts.get(v) ?? 0) / totalSamples), 0.05)
    : 1;

  const chartH = 140;
  const chartW = Math.max(uniqueValues.length * 56, 200);
  const barW = 32;
  const gap = 56;

  return (
    <div className="viz-chart-wrap">
      <div className="viz-chart-label">Empirical Distribution</div>
      <svg
        width={chartW + 48}
        height={chartH + 40}
        viewBox={`0 0 ${chartW + 48} ${chartH + 40}`}
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
        <text x={30} y={chartH + 8} textAnchor="end" className="viz-chart-text">
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
  const hexes = useRef(generateHexGrid(HEX_COLS, HEX_ROWS)).current;
  const totalHexes = hexes.length;

  // State
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

  // Compute assigned hex lookup
  const assignedHexMap = useRef(new Map<string, number>());
  useEffect(() => {
    const map = new Map<string, number>();
    groups.forEach((g, idx) => {
      g.hexes.forEach((h) => map.set(h, idx));
    });
    assignedHexMap.current = map;
  }, [groups]);

  // Grid dimensions
  const gridW =
    HEX_SIZE * 1.5 * (HEX_COLS - 1) + HEX_SIZE * 2 + GRID_OFFSET_X * 2;
  const gridH =
    HEX_SIZE * Math.sqrt(3) * HEX_ROWS + GRID_OFFSET_Y * 2;

  // ── Hex interaction ───────────────────────────────────────────────
  const getHexFromEvent = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      return pixelToHex(px, py, HEX_SIZE, hexes, GRID_OFFSET_X, GRID_OFFSET_Y);
    },
    [hexes]
  );

  const toggleHex = useCallback(
    (hex: HexCoord) => {
      const key = hexKey(hex.col, hex.row);
      // Don't select already-assigned hexes
      if (assignedHexMap.current.has(key)) return;
      setSelectedHexes((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const hex = getHexFromEvent(e);
      if (hex) {
        setIsDragging(true);
        toggleHex(hex);
      }
    },
    [getHexFromEvent, toggleHex]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging) return;
      const hex = getHexFromEvent(e);
      if (hex) {
        const key = hexKey(hex.col, hex.row);
        if (!assignedHexMap.current.has(key)) {
          setSelectedHexes((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        }
      }
    },
    [isDragging, getHexFromEvent]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
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

  // ── Sampling ──────────────────────────────────────────────────────
  const assignedHexList = useCallback(() => {
    const list: { key: string; groupIdx: number }[] = [];
    groups.forEach((g, idx) => {
      g.hexes.forEach((h) => list.push({ key: h, groupIdx: idx }));
    });
    return list;
  }, [groups]);

  const doSample = useCallback(() => {
    const assigned = assignedHexList();
    if (assigned.length === 0) return;

    const pick = assigned[Math.floor(Math.random() * assigned.length)];
    const group = groups[pick.groupIdx];
    const [colStr, rowStr] = pick.key.split(",");
    const col = parseInt(colStr);
    const row = parseInt(rowStr);
    const center = hexToPixel(col, row, HEX_SIZE);

    // Update counts
    setSampleCounts((prev) => {
      const next = new Map(prev);
      next.set(group.value, (next.get(group.value) ?? 0) + 1);
      return next;
    });
    setTotalSamples((prev) => prev + 1);

    // Add a visible dot
    const dotId = dotIdRef.current++;
    const newDot: SampleDot = {
      id: dotId,
      x: center.x + GRID_OFFSET_X,
      y: center.y + GRID_OFFSET_Y,
      color: group.color,
      opacity: 1,
    };
    setSampleDots((prev) => [...prev.slice(-30), newDot]);

    // Fade out after some time
    setTimeout(() => {
      setSampleDots((prev) =>
        prev.map((d) => (d.id === dotId ? { ...d, opacity: 0 } : d))
      );
    }, 600);
    setTimeout(() => {
      setSampleDots((prev) => prev.filter((d) => d.id !== dotId));
    }, 1000);
  }, [groups, assignedHexList]);

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
    if (assignedHexList().length === 0) return;
    setIsSampling(true);
  }, [assignedHexList]);

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
  }, []);

  // ── Unassigned count ──────────────────────────────────────────────
  const assignedCount = groups.reduce((sum, g) => sum + g.hexes.size, 0);
  const unassignedCount = totalHexes - assignedCount;

  return (
    <div className="viz-container">
      {/* Left panel */}
      <div className="viz-panel-left">
        <div className="viz-section">
          <h2 className="viz-heading">Random Variable</h2>
          <p className="viz-description">
            Paint hexagons on the grid to select outcomes, then assign a numeric
            value. This defines a random variable on a uniform probability space.
          </p>
        </div>

        <LegendTable groups={groups} />

        {/* Unassigned hex info */}
        <div className="viz-hex-info">
          <span className="viz-hex-info-swatch viz-hex-unassigned" />
          <span>
            {unassignedCount} unassigned
            {selectedHexes.size > 0 && (
              <> · <strong>{selectedHexes.size} selected</strong></>
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
              selectedHexes.size === 0 || inputValue === "" || isNaN(parseFloat(inputValue))
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
              <span className="viz-sample-count">
                n = {totalSamples}
              </span>
            )}
          </div>
        </div>

        <DistributionChart
          groups={groups}
          sampleCounts={sampleCounts}
          totalSamples={totalSamples}
        />
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
          {/* Grid pattern background */}
          <defs>
            <filter id="hex-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
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
            const groupIdx = assignedHexMap.current.get(key);
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

          {/* Sample dots */}
          {sampleDots.map((dot) => (
            <circle
              key={dot.id}
              cx={dot.x}
              cy={dot.y}
              r={6}
              fill="#1a1a2e"
              opacity={dot.opacity}
              className="viz-sample-dot"
              filter="url(#hex-glow)"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
