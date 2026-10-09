export type PdfRect = [number, number, number, number];

/** PDF user-space corners transformed by the renderer's zoomed/rotated viewport. */
export function viewportRect(
  viewport: { convertToViewportPoint(x: number, y: number): number[] },
  rect: PdfRect,
) {
  const [x0, y0] = viewport.convertToViewportPoint(rect[0], rect[1]);
  const [x1, y1] = viewport.convertToViewportPoint(rect[2], rect[3]);
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}
