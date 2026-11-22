# Negen · Sudoku

A calm, fair Sudoku web game in Delft blue. Every puzzle has exactly one solution and can be solved with logic alone.

**Play:** https://arjanterpstra.github.io/negen/

On iPhone, open the link in Safari, tap Share, then "Add to Home Screen" to play full screen.

## Build

`index.html` is a single self-contained file. To rebuild it from `src/`:

```sh
cd src && node build.js ../index.html
```

`src/tools/check.js` is the regression harness (serves the build over http and screenshots phone, home-screen and desktop views). `bmerge.py` merges feature branches of `index.src.html` that use `@@` marker blocks.
