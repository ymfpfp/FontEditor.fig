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

  // get advance() {}
}
