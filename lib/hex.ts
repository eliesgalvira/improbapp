// Hex grid geometry utilities for flat-top hexagons

export interface HexCoord {
  col: number;
  row: number;
}

export interface HexPixel {
  x: number;
  y: number;
}

/**
 * Convert axial hex coordinates to pixel center for flat-top hexagons.
 * For flat-top: x = size * 3/2 * col, y = size * sqrt(3) * (row + 0.5 * (col & 1))
 */
export function hexToPixel(col: number, row: number, size: number): HexPixel {
  const x = Math.round(size * 1.5 * col * 100) / 100;
  const y = Math.round(size * Math.sqrt(3) * (row + 0.5 * (col % 2)) * 100) / 100;
  return { x, y };
}

/**
 * Get the 6 corner points of a flat-top hexagon centered at (cx, cy).
 */
export function hexCorners(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const px = Math.round((cx + size * Math.cos(angle)) * 100) / 100;
    const py = Math.round((cy + size * Math.sin(angle)) * 100) / 100;
    points.push(`${px},${py}`);
  }
  return points.join(" ");
}

/**
 * Generate a grid of hex coordinates.
 */
export function generateHexGrid(cols: number, rows: number): HexCoord[] {
  const coords: HexCoord[] = [];
  for (let c = 0; c < cols; c++) {
    const rowCount = c % 2 === 0 ? rows : rows - 1;
    for (let r = 0; r < rowCount; r++) {
      coords.push({ col: c, row: r });
    }
  }
  return coords;
}

/**
 * Find which hex a pixel point falls in (approximate — checks nearest center).
 */
export function pixelToHex(
  px: number,
  py: number,
  size: number,
  hexes: HexCoord[],
  offsetX: number,
  offsetY: number
): HexCoord | null {
  let nearest: HexCoord | null = null;
  let minDist = Infinity;
  for (const hex of hexes) {
    const center = hexToPixel(hex.col, hex.row, size);
    const dx = px - (center.x + offsetX);
    const dy = py - (center.y + offsetY);
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      nearest = hex;
    }
  }
  // Only return if within hex radius
  if (nearest && minDist < size * size) {
    return nearest;
  }
  return null;
}

export function hexKey(col: number, row: number): string {
  return `${col},${row}`;
}
