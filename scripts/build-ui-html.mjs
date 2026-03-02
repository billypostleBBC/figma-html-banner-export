import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const templatePath = path.join(rootDir, 'src', 'ui.html');
const cssPath = path.join(rootDir, 'dist', 'ui.css');
const jsPath = path.join(rootDir, 'dist', 'ui.js');
const outPath = path.join(rootDir, 'dist', 'ui.html');

const [templateHtml, css, js] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(jsPath, 'utf8'),
]);

let output = templateHtml;

const cssTag = '<link rel="stylesheet" href="ui.css">';
if (output.includes(cssTag)) {
  output = output.replace(cssTag, `<style>\n${css}\n</style>`);
}

const scriptTag = '<script src="ui.js"></script>';
if (!output.includes(scriptTag)) {
  throw new Error('Could not find ui.js script tag placeholder in src/ui.html');
}
output = output.replace(scriptTag, `<script>\n${js}\n</script>`);

await writeFile(outPath, output, 'utf8');
console.log('Built dist/ui.html with inlined ui.css and ui.js');
