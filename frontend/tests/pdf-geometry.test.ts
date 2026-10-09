import { expect, it } from "vitest";
import { viewportRect } from "../src/pdf-geometry";

it("preserves PDF bottom-left evidence through zoom and quarter-turn rotation", () => {
  const rect: [number, number, number, number] = [10, 20, 100, 35];
  // A 200 × 300 page, transformed like PDF.js viewports at 2× scale.
  const transforms = [
    (x: number, y: number) => [2 * x, 2 * (300 - y)],
    (x: number, y: number) => [2 * y, 2 * x],
    (x: number, y: number) => [2 * (200 - x), 2 * y],
    (x: number, y: number) => [2 * (300 - y), 2 * (200 - x)],
  ];
  const expected = [
    { left: 20, top: 530, width: 180, height: 30 },
    { left: 40, top: 20, width: 30, height: 180 },
    { left: 200, top: 40, width: 180, height: 30 },
    { left: 530, top: 200, width: 30, height: 180 },
  ];
  transforms.forEach((convertToViewportPoint, rotation) => {
    expect(viewportRect({ convertToViewportPoint }, rect)).toEqual(expected[rotation]);
  });
});
