import OpenType from "./otf";
import TrueType from "./ttf";

export { type CodepointRange } from "./cmap";

export type FontOptions = {
  yAtTopLeft: boolean;
};

export type Font = OpenType | TrueType;

export const NOTDEF = 0;

export default {
  NOTDEF,

  OpenType,
  TrueType,

  // Whereas this simply returns the appropriate instance.
  font: (
    bytes: Uint8Array,
    options: FontOptions = { yAtTopLeft: false }
  ): OpenType | TrueType => {
    const font = new OpenType(bytes, options);
    if (font.isTTF) return new TrueType(bytes, options);
    return font;
  }
};
