// Represent a curve, and operations.

// Keep a generic so we can also perform single-axis operations.
export type QuadraticBezier<T> = [T, T, T];
export type CubicBezier<T> = [T, T, T, T];

export type QuadraticBezierCurve = QuadraticBezier<[number, number]>;
export type CubicBezierCurve = CubicBezier<[number, number]>;

// 2d curve.
export default class Curve {
  curve: CubicBezierCurve;

  constructor(curve: CubicBezierCurve) {
    this.curve = curve;
  }

  get curvePoints() {
    return this.curve.slice(0, 2);
  }

  get controlPoints() {
    return this.curve.slice(1);
  }

  // TODO
  // get asQuadraticBezier() {}

  static fromQuadraticBezier(curve: QuadraticBezierCurve) {
    // Convert to a cubic bezier.
    // See: https://fontforge.org/docs/techref/bezier.html#converting-truetype-to-postscript
    const controlPoint = (
      start: [number, number], 
      end: [number, number]
    ) => 
      start.map(axis => axis + (2 / 3) * (end[axis] - axis)) as [number, number];
    return new Curve(
      [
        curve[0],
        curve[1],
        controlPoint(curve[0], curve[2]),
        controlPoint(curve[2], curve[1])
      ]
    );
  }

  translate(dx: number, dy: number) {
    return new Curve(this.curve.map(p => [p[0] + dx, p[1] + dy]) as CubicBezierCurve);
  }
}
