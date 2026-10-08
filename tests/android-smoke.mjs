// בדיקת עשן לאפליקציית Android המותקנת (רצה ב-CI על אמולטור, אחרי R8).
// מתקינה את ה-APK, פותחת את האפליקציה, מתחברת ל-WebView דרך DevTools ובודקת ש:
//   1) app.js רץ עד הסוף (initNative הוסיף את המחלקה native ל-<html>) – תופס קריסות טעינה כמו באג APP_URL ב-0.9.1
//   2) הגשר ל-Capacitor והפלאגינים עובדים אחרי R8 (App, Geolocation, Filesystem, StatusBar, KeepAwake, FirebaseAuthentication)
//   3) מסך ההערכה מחשב, ומהתפריט "התעריפים הנוכחיים" ו"שפה" נפתחים
//   4) אין FATAL EXCEPTION ב-logcat
// שימוש: node tests/android-smoke.mjs path/to/app.apk
import { execFileSync } from 'node:child_process';

const APK = process.argv[2] || 'out/mone-debug.apk';
const PKG = 'com.loukorek.mone';
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };

adb('logcat', '-c');
console.log(adb('install', '-r', '-g', APK));
adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);

// מחכים ל-WebView עם DevTools
let sock = null;
for (let i = 0; i < 60 && !sock; i++) {
  await sleep(2000);
  const pid = adb('shell', 'pidof', PKG);
  if (!pid) continue;
  const unix = adb('shell', 'cat', '/proc/net/unix');
  const m = unix.match(new RegExp(`@(webview_devtools_remote_${pid.split(/\s+/)[0]})`));
  if (m) sock = m[1];
}
check('האפליקציה רצה ו-WebView זמין לבדיקה', !!sock);
if (!sock) { console.log(adb('logcat', '-d', '-t', '300')); process.exit(1); }

adb('forward', 'tcp:9333', `localabstract:${sock}`);
let page = null;
for (let i = 0; i < 30 && !page; i++) {
  try { const list = await (await fetch('http://127.0.0.1:9333/json')).json(); page = list.find((p) => p.type === 'page' && /localhost/.test(p.url)); } catch { /* */ }
  if (!page) await sleep(1000);
}
check('הדף של האפליקציה נטען (https://localhost)', !!page, page?.url);
if (!page) process.exit(1);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const msg = JSON.parse(e.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
const evaluate = (expression) => new Promise((res) => {
  const id = ++seq; pending.set(id, (msg) => res(msg.result?.result?.value ?? { error: msg.result?.exceptionDetails?.exception?.description || msg.error?.message }));
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

// מחכים לסיום הטעינה
const waitLoad = async () => { for (let i = 0; i < 20; i++) { if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#startMeter')`) === true) break; await sleep(1000); } await sleep(3000); };
await waitLoad();
// השפה נבחרת לפי שפת המכשיר (באמולטור: אנגלית). בודקים שהתרגום עובד, ואז עוברים לעברית לשאר הבדיקות.
const first = await evaluate(`({ lang: document.documentElement.lang, dir: document.documentElement.dir, cta: document.querySelector('#estimateBtn')?.textContent.trim() })`);
console.log('שפה בהפעלה ראשונה:', JSON.stringify(first));
check('שפת הממשק נקבעה (he/en/ru/ar) והכיוון תואם', ['he', 'en', 'ru', 'ar'].includes(first.lang) && first.dir === (['he', 'ar'].includes(first.lang) ? 'rtl' : 'ltr'), JSON.stringify(first));
if (first.lang !== 'he') { await evaluate(`localStorage.setItem('mone.lang', 'he'); setTimeout(() => location.reload(), 50); true`); await sleep(1500); await waitLoad(); }

const r = await evaluate(`(async () => {
  const out = {};
  const P = window.Capacitor?.Plugins || {};
  out.native = window.Capacitor?.isNativePlatform?.() === true;
  out.appJsCompleted = document.documentElement.classList.contains('native');
  out.registered = ['App', 'Geolocation', 'Filesystem', 'StatusBar', 'KeepAwake', 'FirebaseAuthentication', 'Share', 'SplashScreen'].filter((n) => !!P[n]).join(',');
  const t = async (name, fn) => { try { const v = await fn(); out[name] = v === undefined ? 'ok' : v; } catch (e) { out[name] = 'ERROR: ' + (e && (e.message || e)); } };
  await t('App.getInfo', async () => { const i = await P.App.getInfo(); return i.id + ' ' + i.version; });
  await t('Geolocation.checkPermissions', async () => (await P.Geolocation.checkPermissions()).location);
  await t('Filesystem.write+read', async () => { await P.Filesystem.writeFile({ path: 'smoke.txt', data: 'bW9uZQ==', directory: 'CACHE' }); return (await P.Filesystem.readFile({ path: 'smoke.txt', directory: 'CACHE' })).data; });
  await t('StatusBar.getInfo', async () => (await P.StatusBar.getInfo()).visible);
  await t('KeepAwake.isSupported', async () => (await P.KeepAwake.isSupported()).isSupported);
  await t('FirebaseAuthentication.getCurrentUser', async () => JSON.stringify((await P.FirebaseAuthentication.getCurrentUser()).user));
  document.getElementById('estimateBtn').click();
  out.screen = window.__mone.currentScreen();
  document.getElementById('when').value = '2026-09-06T10:00';
  document.getElementById('km').value = '5'; document.getElementById('minutes').value = '15';
  for (const id of ['when', 'km', 'minutes']) document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
  out.calcTotal = document.getElementById('calcTotal').textContent.trim();
  window.__mone.go('home');
  document.getElementById('menuBtn').click();
  document.querySelector('[data-m=tariffs]').click();
  out.tariffsSheet = !document.getElementById('sheet').hidden && document.getElementById('sheetTitle').textContent;
  document.getElementById('sheetClose').click();
  document.getElementById('menuBtn').click();
  document.querySelector('[data-m=language]').click();
  out.langSheet = !document.getElementById('sheet').hidden && document.querySelectorAll('#sheetBody .langs button').length;
  document.getElementById('sheetClose').click();
  out.htmlDir = document.documentElement.dir;
  return out;
})()`);
console.log(JSON.stringify(r, null, 2));

check('Capacitor במצב native', r.native === true);
check('app.js רץ עד הסוף (initNative)', r.appJsCompleted === true);
for (const p of ['App', 'Geolocation', 'Filesystem', 'StatusBar', 'KeepAwake', 'FirebaseAuthentication', 'Share', 'SplashScreen']) check(`פלאגין ${p} רשום`, String(r.registered || '').split(',').includes(p));
check('App.getInfo', /^com\.loukorek\.mone /.test(r['App.getInfo'] || ''), r['App.getInfo']);
check('Geolocation', typeof r['Geolocation.checkPermissions'] === 'string' && !/^ERROR/.test(r['Geolocation.checkPermissions']), r['Geolocation.checkPermissions']);
check('Filesystem', r['Filesystem.write+read'] === 'bW9uZQ==' || r['Filesystem.write+read'] === 'mone', r['Filesystem.write+read']);
check('StatusBar', !/^ERROR/.test(String(r['StatusBar.getInfo'])), String(r['StatusBar.getInfo']));
check('KeepAwake', !/^ERROR/.test(String(r['KeepAwake.isSupported'])), String(r['KeepAwake.isSupported']));
check('FirebaseAuthentication (Firebase native אחרי R8)', !/^ERROR/.test(String(r['FirebaseAuthentication.getCurrentUser'])), String(r['FirebaseAuthentication.getCurrentUser']));
check('מסך ההערכה נפתח מהבית', r.screen === 'estimate', String(r.screen));
check('ההערכה מחשבת (5 ק"מ, 15 דק\', ראשון 10:00 = ₪51.40)', r.calcTotal === '₪51.40', r.calcTotal);
check('"התעריפים הנוכחיים" נפתח', r.tariffsSheet === 'התעריפים הנוכחיים', String(r.tariffsSheet));
check('בחירת שפה נפתחת עם 4 שפות', r.langSheet === 4, String(r.langSheet));
check('כיוון עברית (rtl) כברירת מחדל', r.htmlDir === 'rtl', String(r.htmlDir));

ws.close();
const log = adb('logcat', '-d', '-b', 'crash');
const fatal = /FATAL EXCEPTION|AndroidRuntime: Process/.test(log) && log.includes(PKG);
check('אין קריסות ב-logcat', !fatal);
if (fatal) console.log(log);
check('האפליקציה עדיין רצה בסוף', !!adb('shell', 'pidof', PKG));

console.log(failed ? `\n${failed} בדיקות נכשלו` : '\nכל הבדיקות עברו');
process.exit(failed ? 1 : 0);
