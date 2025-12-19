import OpenType from "./otf";
import TrueType from "./ttf";

export { type CodepointRange } from "./cmap";

export const NOTDEF = 0;

export default {
  NOTDEF,

  // If using `Font`, you'll have to check `isTTF`.
  Font: OpenType,
  OpenType,
  TrueType,

  // Whereas this simply returns the appropriate instance.
  font: (bytes: Uint8Array): OpenType | TrueType => {
    const font = new OpenType(bytes);
    if (font.isTTF) return new TrueType(bytes);
    return font;
  }
};
