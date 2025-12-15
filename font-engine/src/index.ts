import OTF from "./otf";
import TTF from "./ttf";

export const NOTDEF = 0;

export default {
  NOTDEF,

  // If using `Font`, you'll have to check `isTTF`.
  Font: OTF,
  TTF,

  // Whereas this simply returns the appropriate instance.
  font: (bytes: Uint8Array) => {
    const font = new OTF(bytes);
    if (font.isTTF) return font.ttf;
  },
};
