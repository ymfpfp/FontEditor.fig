// Keep an in-memory glyph representation (i.e. `Glyph`) up to date with a visual
// representation.

import Glyph from "font-engine/dist/glyph";
import { Mutable } from "./types";

export default class GlyphNode {
  glyph: Glyph;
  // In-house representation. The way Figma works is - I'm assuming a proxy that
  // requires a change to the entire value.
  network: Mutable<VectorNetwork>;

  constructor(initial: Glyph) {
    this.glyph = initial;
    this.network = {
      vertices: [],
      segments: [],
      regions: []
    };
  }

  async render(x: number, y: number) {}
}
