// Store version information - important for future backwards compatibility depending
// on the Unicode version, etc.

export type Version = {
  ucd: string;
};

const versions = {
  current: {
    ucd: "17.0.0"
  }
} satisfies Record<"current" | string, Version>;

export default versions;
