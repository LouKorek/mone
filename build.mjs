// בונה גרסה בקובץ יחיד: dist/index.html (לפריסה) ו-dist/artifact.html (לתצוגה מקדימה ב-claude.ai)
// המודולים ב-src/ נארזים לסקריפט אחד: כל מודול עטוף בפונקציה משלו (IIFE) ומחזיר את מה שהוא מייצא,
// וה-import הופך להשמה מהמודול שכבר נבנה. כך אין התנגשויות שמות בין קבצים, והסדר נקבע לפי התלויות.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

const root = new URL('./', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// ---------- אריזת מודולים ----------
const mods = new Map();           // path -> { deps, code, names, json }
const ident = (p) => '__m_' + p.replace(/^src\//, '').replace(/\.(js|json)$/, '').replace(/[^\w]/g, '_');
function load(path) {
  if (mods.has(path)) return;
  if (path.endsWith('.json')) { mods.set(path, { deps: [], json: true, code: read(path).trim() }); return; }
  const deps = [], names = [];
  let code = read(path);
  code = code.replace(/^import\s+(\{[^}]*\}|\w+)\s+from\s+'([^']+)'[^\n]*$/gm, (m, what, from) => {
    const dep = posix.join(posix.dirname(path), from);
    deps.push(dep);
    const spec = what.startsWith('{') ? what.replace(/\s+as\s+/g, ': ') : what;
    return `const ${spec} = ${ident(dep)};`;
  });
  code = code.replace(/^import\s+'([^']+)';?[^\n]*$/gm, (m, from) => { deps.push(posix.join(posix.dirname(path), from)); return ''; });
  code = code.replace(/^export\s+((?:async\s+)?(?:function|class|const|let)\s+([\w$]+))/gm, (m, rest, name) => { names.push(name); return rest; });
  if (/^export\s/m.test(code)) throw new Error(`${path}: צורת export לא נתמכת (רק export function/class/const/let)`);
  mods.set(path, { deps, code, names });
  deps.forEach(load);
}
function order(entry) {
  const out = [], seen = new Set(), stack = new Set();
  const visit = (p) => {
    if (seen.has(p)) return;
    if (stack.has(p)) throw new Error('תלות מעגלית: ' + p);
    stack.add(p); mods.get(p).deps.forEach(visit); stack.delete(p); seen.add(p); out.push(p);
  };
  visit(entry); return out;
}
function bundle(entry) {
  load(entry);
  return order(entry).map((p) => {
    const m = mods.get(p);
    if (m.json) return `const ${ident(p)} = ${m.code};`;
    return `// ---- ${p} ----\nconst ${ident(p)} = (() => {\n${m.code}\nreturn { ${m.names.join(', ')} };\n})();`;
  }).join('\n\n');
}

let js = bundle('src/app.js');
const css = read('./src/styles.css');
const sources = [...mods.keys()].map((p) => read(p)).join('\n');
// מזהה גרסה: hash של כל המקור — משתנה בכל שינוי, ומשמש את ה-Service Worker לרענון המטמון
const BUILD = createHash('sha1').update(sources + css + read('./index.html')).digest('hex').slice(0, 10);
const VERSION = JSON.parse(read('./package.json')).version;
js = js.replace("'__BUILD__'", `'${BUILD}'`).replace("'__VERSION__'", `'${VERSION}'`);

let html = read('./index.html')
  .replace('<link rel="stylesheet" href="src/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', () => `<script type="module">\n${js}\n</script>`);

mkdirSync(new URL('./dist/', root), { recursive: true });
writeFileSync(new URL('./dist/index.html', root), html);
copyFileSync(new URL('./manifest.webmanifest', root), new URL('./dist/manifest.webmanifest', root));
mkdirSync(new URL('./dist/icons/', root), { recursive: true });
const icons = readdirSync(new URL('./icons/', root));
for (const f of icons) copyFileSync(new URL('./icons/' + f, root), new URL('./dist/icons/' + f, root));

// גרסת artifact: בלי doctype/html/head/body, עם <title> ו-<style> בראש; בלי גיליון Leaflet (חסום שם)
const inner = html.replace(/^[\s\S]*?<title>/, '<title>')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="stylesheet" href="https:\/\/cdnjs[^>]*>\s*/, '')
  .replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
writeFileSync(new URL('./dist/artifact.html', root), inner);
console.log('built dist/index.html and dist/artifact.html');

// עמודים משפטיים ציבוריים (נדרשים ל-App Store ול-Google Play): dist/legal/*.html + dist/delete-account.html
const legalMod = await import('./src/legal.js');
const page = (key, path, lang = 'he') => {
  const en = lang === 'en';
  const d = en ? legalMod.DOCS_EN[key] : legalMod.DOCS[key];
  const L = en
    ? { app: 'Mone', terms: 'Terms of Use', privacy: 'Privacy Policy', access: 'Accessibility Statement', del: 'Delete account', other: 'עברית', otherPath: key === 'delete' ? `${path}../delete-account.html` : `${path}../legal/${key}.html` }
    : { app: 'מונה', terms: 'תנאי שימוש', privacy: 'מדיניות פרטיות', access: 'הצהרת נגישות', del: 'מחיקת חשבון', other: 'English', otherPath: `${path}legal/en/${key === 'delete' ? 'delete-account' : key}.html` };
  const lp = en ? `${path}../legal/en/` : `${path}legal/`;
  const enRoot = en ? `${path}../` : path;
  const html = `<!doctype html>
<html lang="${en ? 'en' : 'he'}" dir="${en ? 'ltr' : 'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${d.title} — ${L.app}</title>
<link rel="icon" href="${enRoot}icons/icon-64.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@900&family=Rubik:wght@400;500;700&display=swap">
<style>
  :root { color-scheme: light dark; }
  body{margin:0;background:#f4f2ec;color:#171a21;font-family:"Rubik","Segoe UI",Arial,sans-serif;line-height:1.65;padding:24px 20px 60px}
  @media (prefers-color-scheme: dark){ body{background:#0e1118;color:#ecebe4} .meta,nav{color:#8a8f9c} h2{color:#ffd666} }
  main{max-width:720px;margin:0 auto}
  header{display:flex;align-items:center;gap:12px;margin-bottom:18px}header img{width:44px;height:44px;border-radius:11px}
  header a{color:#c9960a;text-decoration:none;font-family:"Frank Ruhl Libre",serif;font-weight:900;font-size:24px}
  header .lang{margin-inline-start:auto;font-family:inherit;font-weight:500;font-size:14px}
  h1{font-family:"Frank Ruhl Libre",serif;font-size:30px;color:#c9960a;margin:0 0 8px}h2{font-size:18px;margin:22px 0 6px;color:#8a6400}
  p{margin:0 0 10px;max-width:70ch}.intro{opacity:.85}.meta{font-size:13px;margin-top:28px;border-top:1px solid #8884;padding-top:12px}
  nav{font-size:14px;margin-top:26px}
  a{color:#c9960a}
</style></head><body><main>
<header><img src="${enRoot}icons/logo-96.png" alt=""><a href="${enRoot}">${L.app}</a><a class="lang" href="${L.otherPath}">${L.other}</a></header>
${legalMod.docHtml(key, { standalone: true, lang })}
<nav>${L.app} · <a href="${lp}terms.html">${L.terms}</a> · <a href="${lp}privacy.html">${L.privacy}</a> · <a href="${lp}accessibility.html">${L.access}</a> · <a href="${en ? `${lp}delete-account.html` : `${path}delete-account.html`}">${L.del}</a></nav>
</main></body></html>`;
  return html.replace(/<div dir="ltr" lang="en">([\s\S]*)<\/div>\s*(?=<nav>)/, '$1');
};
mkdirSync(new URL('./dist/legal/en/', root), { recursive: true });
writeFileSync(new URL('./dist/legal/terms.html', root), page('terms', '../'));
writeFileSync(new URL('./dist/legal/privacy.html', root), page('privacy', '../'));
writeFileSync(new URL('./dist/legal/accessibility.html', root), page('accessibility', '../'));
writeFileSync(new URL('./dist/delete-account.html', root), page('delete', './'));
for (const k of ['terms', 'privacy', 'accessibility']) writeFileSync(new URL(`./dist/legal/en/${k}.html`, root), page(k, '../', 'en'));
writeFileSync(new URL('./dist/legal/en/delete-account.html', root), page('delete', '../', 'en'));
console.log('built legal pages');

// Service Worker: רשימת הקבצים לשמירה מראש + מזהה הגרסה
const precache = ['/', '/manifest.webmanifest', ...icons.map(f => '/icons/' + f), '/legal/terms.html', '/legal/privacy.html', '/legal/accessibility.html', '/delete-account.html', '/legal/en/terms.html', '/legal/en/privacy.html', '/legal/en/accessibility.html', '/legal/en/delete-account.html'];
const sw = read('./src/sw.template.js').replace('__BUILD__', BUILD).replace('__PRECACHE__', JSON.stringify(precache));
writeFileSync(new URL('./dist/sw.js', root), sw);
console.log('built sw.js (build ' + BUILD + ')');
