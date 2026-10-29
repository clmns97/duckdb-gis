export interface Bbox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/** Extent of a GeoJSON coordinate array at any nesting depth (a Point's
 *  `[x, y]` … a MultiPolygon's `[[[[x, y]]]]`, or a list of geometries'). */
export function bboxOf(coords: unknown): Bbox {
  const b = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] !== "number") return (c as unknown[]).forEach(walk);
    const [x, y] = c as number[];
    b.xmin = Math.min(b.xmin, x);
    b.ymin = Math.min(b.ymin, y);
    b.xmax = Math.max(b.xmax, x);
    b.ymax = Math.max(b.ymax, y);
  };
  walk(coords);
  return b;
}
