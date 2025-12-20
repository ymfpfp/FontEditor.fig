This is a monorepo, so `font-engine` is directly included. It works as a separate package and is built as a separate package, but I don't see myself using it for anything else so there isn't any reason currently to move it to a repo of its own.

- Shaping is done with `harfbuzz.js`, directly bundled in.
