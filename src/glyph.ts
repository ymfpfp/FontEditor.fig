// Keep an in-memory glyph representation (i.e. `Glyph`) up to date with a visual
// representation.

import Glyph from "font-engine/dist/glyph";
import { Mutable } from "./types";

export default class GlyphNode {
  glyph: Glyph;
  codepoint: number;
  // In-house representation. The way Figma works is - I'm assuming a proxy that
  // requires a change to the entire value.
  network: Mutable<VectorNetwork>;

  constructor(initial: Glyph, codepoint: number) {
    this.glyph = initial.positive();
    this.codepoint = codepoint;
    this.network = {
      vertices: [],
      segments: []
    };
  }

  // Construct all the curves. Completely overwrites `this.network`, so ideally this
  // is a first-time call.
  construct() {
    const nw: Mutable<VectorNetwork> = {
      vertices: [],
      segments: []
    };

    for (const contour of this.glyph.outline) {
      for (const [i, curve] of contour.entries()) {
        let [p0, p1, tangentStart, tangentEnd] = curve.asXY;

        // tangentStart is relative to p0, and tangentEnd is relative to p1.
        tangentStart.x -= p0.x;
        tangentStart.y -= p0.y;
        tangentEnd.x -= p1.x;
        tangentEnd.y -= p1.y;

        if (i === 0) nw.vertices.push(p0);
        nw.vertices.push(p1);

        const l = nw.vertices.length - 1;

        nw.segments.push({
          start: l - 1,
          end: l,
          tangentStart,
          tangentEnd
        });
      }
    }

    this.network = nw;

    // TODO: And now let's create a card to show metadata about this.
  }

  // TODO: We need to somehow be able to add and remove event listeners from here.

  async render(x: number, y: number, track: boolean = false) {
    const outline = figma.createVector();
    outline.name = String.fromCodePoint(this.codepoint);
    outline.x = x;
    outline.y = y;

    await outline.setVectorNetworkAsync(this.network);

    // TODO: Set options.
    outline.strokes = [
      {
        type: "SOLID",
        color: { r: 0, g: 0, b: 0 }
      }
    ];
    outline.strokeWeight = 1;

    figma.currentPage.appendChild(outline);

    return outline;
  }
}
