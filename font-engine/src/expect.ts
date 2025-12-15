export default <T, E extends Error>(v: T | null, Unexpected: new () => E) => {
  if (v === null) throw new Unexpected();
  return v;
};
