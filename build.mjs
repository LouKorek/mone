// בונה גרסה בקובץ יחיד: dist/index.html (לפריסה) ו-dist/artifact.html (לתצוגה מקדימה ב-claude.ai)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tariffs = read('./src/data/tariffs.json');
const hebcal = read('./src/hebcal.js').replace(/^export /gm, '');
const engine = read('./src/engine.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const cloud = read('./src/cloud.js').replace(/^export /gm, '');
const legal = read('./src/legal.js').replace(/^export /gm, '');
let app = read('./src/app.js').replace(/^import .*$/gm, '');
const js = `const tariffs = ${tariffs.trim()};\n${hebcal}\n${engine}\n${cloud}\n${legal}\n${app}`;
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

// עמודים משפטיים ציבוריים (נדרשים ל-App Store ול-Google Play): dist/legal/*.html + dist/delete-account.html
const legalMod = await import('./src/legal.js');
const page = (key, path) => {
  const d = legalMod.DOCS[key];
  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${d.title} — מונה</title>
<link rel="icon" href="${path}icons/icon-64.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@900&family=Heebo:wght@400;500;700&display=swap">
<style>
  body{margin:0;background:#0f141d;color:#eceae2;font-family:"Heebo","Segoe UI",Arial,sans-serif;line-height:1.65;padding:24px 20px 60px}
  main{max-width:720px;margin:0 auto}
  header{display:flex;align-items:center;gap:12px;margin-bottom:18px}header img{width:44px;height:44px;border-radius:11px}
  header a{color:#f2b91d;text-decoration:none;font-family:"Frank Ruhl Libre",serif;font-weight:900;font-size:24px}
  h1{font-family:"Frank Ruhl Libre",serif;font-size:30px;color:#f2b91d;margin:0 0 8px}h2{font-size:18px;margin:22px 0 6px;color:#ffd769}
  p{margin:0 0 10px;max-width:70ch}.intro{color:#b6b9c2}.meta{color:#828896;font-size:13px;margin-top:28px;border-top:1px solid #2f3949;padding-top:12px}
  nav{font-size:14px;color:#828896;margin-top:26px}nav a{color:#ffd769}
  a{color:#ffd769}
</style></head><body><main>
<header><img src="${path}icons/logo-96.png" alt=""><a href="${path}">מונה</a></header>
<h1>${d.title}</h1>
${legalMod.docHtml(key, { standalone: true })}
<nav><a href="${path}legal/terms.html">תנאי שימוש</a> · <a href="${path}legal/privacy.html">מדיניות פרטיות</a> · <a href="${path}legal/accessibility.html">הצהרת נגישות</a> · <a href="${path}delete-account.html">מחיקת חשבון</a></nav>
</main></body></html>`;
  return html;
};
mkdirSync(new URL('./dist/legal/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/legal/terms.html', import.meta.url), page('terms', '../'));
writeFileSync(new URL('./dist/legal/privacy.html', import.meta.url), page('privacy', '../'));
writeFileSync(new URL('./dist/legal/accessibility.html', import.meta.url), page('accessibility', '../'));
writeFileSync(new URL('./dist/delete-account.html', import.meta.url), page('delete', './'));
console.log('built legal pages');
