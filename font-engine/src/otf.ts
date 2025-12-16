// The Apple TrueType manual is a good reference: https://developer.apple.com/fonts/TrueType-Reference-Manual/
// since OpenType and TrueType share the same file format, different outline tables.

import {CharacterToGlyphIndex, CmapFormat4} from "./cmap";
import Cursor, * as parse from "./cursor";
import expect from "./expect";
import Glyph, {GlyphMetadata} from "./glyph";

export enum SupportedFormat {
  TrueType,
  OpenType,
}

interface Table {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

export const errors = {
  InvalidParsed: class InvalidParsed extends Error {},
  TableNotFound: class TableNotFound extends Error {},
  UnsupportedFormat: class UnsupportedFormat extends Error {}
}

export const parseScalarType = (scalar: number): SupportedFormat => {
  switch (scalar) {
    case 0x74727565:
    case 0x00010000:
      return SupportedFormat.TrueType;
    case 0x4f54544f:
      return SupportedFormat.OpenType;
    default:
      throw new errors.UnsupportedFormat("Font format not supported");
  }
};

export default class OpenType {
  cursor: Cursor;

  // Will be extended by TrueType.
  specificMetadata: {
    type: SupportedFormat;

    numTables: number;
    numGlyphs: number;

    unitsPerEm: number;
   
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };

  tables: {[k: string]: Table};
  mapping: CharacterToGlyphIndex;

  constructor(bytes: Uint8Array) {
    this.cursor = new Cursor(bytes, parse.Endian.big);
    this.tables = {};
    const metadata = {
      type: parseScalarType(this.cursor.nextUint32()),
      numTables: this.cursor.nextUint16()
    };

    this.cursor.skip(parse.WORD * 3);

    // The first thing we'll going to do is get the Offset Table.
    for (let i = 0; i < metadata.numTables; i++) {
      const tag = this.cursor.string(4);
      this.tables[tag] = {
        tag,
        checksum: this.cursor.nextUint32(),
        offset: this.cursor.nextUint32(),
        length: this.cursor.nextUint32()
      }
    }

    // Some tables we need to preprocess ahead of time:
    // * maxp, to get the number of glyphs in this file.
    // * cmap, for character to glyph index mappings.
    this.specificMetadata = {
      ...metadata,
      ...this.parseHead(),
      ...this.parseMaxp(),
    };

    this.mapping = this.parseCmap();
  }

  static nextFloat(cursor: Cursor) {
    // Apple docs: fixed is 32 bits, where the upper word is the signed integer part
    // and the lower word is the fractional part.
    const high = cursor.nextInt16();
    const low = cursor.nextUint16();
    return high + low / 0x10000;
  }

  get metadata() {
    return this.specificMetadata;
  }

  get isTTF() {
    return this.metadata.type === SupportedFormat.TrueType;
  }

  table(tag: string) {
    const table = this.tables[tag];
    expect(table, errors.TableNotFound);
    return {
      ...table,
      cursor: this.cursor.slice(table.length, table.offset)
    };
  }

  parseHead() {
    const {cursor} = this.table("head");

    // Skip version, font revision, checksum adjustment.
    cursor.skip(parse.DOUBLE_WORD * 3);

    const magicNumber = cursor.nextUint32();
    if (magicNumber !== 0x5f0f3cf5) throw new errors.UnsupportedFormat();

    // Skip flags.
    cursor.skip(parse.WORD);

    const unitsPerEm = cursor.nextUint16();

    // Skip time entries.
    cursor.skip(parse.QUAD_WORD * 2);

    // Min and max values for all glyph bounding boxes.
    const xMin = cursor.nextInt16();
    const yMin = cursor.nextInt16();
    const xMax = cursor.nextInt16();
    const yMax = cursor.nextInt16();

    // Skip macStyle, lowestRecPPEM, fontDirectionHint.
    cursor.skip(parse.WORD * 3);

    return {
      unitsPerEm,

      xMin,
      yMin,
      xMax,
      yMax,
    };
  }

  parseMaxp() {
    const {cursor} = this.table("maxp");
    // Skip version.
    cursor.skip(parse.DOUBLE_WORD);

    const numGlyphs = cursor.nextUint16();

    return {numGlyphs};
  }

  // Parse the cmap table, or character to glyph mapping. Basically, what index
  // of the proper table can this character be found?
  parseCmap(): CharacterToGlyphIndex {
    const {cursor} = this.table("cmap");
    // Skip version.
    cursor.skip(parse.WORD);

    let platformId;
    for (let subtables = cursor.nextUint16(); subtables > 0; subtables--) {
      platformId = cursor.nextUint16();
      if (platformId === 0)
        // Platform ID 0 indicates that this is the set of Unicode mappings.
        break;
      // Other platform IDs:
      // * 1: Macintosh encoding.
      // * 3: Microsoft encoding.
      // Ignoring legacy (1), 3 reliably maps down to Unicode if implemented.
    }

    if (platformId !== 0) 
      throw new errors.UnsupportedFormat("TODO: Mac and MS encoding platforms");

    // platformSpecificId, or Unicode version.
    cursor.skip(parse.WORD);
    const offset = cursor.nextUint32();

    // Skip to the offset!
    cursor.seek(offset);

    const format = cursor.nextUint16();
    switch (format) {
      case 4: 
        return new CmapFormat4(cursor);
      default:
        throw new errors.UnsupportedFormat(`TODO: Implement format = ${format}`);
    }
  }

  bearings(idx: number): GlyphMetadata["bearings"] {
    const bearings: GlyphMetadata["bearings"] = {
      lsb: 0,
      rsb: 0,

      tsb: 0,
      bsb: 0,
    };

    // Grab the bearings, skipping them if there is no table for that dimension
    // (i.e., no horizontal bearing for vertical CJK fonts).
    if ("hmtx" in this.tables) {
      const {cursor} = this.table("hmtx");
      cursor.skip(parse.DOUBLE_WORD * idx);
      const advanceWidth = cursor.nextUint16();
      bearings.lsb = cursor.nextInt16();
      bearings.rsb = advanceWidth - bearings.lsb;
    }

    if ("vmtx" in this.tables) {
      const {cursor} = this.table("vmtx");
      cursor.skip(parse.DOUBLE_WORD * idx);
      const advanceHeight = cursor.nextUint16();
      bearings.tsb = cursor.nextInt16();
      bearings.bsb = advanceHeight - bearings.tsb;
    }

    return bearings;
  }

  // More user facing I suppose.

  glyphFromIndex(idx: number): Glyph {
    throw new errors.UnsupportedFormat("TODO: glyphFromIndex for OTF");
  }

  glyph(codepoint: number): Glyph {
    throw new errors.UnsupportedFormat("TODO: glyph for OTF");
  }

  *glyphs() {
    // Stream of all the glyphs in this file.
    for (const idx of this.mapping.glyphIndexes()) {
      yield this.glyphFromIndex(idx);
    }
  }
}
