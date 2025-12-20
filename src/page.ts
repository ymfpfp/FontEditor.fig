// Represents a page.

import fontEngine, { type Font, type CodepointRange } from "font-engine";
import GlyphNode from "./glyph";
import parseBlock, { blocks } from "../include/blocks";
import versions, { type Version } from "../include/versions";

// What should be on each page? Creating pages + filtering pages.
type PageOrganizer = {
  create: (font: Font) => { [k: string]: Page };
  filter: (font: Font, page: Page) => Generator<GlyphNode, void, unknown>;
};

type PageMetadata = {
  // Store the last version that was able to parse this page.
  lastVersion: Version;
  type: "edit" | "preview";

  // Be able to track if some, or all, of this page needs re-rendering.
  dirty: boolean;
} & { [k: string]: any };

export const defaultPageMetadata: PageMetadata = {
  lastVersion: versions.current,
  type: "edit",

  dirty: true
};

export default class Page {
  glyphs: GlyphNode[];

  page: PageNode;
  _metadata: PageMetadata;

  constructor(page: PageNode, glyphs: GlyphNode[] = []) {
    this.glyphs = glyphs;

    const keys = page.getPluginDataKeys();

    this.page = page;
    if ("fontEditorMetadata" in keys)
      this.metadata = Object.assign(
        defaultPageMetadata,
        JSON.parse(page.getPluginData("fontEditorMetadata"))
      );
    else
      this.metadata = {
        lastVersion: versions.current,
        type: "edit",

        dirty: true
      };
  }

  static create(name: string, glyphs: GlyphNode[]) {
    const page = figma.createPage();
    page.name = name;
    return new Page(page, glyphs);
  }

  // From an existing page.
  static from(node: PageNode) {
    const page = new Page(node, []);
    if (page.metadata.dirty) page.construct();
    return page;
  }

  get metadata() {
    return this._metadata;
  }

  // Wouldn't be surprised if this is what Figma does for node object data, hence why
  // you need to mutate the entire object.
  set metadata(metadata: PageMetadata) {
    // Make sure to set it on Figma's `PageNode` as well.
    this._metadata = metadata;
    this.page.setPluginData("fontEditorMetadata", JSON.stringify(metadata));
  }

  set dirty(bit: boolean) {
    this.metadata = Object.assign(this.metadata, { dirty: bit });
  }

  // "Stream" in the nodes for this page.
  construct(maxNodes: number = 0) {}
}

export const byRange: PageOrganizer = {
  create: (font: Font) => {
    const pages: { [k: string]: Page } = {};
    const ranges = parseBlock(blocks[versions.current.ucd]);
    for (const [_, codepoint] of font.codepoints()) {
      // TODO: Perform binary search maybe?
      for (const [start, end, name] of ranges) {
        if (pages[name]) continue;
        if (codepoint >= start && codepoint < end) {
          pages[name] = Page.create(name, []);
        }
      }
    }
    return pages;
  },
  filter: function* (font: Font, page: Page) {
    let pageRange: CodepointRange = [0, 0];

    const ranges = parseBlock(blocks[versions.current.ucd]);
    // a. What range does this page belong to?
    // b. Yield all codepoints -> glyphs in that range.
    for (const [start, end, name] of ranges) {
      if (name === page.page.name) {
        pageRange = [start, end];
        break;
      }
    }

    const [start, end] = pageRange;
    for (const [_, codepoint] of font.codepoints()) {
      if (codepoint >= start && codepoint < end) {
        const glyph = font.glyph(codepoint)!;
        yield new GlyphNode(glyph, codepoint);
      }
    }
  }
};
