# Vendored Three.js

- Package: `three@0.186.1` from the npm registry (license MIT, see `LICENSE`; zero dependencies, no install scripts).
- Files: `three.module.js` (imports `./three.core.js`) and `three.core.js`, copied unmodified from the package's `build/` directory.
- Source tarball SHA-256: `8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7` (`three-0.186.1.tgz`).
- File SHA-256: `three.module.js` `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea`; `three.core.js` `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6`.
- Used by: `js/view3d.js` (lazy `import()` on the first 3D view request) and `tests/board-scene.test.mjs`.
- Vetting on 2026-10-28 (npmscan): no known vulnerabilities, active maintenance, very high usage; the release has no npm publish provenance, like its maintainers' other packages.
- Update: `npm pack three@<version>`, extract, copy `build/three.module.js`, `build/three.core.js`, and `LICENSE` here, update the version and checksums above, update the `sw.js` cache version, and run `npm test`.
