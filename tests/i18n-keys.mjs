// מוציא את כל המחרוזות שצריכות תרגום: t('...') באפליקציה, טקסטים קבועים ב-index.html, ותוויות מהמנוע/הענן.
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const keys = new Set();
const HEB = /[\u0590-\u05FF]/;
import { readdirSync } from 'node:fs';
const uiFiles = readdirSync(new URL('../src/ui/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => 'src/ui/' + f);
const app = ['src/app.js', 'src/store.js', 'src/ride.js', ...uiFiles].map(read).join('\n');
for (const m of app.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\(['"\\])/g, '$1'));
// מערך FACTS (מתורגם דרך t(a), t(d), t(s))
const facts = app.slice(app.indexOf('const FACTS = ['), app.indexOf('];', app.indexOf('const FACTS = [')));
for (const m of facts.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) { const v = m[2].replace(/\\(['"\\])/g, '$1'); if (HEB.test(v)) keys.add(v); }
// index.html: טקסטים ותכונות
const html = read('index.html').replace(/<svg[\s\S]*?<\/svg>/g, '');
for (const m of html.matchAll(/>([^<>]+)</g)) { const v = m[1].trim(); if (HEB.test(v)) keys.add(v); }
for (const m of html.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]+)"/g)) if (HEB.test(m[1])) keys.add(m[1]);
const title = html.match(/<title>([^<]+)<\/title>/); if (title) keys.add(title[1]);
// מנוע: שמות תעריפים, ימים וחגים
['תעריף א\'', 'תעריף ב\'', 'תעריף ג\'', 'שבת', 'ערב שבת', 'יום חמישי', 'יום חול', 'ראש השנה', 'ראש השנה (יום ב\')', 'יום הכיפורים', 'סוכות', 'שמיני עצרת / שמחת תורה', 'פסח', 'שביעי של פסח', 'שבועות', 'יום העצמאות', 'הפעלת המונה'].forEach(k => keys.add(k));
// ענן: הודעות שגיאה
const cloud = read('src/cloud.js');
for (const m of cloud.slice(cloud.indexOf('export const errorHe')).matchAll(/:\s*'([^']+)'/g)) if (HEB.test(m[1])) keys.add(m[1]);
keys.add('משהו השתבש, נסה שוב');
// ערכת נושא (מתורגמת דרך t(l))
['אוטומטי', 'בהיר', 'כהה'].forEach(k => keys.add(k));
// מסמכים משפטיים – כותרות
['תנאי שימוש', 'מדיניות פרטיות', 'הצהרת נגישות', 'מחיקת חשבון ומידע'].forEach(k => keys.add(k));
export const KEYS = [...keys].filter(k => HEB.test(k));
if (process.argv[1] && process.argv[1].endsWith('i18n-keys.mjs')) { console.log(JSON.stringify(KEYS, null, 0)); console.error(KEYS.length + ' keys'); }
