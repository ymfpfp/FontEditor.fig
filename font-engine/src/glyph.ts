import Curve from "./curve";

// Representation of a glyph.
export type Contour = Curve[];

export type GlyphMetadata = {
  bbox: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  bearings: {
    lsb: number;
    rsb: number;

    tsb: number;
    bsb: number;
  };
};

export default class Glyph {
  outline: Contour[];
  metadata: GlyphMetadata;

  constructor(outline: Contour[], metadata: GlyphMetadata) {
    this.outline = outline;
    this.metadata = metadata;
  }

  // Return a new glyph that's a copy of this one but entirely positive.
  positive() {
    const outline = this.outline.map((contour) => {
      return contour.map((curve) => {
        const translated = curve.translate(
          Math.abs(this.metadata.bbox.xMin),
          Math.abs(this.metadata.bbox.yMin)
        );
        return translated;
      });
    });
    return new Glyph(outline, {
      ...this.metadata,
      bbox: {
        ...this.metadata.bbox,
        xMin: 0,
        yMin: 0
      }
    });
  }

  // get advance() {}
}
