import Cursor, * as parse from "./cursor";
import {errors} from "./otf";
import {NOTDEF} from "./index";

export interface CharacterToGlyphIndex {
  // We implement this as an interface because each cmap format has different encoding
  // metadata needed for this.
  glyphIndex: (codepoint: number) => number;
  // glyphIndexes: () => Generator<number, void, unknown>;

  // TODO: addGlyph(codepoint: number) for in place representation.
}

type CodepointRange = [number, number];

export class CmapFormat4 implements CharacterToGlyphIndex {
  codepointRanges: CodepointRange[];
  segments: number;

  idDelta: number[];
  idRangeOffset: number[];
  idRangeOffsetCursor: Cursor;

  constructor(
    cursor: Cursor
  ) {
    // 4 handles files only with codepoints that fall within the 
    // Basic Multilingual Plane (BMP). It's the only one we'll be handling.
    //
    // It makes use of segments, or ranges of codepoints.

    const length = cursor.nextUint16();
    const start = cursor.offset;

    // Language code, not used except on Macintosh for backward compatibility.
    cursor.skip(parse.WORD);

    // This field is actually marked as 2 * segment count.
    this.segments = cursor.nextUint16() / 2;

    // Skip searchRange, entrySelector, rangeShift for now.
    cursor.skip(parse.WORD * 3);

    // The next field is endCode[segments]. The last one is always 0xffff,
    // representing the end of BMP (first plane, goes from U+0000 to U+FFFF).
    this.codepointRanges = [];
    for (let i = 0; i < this.segments; i++)
      this.codepointRanges.push([0, cursor.nextUint16()]);
    if (this.codepointRanges[this.segments - 1][1] !== 0xffff)
      throw new errors.InvalidParsed();

    // reservedPad[ding].
    cursor.skip(parse.WORD);

    // Now startCode[segments].
    for (let i = 0; i < this.segments; i++)
      this.codepointRanges[i][0] = cursor.nextUint16();

    // Now idDelta[segments], which is delta for all codepoints in segment.
    // This is used if idRangeOffset isn't used, to offset directly.
    this.idDelta = [];
    for (let i = 0; i < this.segments; i++) this.idDelta.push(cursor.nextUint16());

    // Now idRangeOffset[segments], which is used to offset into glyphIndexArray,
    // which gives us the index directly.
    this.idRangeOffset = [];
    const idRangeOffsetStart = cursor.offset;
    for (let i = 0; i < this.segments; i++) 
      this.idRangeOffset.push(cursor.nextUint16());

    const remaining = (length - (cursor.offset - start)) * parse.WORD;
    this.idRangeOffsetCursor = cursor.slice(
      this.segments * parse.WORD + remaining,
      idRangeOffsetStart
    );
  }

  glyphIndex(codepoint: number) {
    // Segments are always sorted as by codepoint, so we can start by
    // looping through it and finding a segment where codepoint < segment[1].
    let segment;
    let idx = 0;
    for (let [i, range] of this.codepointRanges.entries()) {
      if (codepoint <= range[1] && codepoint >= range[0]) {
        segment = range;
        idx = i;
        break;
      }
    }

    // Handle this by returning .NOTDEF glyph, which is typically always index 0.
    if (!segment) return NOTDEF;

    const rangeOffset = this.idRangeOffset[idx];

    if (!rangeOffset)
      // rangeOffset is zero, can directly return delta offset.
      // Note we mod by max codepoint in BMP (exclusive) to get index.
      return (this.idDelta[idx] + codepoint) % 0x10000;

    // Otherwise, we need to offset into glyphIndexArray to get the actual index.
    // To do this we need to start from the byte offset of the rangeOffset value.
    const localIndex = rangeOffset + 2 * (codepoint - segment[0]) + parse.WORD * idx;
    this.idRangeOffsetCursor.reset();
    this.idRangeOffsetCursor.seek(localIndex);
    const glyphIndex = this.idRangeOffsetCursor.nextUint16();

    return glyphIndex;
  }
}
