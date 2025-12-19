// Represents a page.

import fontEngine, { type CodepointRange } from "font-engine";
import GlyphNode from "./glyph";
import blocks from "../include/blocks";

// Given a font, compile a set of pages.
// This will allow us to generate arbitrary sets of pages based on glyphs.
type PageFilter = (font: typeof fontEngine.Font) => Page[];

export default class Page {
  glyphs: GlyphNode[];

  page: PageNode;

  constructor(page: PageNode) {
    this.glyphs = [];
    this.page = page;
  }
}

// The default page filter.
export const pagesFromBlocks = (font: typeof fontEngine.Font) => {};
