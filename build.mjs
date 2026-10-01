// בונה גרסה בקובץ יחיד: dist/index.html (לפריסה) ו-dist/artifact.html (לתצוגה מקדימה ב-claude.ai)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tariffs = read('./src/data/tariffs.json');
const hebcal = read('./src/hebcal.js').replace(/^export /gm, '');
const engine = read('./src/engine.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const native = read('./src/native.js').replace(/^export /gm, '');
const cloud = read('./src/cloud.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const legal = read('./src/legal.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const i18nData = read('./src/i18n-data.js').replace(/^export /gm, '');
const i18n = read('./src/i18n.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const geo = read('./src/geo.js').replace(/^export /gm, '');
let app = read('./src/app.js').replace(/^import .*$/gm, '');
const css = read('./src/styles.css');
// מזהה גרסה: hash של כל המקור — משתנה בכל שינוי, ומשמש את ה-Service Worker לרענון המטמון
const BUILD = createHash('sha1').update(tariffs + hebcal + engine + native + cloud + legal + i18nData + i18n + geo + app + css + read('./index.html')).digest('hex').slice(0, 10);
const VERSION = JSON.parse(read('./package.json')).version;
app = app.replace("'__BUILD__'", `'${BUILD}'`).replace("'__VERSION__'", `'${VERSION}'`);
const js = `const tariffs = ${tariffs.trim()};\n${hebcal}\n${engine}\n${native}\n${cloud}\n${i18nData}\n${i18n}\n${legal}\n${geo}\n${app}`;

let html = read('./index.html')
  .replace('<link rel="stylesheet" href="src/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', `<script type="module">\n${js}\n</script>`);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), html);
copyFileSync(new URL('./manifest.webmanifest', import.meta.url), new URL('./dist/manifest.webmanifest', import.meta.url));
mkdirSync(new URL('./dist/icons/', import.meta.url), { recursive: true });
const icons = readdirSync(new URL('./icons/', import.meta.url));
for (const f of icons) copyFileSync(new URL('./icons/' + f, import.meta.url), new URL('./dist/icons/' + f, import.meta.url));

// גרסת artifact: בלי doctype/html/head/body, עם <title> ו-<style> בראש
const inner = html.replace(/^[\s\S]*?<title>/, '<title>').replace('</title>', '</title>')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
writeFileSync(new URL('./dist/artifact.html', import.meta.url), inner);
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
<link rel="icon" href="${enRoot}icons/icon-64.png"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@900&family=Heebo:wght@400;500;700&display=swap">
<style>
  body{margin:0;background:#0f141d;color:#eceae2;font-family:"Heebo","Segoe UI",Arial,sans-serif;line-height:1.65;padding:24px 20px 60px}
  main{max-width:720px;margin:0 auto}
  header{display:flex;align-items:center;gap:12px;margin-bottom:18px}header img{width:44px;height:44px;border-radius:11px}
  header a{color:#f2b91d;text-decoration:none;font-family:"Frank Ruhl Libre",serif;font-weight:900;font-size:24px}
  header .lang{margin-inline-start:auto;font-family:inherit;font-weight:500;font-size:14px;color:#ffd769}
  h1{font-family:"Frank Ruhl Libre",serif;font-size:30px;color:#f2b91d;margin:0 0 8px}h2{font-size:18px;margin:22px 0 6px;color:#ffd769}
  p{margin:0 0 10px;max-width:70ch}.intro{color:#b6b9c2}.meta{color:#828896;font-size:13px;margin-top:28px;border-top:1px solid #2f3949;padding-top:12px}
  nav{font-size:14px;color:#828896;margin-top:26px}nav a{color:#ffd769}
  a{color:#ffd769}
</style></head><body><main>
<header><img src="${enRoot}icons/logo-96.png" alt=""><a href="${enRoot}">${L.app}</a><a class="lang" href="${L.otherPath}" hreflang="${en ? 'he' : 'en'}">${L.other}</a></header>
<h1>${d.title}</h1>
${legalMod.docHtml(key, { standalone: true, lang })}
<nav><a href="${lp}${en ? 'terms' : 'terms'}.html">${L.terms}</a> · <a href="${lp}privacy.html">${L.privacy}</a> · <a href="${lp}accessibility.html">${L.access}</a> · <a href="${en ? lp + 'delete-account.html' : path + 'delete-account.html'}">${L.del}</a></nav>
</main></body></html>`;
  return html.replace(/<div dir="ltr" lang="en">([\s\S]*)<\/div>\s*(?=<nav>)/, '$1');
};
mkdirSync(new URL('./dist/legal/en/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/legal/terms.html', import.meta.url), page('terms', '../'));
writeFileSync(new URL('./dist/legal/privacy.html', import.meta.url), page('privacy', '../'));
writeFileSync(new URL('./dist/legal/accessibility.html', import.meta.url), page('accessibility', '../'));
writeFileSync(new URL('./dist/delete-account.html', import.meta.url), page('delete', './'));
for (const k of ['terms', 'privacy', 'accessibility']) writeFileSync(new URL(`./dist/legal/en/${k}.html`, import.meta.url), page(k, '../', 'en'));
writeFileSync(new URL('./dist/legal/en/delete-account.html', import.meta.url), page('delete', '../', 'en'));
console.log('built legal pages');

// Service Worker: רשימת הקבצים לשמירה מראש + מזהה הגרסה
const precache = ['/', '/manifest.webmanifest', ...icons.map(f => '/icons/' + f), '/legal/terms.html', '/legal/privacy.html', '/legal/accessibility.html', '/delete-account.html', '/legal/en/terms.html', '/legal/en/privacy.html', '/legal/en/accessibility.html', '/legal/en/delete-account.html'];
const sw = read('./src/sw.template.js').replace('__BUILD__', BUILD).replace('__PRECACHE__', JSON.stringify(precache));
writeFileSync(new URL('./dist/sw.js', import.meta.url), sw);
console.log('built sw.js (build ' + BUILD + ')');
