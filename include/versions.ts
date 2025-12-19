// Store version information - important for future backwards compatibility depending
// on the Unicode version, etc.

type Version = {
  ucd: string;
};

const versions: { [k: string]: Version } = {
  current: {
    ucd: "17.0.0"
  }
};
