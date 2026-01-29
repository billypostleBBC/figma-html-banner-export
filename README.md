# HTML Banner Export (Figma Plugin)

## Build notes

- Bundle the plugin code (and `fflate`) with a small bundler such as esbuild.
- Example:
  ```bash
  npm install
  npm install fflate
  npx esbuild main.ts --bundle --outfile=main.js
  ```
- Load `manifest.json` in Figma. Ensure `main.js` and `ui.html` are in the same folder.
