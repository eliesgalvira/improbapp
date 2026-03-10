"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { hexCorners, hexKey, hexToPixel, pixelToHex, generateHexGrid } from "@/lib/hex";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HEX_COLS = 14;
const HEX_ROWS = 10;
const HEX_SIZE = 28;
const GRID_OFFSET_X = 40;
const GRID_OFFSET_Y = 40;
const BASE_SAMPLE_INTERVAL_MS = 180;

const DOT_COLOR = "#0a0a0a";
const GROUP_COLORS = [
  "#5ec4a8",
  "#a7d86e",
  "#f7e04b",
  "#e87ea1",
  "#9b8fef",
  "#6cc3e0",
  "#f5a755",
  "#f27e63",
];

const COLORS = {
  accent: "#2d6a4f",
  accentHover: "#1b4332",
  accentSoft: "#d8f3dc",
  bg: "#faf9f6",
  border: "#e4e0d8",
  emptyHex: "#f0ece4",
  emptyHexStroke: "#d8d2c6",
  muted: "#7a7468",
  panel: "#ffffff",
  panelRaised: "#f4f2ee",
  selectedHex: "#c8e6c9",
  selectedHexStroke: "#66bb6a",
  text: "#1a1a2e",
  textSecondary: "#544e44",
};

const cardClass =
  "rounded-[18px] border border-[#e4e0d8] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]";
const sectionClass = `${cardClass} p-4 sm:p-5`;
const headingClass =
  "mb-1.5 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#544e44]";
const subheadingClass =
  "mb-1 font-mono text-[0.8rem] font-bold uppercase tracking-[0.16em] text-[#544e44]";
const descriptionClass = "text-sm leading-6 text-[#7a7468]";
const inputClass =
  "min-w-0 font-mono text-sm text-[#1a1a2e] placeholder:text-[#7a7468] focus-visible:border-[#2d6a4f] focus-visible:ring-[#d8f3dc]";

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

type PresetType =
  | "none"
  | "coin"
  | "d6"
  | "binomial"
  | "uniform"
  | "gaussian";

interface PresetConfig {
  type: PresetType;
  binN: number;
  binP: number;
  gaussMean: number;
  gaussStdDev: number;
  uniA: number;
  uniB: number;
}

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
    case "gaussian": {
      const { gaussMean: mean, gaussStdDev: stdDev } = preset;
      if (stdDev <= 0) return [];

      const min = Math.floor(mean - 3 * stdDev);
      const max = Math.ceil(mean + 3 * stdDev);
      const weights = Array.from({ length: max - min + 1 }, (_, i) => {
        const value = min + i;
        const exponent = -((value - mean) ** 2) / (2 * stdDev ** 2);
        return { value, weight: Math.exp(exponent) };
      });
      const totalWeight = weights.reduce((sum, bin) => sum + bin.weight, 0);
      if (totalWeight === 0) return [];

      return weights.map(({ value, weight }) => ({
        value,
        prob: weight / totalWeight,
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
  const sorted = [...raw].sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remaining && i < sorted.length; i++) {
    sorted[i].count++;
  }

  return raw.map((r) => ({ value: r.value, count: r.count }));
}

function LegendTable({ groups }: { groups: HexGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#e4e0d8] bg-[#f4f2ee] px-4 py-4 text-sm leading-6 text-[#7a7468]">
        Paint hexagons on the grid, then assign a numeric value to define your
        random variable.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e4e0d8] bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#f4f2ee]">
            <th className="px-3 py-2 text-left font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#7a7468]">
              Color
            </th>
            <th className="px-3 py-2 text-left font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#7a7468]">
              Value
            </th>
            <th className="px-3 py-2 text-left font-mono text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#7a7468]">
              Hexes
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={`${group.value}-${group.color}`} className="border-t border-[#e4e0d8]">
              <td className="px-3 py-2.5">
                <span
                  className="inline-block h-[22px] w-[22px] rounded-[4px] align-middle shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
                  style={{ backgroundColor: group.color }}
                />
              </td>
              <td className="px-3 py-2.5 font-mono text-[0.95rem] font-bold text-[#1a1a2e]">
                {group.value}
              </td>
              <td className="px-3 py-2.5 text-[0.82rem] text-[#7a7468]">
                {group.hexes.size}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const values = groups.map((g) => g.value).sort((a, b) => a - b);
  const uniqueValues = groups.length > 0 ? [...new Set(values)] : [0];
  const isPlaceholder = groups.length === 0;
  const valueToColor = new Map(groups.map((group) => [group.value, group.color]));

  const maxFreq =
    isPlaceholder
      ? 1
      : totalSamples > 0
        ? Math.max(
            ...uniqueValues.map((value) => (sampleCounts.get(value) ?? 0) / totalSamples),
            0.05
          )
        : 1;

  const chartH = 180;
  const chartW = Math.max(uniqueValues.length * 72, 320);
  const barW = 40;
  const gap = 72;

  return (
    <div className={cn(sectionClass, "w-full min-w-0")}>
      <div className={headingClass}>Empirical Distribution</div>
      <svg
        width="100%"
        height={240}
        viewBox={`0 0 ${chartW + 48} ${chartH + 48}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full min-w-0 overflow-visible"
      >
        <line
          x1={36}
          y1={4}
          x2={36}
          y2={chartH + 4}
          stroke="currentColor"
          strokeWidth={1.5}
          opacity={0.3}
        />
        <line
          x1={36}
          y1={chartH + 4}
          x2={chartW + 44}
          y2={chartH + 4}
          stroke="currentColor"
          strokeWidth={1.5}
          opacity={0.3}
        />
        <text
          x={30}
          y={10}
          textAnchor="end"
          className="fill-[#7a7468] font-mono text-[10px]"
        >
          1.0
        </text>
        <text
          x={30}
          y={chartH / 2 + 4}
          textAnchor="end"
          className="fill-[#7a7468] font-mono text-[10px]"
        >
          0.5
        </text>
        <text
          x={30}
          y={chartH + 8}
          textAnchor="end"
          className="fill-[#7a7468] font-mono text-[10px]"
        >
          0.0
        </text>
        {uniqueValues.map((value, index) => {
          const count = sampleCounts.get(value) ?? 0;
          const freq = isPlaceholder ? 1 : totalSamples > 0 ? count / totalSamples : 0;
          const barH = (freq / Math.max(maxFreq, 1)) * chartH;
          const x = 44 + index * gap;

          return (
            <g key={value}>
              <rect
                x={x}
                y={chartH + 4 - barH}
                width={barW}
                height={Math.max(barH, 0)}
                fill={valueToColor.get(value) ?? COLORS.emptyHex}
                rx={3}
                opacity={isPlaceholder ? 1 : 0.88}
              />
              {!isPlaceholder && totalSamples > 0 && freq > 0.02 && (
                <text
                  x={x + barW / 2}
                  y={chartH - barH - 3}
                  textAnchor="middle"
                  className="fill-[#1a1a2e] font-mono text-[9px] font-bold"
                >
                  {freq.toFixed(2)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={chartH + 22}
                textAnchor="middle"
                className="fill-[#544e44] font-mono text-[11px] font-bold"
              >
                {value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RandomVariableViz() {
  const presetTypeId = useId();
  const assignValueId = useId();
  const assignHelpId = useId();
  const fallRateId = useId();
  const fallRateHelpId = useId();
  const binNId = useId();
  const binPId = useId();
  const gaussMeanId = useId();
  const gaussStdDevId = useId();
  const uniformAId = useId();
  const uniformBId = useId();
  const gaussianHelpId = useId();
  const uniformHelpId = useId();

  const hexes = useMemo(() => generateHexGrid(HEX_COLS, HEX_ROWS), []);
  const totalHexes = hexes.length;

  const [groups, setGroups] = useState<HexGroup[]>([]);
  const [selectedHexes, setSelectedHexes] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sampleCounts, setSampleCounts] = useState<Map<number, number>>(new Map());
  const [totalSamples, setTotalSamples] = useState(0);
  const [isSampling, setIsSampling] = useState(false);
  const [sampleDots, setSampleDots] = useState<SampleDot[]>([]);
  const [fallSpeed, setFallSpeed] = useState(1.5);
  const [preset, setPreset] = useState<PresetConfig>({
    type: "none",
    binN: 5,
    binP: 0.5,
    gaussMean: 0,
    gaussStdDev: 1,
    uniA: 1,
    uniB: 4,
  });
  const [presetInputText, setPresetInputText] = useState({
    binN: "5",
    binP: "0.5",
    gaussMean: "0",
    gaussStdDev: "1",
    uniA: "1",
    uniB: "4",
  });

  const samplingRef = useRef(false);
  const fallSpeedRef = useRef(fallSpeed);
  const dotIdRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragModeRef = useRef<"paint" | "erase" | null>(null);
  const dragVisitedRef = useRef<Set<string>>(new Set());
  const selectedHexesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedHexesRef.current = selectedHexes;
  }, [selectedHexes]);

  useEffect(() => {
    fallSpeedRef.current = fallSpeed;
  }, [fallSpeed]);

  const resetSamplingState = useCallback(() => {
    setSampleCounts(new Map());
    setTotalSamples(0);
    setSampleDots([]);
    setIsSampling(false);
  }, []);

  const assignedHexMap = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((group, index) => {
      group.hexes.forEach((hex) => map.set(hex, index));
    });
    return map;
  }, [groups]);

  const assignedHexMapRef = useRef(assignedHexMap);
  useEffect(() => {
    assignedHexMapRef.current = assignedHexMap;
  }, [assignedHexMap]);

  const gridW = GRID_OFFSET_X * 2 + HEX_SIZE * 1.5 * (HEX_COLS - 1);
  const gridH = GRID_OFFSET_Y * 2 + HEX_SIZE * Math.sqrt(3) * (HEX_ROWS - 1);
  const contentLeft = GRID_OFFSET_X;
  const contentRight = GRID_OFFSET_X + HEX_SIZE * 1.5 * (HEX_COLS - 1);
  const contentTop = GRID_OFFSET_Y;
  const contentBottom = GRID_OFFSET_Y + HEX_SIZE * Math.sqrt(3) * (HEX_ROWS - 1);

  const getHexFromEvent = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return null;

      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const px = (event.clientX - rect.left) * scaleX;
      const py = (event.clientY - rect.top) * scaleY;

      return pixelToHex(px, py, HEX_SIZE, hexes, GRID_OFFSET_X, GRID_OFFSET_Y);
    },
    [hexes]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const hex = getHexFromEvent(event);
      if (!hex) return;

      const key = hexKey(hex.col, hex.row);
      if (assignedHexMapRef.current.has(key)) return;

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
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging || !dragModeRef.current) return;

      const hex = getHexFromEvent(event);
      if (!hex) return;

      const key = hexKey(hex.col, hex.row);
      if (assignedHexMapRef.current.has(key) || dragVisitedRef.current.has(key)) return;

      dragVisitedRef.current.add(key);
      setSelectedHexes((prev) => {
        const next = new Set(prev);
        if (dragModeRef.current === "erase") next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [getHexFromEvent, isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragModeRef.current = null;
    dragVisitedRef.current = new Set();
  }, []);

  const handleAssign = useCallback(() => {
    const value = parseFloat(inputValue);
    if (Number.isNaN(value) || selectedHexes.size === 0) return;

    const colorIdx = groups.length % GROUP_COLORS.length;
    setGroups((prev) => [
      ...prev,
      {
        value,
        color: GROUP_COLORS[colorIdx],
        hexes: new Set(selectedHexes),
      },
    ]);
    setSelectedHexes(new Set());
    setInputValue("");
  }, [groups.length, inputValue, selectedHexes]);

  const handleApplyPreset = useCallback(() => {
    if (preset.type === "none") return;
    const bins = getDistributionBins(preset);
    if (bins.length === 0) return;

    const allocs = allocateHexes(bins, totalHexes);
    const nextGroups: HexGroup[] = [];
    let hexIdx = 0;
    let colorIdx = 0;

    for (const alloc of allocs) {
      if (alloc.count === 0) continue;

      const groupHexes = new Set<string>();
      for (let j = 0; j < alloc.count && hexIdx < hexes.length; j++, hexIdx++) {
        groupHexes.add(hexKey(hexes[hexIdx].col, hexes[hexIdx].row));
      }

      nextGroups.push({
        value: alloc.value,
        color: GROUP_COLORS[colorIdx % GROUP_COLORS.length],
        hexes: groupHexes,
      });
      colorIdx++;
    }

    setGroups(nextGroups);
    setSelectedHexes(new Set());
    resetSamplingState();
  }, [hexes, preset, resetSamplingState, totalHexes]);

  const doSample = useCallback(() => {
    if (groups.length === 0) return;

    const landX = contentLeft + Math.random() * (contentRight - contentLeft);
    const landY = contentTop + Math.random() * (contentBottom - contentTop);
    const hex = pixelToHex(landX, landY, HEX_SIZE, hexes, GRID_OFFSET_X, GRID_OFFSET_Y);
    if (!hex) return;

    const key = hexKey(hex.col, hex.row);
    const groupIdx = assignedHexMapRef.current.get(key);
    const isHit = groupIdx !== undefined;

    if (isHit) {
      const group = groups[groupIdx];
      setSampleCounts((prev) => {
        const next = new Map(prev);
        next.set(group.value, (next.get(group.value) ?? 0) + 1);
        return next;
      });
      setTotalSamples((prev) => prev + 1);
    }

    const fallDuration = (0.45 + 0.2 * (landY / gridH)) / fallSpeedRef.current;
    const dotId = dotIdRef.current++;
    const newDot: SampleDot = {
      id: dotId,
      x: landX,
      y: landY,
      color: DOT_COLOR,
      phase: "falling",
      isHit,
      fallDuration,
    };

    setSampleDots((prev) => [...prev.slice(-24), newDot]);

    if (isHit) {
      setTimeout(() => {
        setSampleDots((prev) =>
          prev.map((dot) => (dot.id === dotId ? { ...dot, phase: "landed" } : dot))
        );
      }, fallDuration * 1000);

      setTimeout(() => {
        setSampleDots((prev) =>
          prev.map((dot) => (dot.id === dotId ? { ...dot, phase: "fading" } : dot))
        );
      }, (fallDuration + 0.3) * 1000);

      setTimeout(() => {
        setSampleDots((prev) => prev.filter((dot) => dot.id !== dotId));
      }, (fallDuration + 0.6) * 1000);
    } else {
      setTimeout(() => {
        setSampleDots((prev) =>
          prev.map((dot) => (dot.id === dotId ? { ...dot, phase: "fading" } : dot))
        );
      }, fallDuration * 1000);

      setTimeout(() => {
        setSampleDots((prev) => prev.filter((dot) => dot.id !== dotId));
      }, (fallDuration + 0.25) * 1000);
    }
  }, [contentBottom, contentLeft, contentRight, contentTop, gridH, groups, hexes]);

  useEffect(() => {
    if (!isSampling) return;

    samplingRef.current = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (!samplingRef.current) return;
      doSample();
      timeoutId = setTimeout(
        scheduleNext,
        Math.max(45, BASE_SAMPLE_INTERVAL_MS / fallSpeedRef.current)
      );
    };

    timeoutId = setTimeout(
      scheduleNext,
      Math.max(45, BASE_SAMPLE_INTERVAL_MS / fallSpeedRef.current)
    );

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      samplingRef.current = false;
    };
  }, [doSample, isSampling]);

  const handleStartSampling = useCallback(() => {
    if (!groups.some((group) => group.hexes.size > 0)) return;
    setIsSampling(true);
  }, [groups]);

  const handleStopSampling = useCallback(() => {
    setIsSampling(false);
  }, []);

  const handleReset = useCallback(() => {
    setGroups([]);
    setSelectedHexes(new Set());
    resetSamplingState();
    setInputValue("");
    setPreset((prev) => ({ ...prev, type: "none" }));
    setPresetInputText({
      binN: "5",
      binP: "0.5",
      gaussMean: "0",
      gaussStdDev: "1",
      uniA: "1",
      uniB: "4",
    });
  }, [resetSamplingState]);

  const assignedCount = groups.reduce((sum, group) => sum + group.hexes.size, 0);
  const unassignedCount = totalHexes - assignedCount;
  const gaussianStdDevInvalid = preset.gaussStdDev <= 0;
  const uniformRangeInvalid = preset.uniA > preset.uniB;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className={sectionClass}>
            <h2 className={headingClass}>Random Variable</h2>
            <p className={descriptionClass}>
              Paint hexagons on the grid to select outcomes, then assign a numeric
              value. This defines a random variable on a uniform probability space.
            </p>
          </div>

          <div className={cn(sectionClass, "border-l-[3px] border-l-[#d8f3dc]")}>
            <h3 className={subheadingClass}>Preset Distributions</h3>
            <div className="mt-2 flex flex-col gap-2">
              <div className="space-y-2">
                <Label htmlFor={presetTypeId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                  Distribution Type
                </Label>
              </div>
              <Select
                value={preset.type}
                onValueChange={(value) =>
                  setPreset((prev) => ({ ...prev, type: value as PresetType }))
                }
              >
                <SelectTrigger
                  id={presetTypeId}
                  aria-label="Distribution type"
                  className="w-full border-[#e4e0d8] bg-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Custom…</SelectItem>
                  <SelectItem value="coin">Coin Toss (Bernoulli)</SelectItem>
                  <SelectItem value="d6">Fair Die (d6)</SelectItem>
                  <SelectItem value="binomial">Binomial</SelectItem>
                  <SelectItem value="gaussian">Discrete Gaussian</SelectItem>
                  <SelectItem value="uniform">Discrete Uniform</SelectItem>
                </SelectContent>
              </Select>

              {preset.type === "binomial" && (
                <fieldset className="grid gap-3 sm:grid-cols-2" aria-label="Binomial parameters">
                  <div className="space-y-2">
                    <Label htmlFor={binNId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                      n
                    </Label>
                    <Input
                      id={binNId}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      step={1}
                      value={presetInputText.binN}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPresetInputText((prev) => ({ ...prev, binN: next }));
                        if (next === "") return;
                        const parsed = parseInt(next, 10);
                        if (Number.isNaN(parsed)) return;
                        setPreset((prev) => ({
                          ...prev,
                          binN: Math.max(1, Math.min(20, parsed)),
                        }));
                      }}
                      onBlur={() =>
                        setPresetInputText((prev) => ({
                          ...prev,
                          binN: String(preset.binN),
                        }))
                      }
                      className={cn(inputClass, "h-9")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={binPId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                      p
                    </Label>
                    <Input
                      id={binPId}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={1}
                      step={0.05}
                      value={presetInputText.binP}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPresetInputText((prev) => ({ ...prev, binP: next }));
                        if (next === "") return;
                        const parsed = parseFloat(next);
                        if (Number.isNaN(parsed)) return;
                        setPreset((prev) => ({
                          ...prev,
                          binP: Math.max(0, Math.min(1, parsed)),
                        }));
                      }}
                      onBlur={() =>
                        setPresetInputText((prev) => ({
                          ...prev,
                          binP: String(preset.binP),
                        }))
                      }
                      className={cn(inputClass, "h-9")}
                    />
                  </div>
                </fieldset>
              )}

              {preset.type === "gaussian" && (
                <fieldset
                  className="grid gap-3 sm:grid-cols-2"
                  aria-describedby={gaussianHelpId}
                >
                  <div className="space-y-2">
                    <Label htmlFor={gaussMeanId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                      Mean μ
                    </Label>
                    <Input
                      id={gaussMeanId}
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      value={presetInputText.gaussMean}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPresetInputText((prev) => ({ ...prev, gaussMean: next }));
                        if (next === "" || next === "-") return;
                        const parsed = parseFloat(next);
                        if (Number.isNaN(parsed)) return;
                        setPreset((prev) => ({ ...prev, gaussMean: parsed }));
                      }}
                      onBlur={() =>
                        setPresetInputText((prev) => ({
                          ...prev,
                          gaussMean: String(preset.gaussMean),
                        }))
                      }
                      className={cn(inputClass, "h-9")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={gaussStdDevId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                      Std Dev σ
                    </Label>
                    <Input
                      id={gaussStdDevId}
                      type="number"
                      inputMode="decimal"
                      min={0.1}
                      step={0.1}
                      value={presetInputText.gaussStdDev}
                      aria-invalid={gaussianStdDevInvalid}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPresetInputText((prev) => ({ ...prev, gaussStdDev: next }));
                        if (next === "" || next === "-" || next === ".") return;
                        const parsed = parseFloat(next);
                        if (Number.isNaN(parsed)) return;
                        setPreset((prev) => ({ ...prev, gaussStdDev: parsed }));
                      }}
                      onBlur={() =>
                        setPresetInputText((prev) => ({
                          ...prev,
                          gaussStdDev: String(preset.gaussStdDev),
                        }))
                      }
                      className={cn(inputClass, "h-9")}
                    />
                  </div>
                  <p
                    id={gaussianHelpId}
                    className={cn(
                      "sm:col-span-2 text-sm",
                      gaussianStdDevInvalid ? "text-destructive" : "text-[#7a7468]"
                    )}
                  >
                    {gaussianStdDevInvalid
                      ? "The standard deviation must be greater than 0."
                      : "Assigns integer values over the range [μ - 3σ, μ + 3σ], normalized to a discrete Gaussian."}
                  </p>
                </fieldset>
              )}

              {preset.type === "uniform" && (
                <fieldset className="grid gap-3 sm:grid-cols-2" aria-describedby={uniformHelpId}>
                  <div className="space-y-2">
                    <Label htmlFor={uniformAId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                      Minimum a
                    </Label>
                    <Input
                      id={uniformAId}
                      type="number"
                      inputMode="numeric"
                      value={presetInputText.uniA}
                      aria-invalid={uniformRangeInvalid}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPresetInputText((prev) => ({ ...prev, uniA: next }));
                        if (next === "" || next === "-") return;
                        const parsed = parseInt(next, 10);
                        if (Number.isNaN(parsed)) return;
                        setPreset((prev) => ({ ...prev, uniA: parsed }));
                      }}
                      onBlur={() =>
                        setPresetInputText((prev) => ({
                          ...prev,
                          uniA: String(preset.uniA),
                        }))
                      }
                      className={cn(inputClass, "h-9")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={uniformBId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                      Maximum b
                    </Label>
                    <Input
                      id={uniformBId}
                      type="number"
                      inputMode="numeric"
                      value={presetInputText.uniB}
                      aria-invalid={uniformRangeInvalid}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPresetInputText((prev) => ({ ...prev, uniB: next }));
                        if (next === "" || next === "-") return;
                        const parsed = parseInt(next, 10);
                        if (Number.isNaN(parsed)) return;
                        setPreset((prev) => ({ ...prev, uniB: parsed }));
                      }}
                      onBlur={() =>
                        setPresetInputText((prev) => ({
                          ...prev,
                          uniB: String(preset.uniB),
                        }))
                      }
                      className={cn(inputClass, "h-9")}
                    />
                  </div>
                  <p
                    id={uniformHelpId}
                    className={cn(
                      "sm:col-span-2 text-sm",
                      uniformRangeInvalid ? "text-destructive" : "text-[#7a7468]"
                    )}
                  >
                    {uniformRangeInvalid
                      ? "The upper bound must be greater than or equal to the lower bound."
                      : "Define the inclusive integer range [a, b]."}
                  </p>
                </fieldset>
              )}

              {preset.type !== "none" && (
                <Button
                  onClick={handleApplyPreset}
                  type="button"
                  className="w-full rounded-[12px] bg-[#2d6a4f] text-white hover:bg-[#1b4332]"
                  disabled={gaussianStdDevInvalid || uniformRangeInvalid}
                >
                  Apply Preset
                </Button>
              )}
            </div>
          </div>

          <LegendTable groups={groups} />

          <div className="flex items-center gap-2 py-1 text-[0.82rem] text-[#7a7468]">
            <span
              className="inline-block h-[14px] w-[14px] rounded-[3px] shadow-[inset_0_0_0_1px_#d8d2c6]"
              style={{ backgroundColor: COLORS.emptyHex }}
            />
            <span>
              {unassignedCount} unassigned
              {selectedHexes.size > 0 && (
                <>
                  {" "}
                  · <strong className="font-semibold text-[#1a1a2e]">{selectedHexes.size} selected</strong>
                </>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-2 max-[1100px]:[&>*]:basis-full">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={assignValueId} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]">
                Assigned Value
              </Label>
              <Input
                id={assignValueId}
                type="number"
                inputMode="decimal"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Value…"
                aria-describedby={assignHelpId}
                className={inputClass}
                disabled={selectedHexes.size === 0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAssign();
                }}
              />
              <p id={assignHelpId} className="text-sm text-[#7a7468]">
                {selectedHexes.size === 0
                  ? "Select one or more hexagons to enable value assignment."
                  : `Assign a numeric value to ${selectedHexes.size} selected hexagon${selectedHexes.size === 1 ? "" : "s"}.`}
              </p>
            </div>
            <Button
              onClick={handleAssign}
              type="button"
              className="shrink-0 rounded-[12px] bg-[#2d6a4f] text-white hover:bg-[#1b4332]"
              disabled={
                selectedHexes.size === 0 ||
                inputValue === "" ||
                Number.isNaN(parseFloat(inputValue))
              }
            >
              Assign Value
            </Button>
          </div>
        </div>

        <div className={cn(cardClass, "min-w-0 p-4")}>
          <div className="rounded-[16px] border border-[#e4e0d8] bg-[linear-gradient(180deg,#fff_0%,#faf8f3_100%)] p-3">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${gridW} ${gridH}`}
              className="block h-auto w-full cursor-crosshair select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
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
                const group = groupIdx !== undefined ? groups[groupIdx] : null;

                let fill = COLORS.emptyHex;
                let strokeColor = COLORS.emptyHexStroke;
                let strokeWidth = 1;

                if (group) {
                  fill = group.color;
                  strokeColor = group.color;
                  strokeWidth = 1.5;
                } else if (isSelected) {
                  fill = COLORS.selectedHex;
                  strokeColor = COLORS.selectedHexStroke;
                  strokeWidth = 2;
                }

                return (
                  <polygon
                    key={key}
                    points={hexCorners(cx, cy, HEX_SIZE - 1.5)}
                    fill={fill}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    className="cursor-pointer transition-[fill,stroke,filter] duration-150 hover:brightness-95 motion-reduce:transition-none"
                    data-col={hex.col}
                    data-row={hex.row}
                  />
                );
              })}

              {sampleDots.map((dot) => (
                <motion.circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={5}
                  fill={dot.color}
                  initial={{ y: -(dot.y - 5), opacity: 0.85 }}
                  animate={{ y: 0, opacity: dot.phase === "fading" ? 0 : 0.9 }}
                  transition={{
                    y: { duration: dot.fallDuration, ease: [0.42, 0, 1, 1] },
                    opacity: { duration: dot.phase === "fading" ? 0.25 : 0.15 },
                  }}
                  filter="url(#dot-glow)"
                  className="pointer-events-none [transform-box:fill-box] [transform-origin:center]"
                />
              ))}
            </svg>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <div className="max-w-[340px] lg:max-w-none">
          <div className={cn(sectionClass, "h-full border-l-[3px] border-l-[#2d6a4f]")}>
            <h3 className={subheadingClass}>Sampling</h3>
            <p className={descriptionClass}>
              Sample from the probability space to generate the empirical distribution
              of your random variable.
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor={fallRateId}
                  className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[#544e44]"
                >
                  Fall Rate
                </Label>
                <span className="font-mono text-[0.78rem] text-[#7a7468]">
                  {fallSpeed.toFixed(1)}x
                </span>
              </div>
              <input
                id={fallRateId}
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={fallSpeed}
                aria-describedby={fallRateHelpId}
                onChange={(event) => setFallSpeed(parseFloat(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#d8f3dc] accent-[#2d6a4f]"
              />
              <p id={fallRateHelpId} className="text-sm text-[#7a7468]">
                Higher values make dots fall faster.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isSampling ? (
                <Button
                  onClick={handleStartSampling}
                  type="button"
                  className="rounded-[12px] bg-[#1a1a2e] text-[#faf9f6] hover:bg-[#2a2a3e]"
                  disabled={assignedCount === 0}
                >
                  Sample Distribution
                </Button>
              ) : (
                <Button
                  onClick={handleStopSampling}
                  type="button"
                  className="rounded-[12px] bg-[#e65100] text-white hover:bg-[#bf360c]"
                >
                  Pause
                </Button>
              )}
              <Button
                onClick={handleReset}
                type="button"
                variant="outline"
                className="rounded-[12px] border-[#e4e0d8] bg-[#f4f2ee] text-[#544e44] hover:border-[#d32f2f] hover:bg-[#ffebee] hover:text-[#d32f2f]"
              >
                Reset
              </Button>
              <span className="ml-auto min-w-max font-mono text-[0.78rem] text-[#7a7468] max-sm:w-full max-sm:ml-0">
                n = {totalSamples}
              </span>
            </div>
          </div>
        </div>

        <DistributionChart
          groups={groups}
          sampleCounts={sampleCounts}
          totalSamples={totalSamples}
        />
      </div>
    </div>
  );
}
