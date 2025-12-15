import OpenType, {errors} from "./otf";
import Cursor, * as parse from "./cursor";
import Glyph, {Contour, GlyphMetadata} from "./glyph";
import expect from "./expect";
import Curve, {QuadraticBezier} from "./curve";

export default class TrueType extends OpenType {
  extendedMetadata: {
    locaIsLong: boolean;
  };
  glyphOffsets: number[];

  constructor(bytes: Uint8Array) {
    super(bytes);

    // For TTF, we'll also need to parse:
    // * head for a TTF-specific value, whether glyph indexes in loca are u32 or
    //   u16 * 2 (second to last).
    // * loca for glyph index to actual glyph data (glyf) mappings.
    const {cursor: head} = this.table("head");
    head.seekEnd(parse.WORD * 2);
    this.extendedMetadata = {
      locaIsLong: head.nextUint16() === 1 ? true : false
    };

    this.glyphOffsets = this.parseLoca();
  }

  get metadata() {
    return {
      ...this.specificMetadata,
      ...this.extendedMetadata
    };
  }

  parseLoca() {
    const {cursor} = this.table("loca");
    const indices = [];
    for (let i = 0; i < this.metadata.numGlyphs + 1; i++) 
      indices.push(
        this.metadata.locaIsLong ? cursor.nextUint32() : cursor.nextUint16() * 2
      );
    return indices;
  }

  glyphFromIndex(idx: number): Glyph {
    const offset = this.glyphOffsets[idx];

    // TTF uses the glyf table.
    const glyf = this.table("glyf");
    const cursor = glyf.cursor.slice(glyf.length - offset, offset);

    const contours = cursor.nextInt16();

    const metadata: GlyphMetadata = {  
      bbox: {
        xMin: cursor.nextInt16(),
        yMin: cursor.nextInt16(),
        xMax: cursor.nextInt16(),
        yMax: cursor.nextInt16()
      },
      bearings: this.bearings(idx)
    };

    if (contours < 0) return new Glyph(parseCompoundOutline(this, cursor), metadata);
    return new Glyph(parseSimpleOutline(cursor, contours), metadata);
  }

  glyph(codepoint: number) {
    const idx = this.mapping.glyphIndex(codepoint);
    return this.glyphFromIndex(idx);
  }
}

// Given a cursor, parse and return an outline. Curves in TTF are represented as 
// quadratic bezier curves (we convert them to cubic beziers, you can access as 
// quadratic bezier afterwards - see `curve.ts`), and are encoded as so:

// Simple glyphs have a set of contour endpoints, followed by a set of flags, 
// followed by xy points that we can group into curves and then into contours.
export const parseSimpleOutline = (
  cursor: Cursor, 
  totalContours: number
): Glyph["outline"] => {
  interface Flag {
    // "On" curve or "off" curve.
    isControlPoint: boolean;

    // Byte size for x and y coordinates. Either 1 or 2.
    size: [number, number];

    // Attach a sign, e.g. positive or negative.
    sign: [number, number];

    // Delta doesn't change.
    repeat: [boolean, boolean];
  }

  const contourEndpoints: number[] = [];
  // Indexes for the end of each contour.
  for (let i = 0; i < totalContours; i++)
    contourEndpoints.push(cursor.nextUint16());

  // Skip instructions.
  const instructionLength = cursor.nextUint16();
  cursor.skip(instructionLength);

  // The total number of points.
  const points = contourEndpoints[totalContours - 1] + 1;

  // Parse flags for interpreting each point.
  const flags: Flag[] = [];
  for (let i = 0; i < points; i++) {
    const bits = expect(cursor.nextUint8(), errors.InvalidParsed);

    const isControlPoint = !(bits & 0x1);

    // Bits 2 and 3 tell us the byte size of x and y.
    const xSize = bits & 0x2 ? 1 : 2;
    const ySize = bits & 0x4 ? 1 : 2;

    let xSign = 1;
    let ySign = 1;

    let repeatX = false;
    let repeatY = false;

    // For bits 4 and 5:
    // * If xSize is 1, this bit describes the sign of the value.
    // * If xSize is 2 and this bit is set, current coord = previous coord.
    // * If xSize is 2 and this bit is not set, current coord is a signed 16-bit
    //   delta vector, that is, a delta to the previous point, or the default.
    if (xSize === 1 && !(bits & 0x10)) xSign = -1;
    else if (xSize === 2 && bits & 0x10) repeatX = true;
    if (ySize === 1 && !(bits & 0x20)) ySign = -1;
    else if (ySize === 2 && bits & 0x20) repeatY = true;

    const flag: Flag = {
      isControlPoint,
      size: [xSize, ySize],
      sign: [xSign, ySign],
      repeat: [repeatX, repeatY]
    };

    flags.push(flag);

    // The repeat bit, or how much times this flag gets repeated. This is indeed
    // separate from the flag repeat bits.
    if (!(bits & 0x8)) continue;

    const until = i + expect(cursor.nextUint8(), errors.InvalidParsed);
    for (; i < until; i++) flags.push(flag);
  }

  // Contours wrap around to the beginning point to close the curve.
  flags.push(flags[0]);

  // The first point is relative to (0, 0), and all points are relative to the point
  // before. The last point and first point implicitly join.
  //
  // We need to parse x and y separately since once comes after the other, then we 
  // can zip them.
  const nextPoint = (idx: number, axis: number, delta: number) => {
    const flag = flags[idx];
    if (flag.size[axis] === 1) {
      // Size is 1, therefore use sign.
      const coord =
        expect(cursor.nextUint8(), errors.InvalidParsed) * flag.sign[axis];
      return {...flag, coord: delta + coord};
    }

    // Size is 2, either the previous delta is repeated as normal or we offset.
    if (flag.repeat[axis]) return {...flag, coord: delta};
    const coord = cursor.nextInt16();
    return {...flag, coord: delta + coord};
  };

  const parsePoints = (axis: number) => {
    const outline = [];
    // Delta, since all the points are relative to the previous.
    let delta = 0;
    let start = 0;

    for (const endpoint of contourEndpoints) {
      const contour = [];
      for (let i = start; i <= endpoint; i++) {
        const point = nextPoint(i, axis, delta);
        contour.push(point.coord);
        delta = point.coord;
      }
      outline.push(contour);
      start = endpoint + 1;
    }

    // At this point, these aren't quite fully-formed quadratic Beziers yet, just 
    // a number[][]. Lists of points, in other words.
    return outline;
  };

  // A contour represents a closed loop made by Bezier curves. Right now there are 
  // really just individual points in a contour that we need to organize into curves.
  const xContours = parsePoints(0);
  const yContours = parsePoints(1);

  const outline: Glyph["outline"] = [];

  const nextCurveSet = (
    start: number, 
    offset: number,
    xPoints: number[],
    yPoints: number[],
  ): [number, Curve[]] => {
    // The way we parse the curves ensures this is always on-point.
    const p0 = [xPoints[offset], yPoints[offset]] as [number, number];

    const p1 = [xPoints[++offset], yPoints[offset]] as [number, number];
    const {isControlPoint: p1IsControlPoint} = flags[start + offset];
  
    if (!p1IsControlPoint) 
      // Straight line, on-on.
      return [offset, [Curve.fromQuadraticBezier(
        [
          p0, 
          p1, 
          [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
        ]
      )]];

    const p2 = [xPoints[++offset], yPoints[offset]] as [number, number];
    const {isControlPoint: p2IsControlPoint} = flags[start + offset];

    if (!p2IsControlPoint) 
      // Explicit curve, on-off-on.
      return [offset, [Curve.fromQuadraticBezier([p0, p2, p1])]];

    // On-off-off...-on.
    const controlPoints = [p1, p2];
    do {
      const px = xPoints[++offset];
      const py = yPoints[offset];
      controlPoints.push([px, py]);
    } while (flags[start + offset].isControlPoint);

    // Now we'll take our control points and use their midpoint to create the implicit
    // quadratic Beziers.
    const curves: Curve[] = [];
    let prevOnPoint = p0;
    for (let k = 1; k < controlPoints.length; k++) {
      // These are out off-points, meaning there is an implicit on-curve point linking
      // back to `prevOnPoint`. e.g. we start with two on-curve points, `p0` in the
      // outer scope and the midpoint between the current control point and the previous
      // one.
      const p1 = controlPoints[k];
      const p0 = controlPoints[k - 1];
      const midpoint = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2] as [number, number];
      curves.push(Curve.fromQuadraticBezier([prevOnPoint, midpoint, p0]));
      prevOnPoint = midpoint;
    }

    // Last but not least, join the last off-point to our first point.
    curves.push(Curve.fromQuadraticBezier(
      [prevOnPoint, p0, controlPoints[controlPoints.length - 1]]
    ));

    return [offset, curves];
  };

  // Let's do some processing on the points now, and zip the two axes together.
  // I just realized that entries can potentially wrap around to the beginning,
  // especially for the on-off-off...-on pattern (multiple off points in a row,
  // representing implicit quadratic Beziers.)
  for (const [i, xPoints] of xContours.entries()) {
    const contour: Contour = [];
    const yPoints = yContours[i];

    // Connect the first and last points.
    const numPoints = xPoints.length;
    xPoints.push(xPoints[0]);
    yPoints.push(yPoints[0]);

    // Start index, so we can offset from it.
    const start = (contourEndpoints[i - 1] ?? -1) + 1;
    for (let j = 0; j < numPoints;) {
      const [offset, curveSet] = nextCurveSet(start, j, xPoints, yPoints);
      contour.push(...curveSet);
      j = offset;
    }
    outline.push(contour);
  }

  return outline;
}

// Compound glyphs are glyphs that combine two glyphs via a set of transformations,
// e.g. a vs ä, thus making this recursive.
const parseCompoundOutline = (ttf: TrueType, cursor: Cursor): Glyph["outline"] => {
  enum Transformation {
    // No extra transformation entry.
    None = 0,
    // Scale x and y by the same value.
    Entry1 = 1,
    // Scale x and y scale value separately.
    Entry2 = 2,
    // 2 by 2 scale, that is matrix that allows for transformation + translation.
    Entry3 = 3,
  }

  interface Flag {
    // At least one more component follows this one (which is why we don't need a 
    // `totalContours` here).
    more: boolean;
    // Size of args. Either 1 or 2.
    size: number;

    instructions: boolean;
    // Components of this glyph overlap.
    overlap: boolean;
    // Use this flag for overall glyph calculations, i.e. advance/bearing/etc.
    inherit: boolean;

    // xy values vs. points.
    xy: boolean;
    // If xy === true, this determines if we should round xy values to grid.
    roundXY: boolean;

    // Let's start the scale with the default [1, 1].
    scale: [number, number];

    transformation: Transformation;
  }

  const parseFlag = (bits: number): Flag => {
    let transformation = Transformation.None;
    // WE_HAVE_A_SCALE
    if ((bits & 0x8) !== 0) transformation = Transformation.Entry1;
    // WE_HAVE_AN_X_AND_Y_SCALE
    if ((bits & 0x40) !== 0) transformation = Transformation.Entry2;
    // WE_HAVE_A_TWO_BY_TWO
    if ((bits & 0x80) !== 0) transformation = Transformation.Entry3;

    return {
      more: (bits & 0x20) !== 0,
      size: bits & 0x1 ? 2 : 1,

      instructions: (bits & 0x100) !== 0,
      overlap: (bits & 0x400) !== 0,
      inherit: (bits & 0x200) !== 0,

      xy: (bits & 0x2) !== 0,
      roundXY: (bits & 0x4) !== 0,

      scale: [1, 1],

      transformation
    };
  };

  const outline: Glyph["outline"] = [];

  for (;;) {
    const flag = parseFlag(cursor.nextUint16());

    if (!flag.xy) throw new errors.UnsupportedFormat("TODO: ARGS_ARE_XY_VALUES flag");

    // Since this glyph is actually a compound of 2+ glyphs we'll need to grab those.
    const glyphIndex = cursor.nextUint16();
    const dx = 
      flag.size === 2
        ? cursor.nextUint16()
        : expect(cursor.nextUint8(), errors.InvalidParsed);
    const dy =
      flag.size === 2
        ? cursor.nextUint16()
        : expect(cursor.nextUint8(), errors.InvalidParsed);

    switch (flag.transformation) {
      case Transformation.Entry1:
      case Transformation.Entry2:
      case Transformation.Entry3:
        throw new errors.UnsupportedFormat("TODO: Transformations for TTF");
    }

    const glyph = ttf.glyphFromIndex(glyphIndex);
    for (const contour of glyph.outline) {
      // Translate each contour by `dx` and `dy`.
      const compoundContour: Contour = contour.map(
        curve => curve.translate(dx, dy)
      );
      outline.push(compoundContour);
    }

    if (!flag.more) break;
  }

  return outline;
};
