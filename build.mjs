// בונה גרסה בקובץ יחיד: dist/index.html (לפריסה) ו-dist/artifact.html (לתצוגה מקדימה ב-claude.ai)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tariffs = read('./src/data/tariffs.json');
const hebcal = read('./src/hebcal.js').replace(/^export /gm, '');
const engine = read('./src/engine.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
let app = read('./src/app.js').replace(/^import .*$/gm, '');
const js = `const tariffs = ${tariffs.trim()};\n${hebcal}\n${engine}\n${app}`;
const css = read('./src/styles.css');

let html = read('./index.html')
  .replace('<link rel="stylesheet" href="src/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', `<script type="module">\n${js}\n</script>`);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), html);
for (const f of ['manifest.webmanifest', 'sw.js']) {
  if (existsSync(new URL('./' + f, import.meta.url))) copyFileSync(new URL('./' + f, import.meta.url), new URL('./dist/' + f, import.meta.url));
}
mkdirSync(new URL('./dist/icons/', import.meta.url), { recursive: true });
for (const f of readdirSync(new URL('./icons/', import.meta.url))) copyFileSync(new URL('./icons/' + f, import.meta.url), new URL('./dist/icons/' + f, import.meta.url));

// גרסת artifact: בלי doctype/html/head/body, עם <title> ו-<style> בראש
const inner = html.replace(/^[\s\S]*?<title>/, '<title>').replace('</title>', '</title>')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
writeFileSync(new URL('./dist/artifact.html', import.meta.url), inner);
console.log('built dist/index.html and dist/artifact.html');
