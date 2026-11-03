// צילומי מסך לחנויות מהאפליקציה האמיתית (dist), בעברית ובערכה בהירה, עם נתוני הדוגמה מ-store/seed.mjs.
// רץ ב-GitHub Actions (store-shots.yml) כדי שמפות OpenStreetMap ייטענו. שימוש: node tools/store-shots.mjs <outdir>
// יוצר: <out>/play/N-name.png (1080x1920) ו-<out>/ios/<DISPLAY_TYPE>/N-name.png לכל גודל אייפון ש-App Store מבקש.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] || 'out/store-shots';
// שעון קבוע לצילומים (גם ל-seed.mjs): יום חול באמצע החודש, ערב
const NOW = process.env.SEED_NOW || '2026-11-12T19:40:00+02:00';
execFileSync('node', ['store/seed.mjs'], { cwd: root, env: { ...process.env, SEED_NOW: NOW, TZ: 'Asia/Jerusalem' }, stdio: 'inherit' });
const seed = JSON.parse(readFileSync(root + 'store/seed.json', 'utf8'));
const SIZES = [
  ['play', 360, 720, 3],
  ['ios/APP_IPHONE_67', 430, 932, 3],
  ['ios/APP_IPHONE_65', 428, 926, 3],
  ['ios/APP_IPHONE_61', 393, 852, 3],
  ['ios/APP_IPHONE_58', 375, 812, 3],
  ['ios/APP_IPHONE_55', 414, 736, 3],
];
const end = seed.liveRide.track.at(-1);
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let failed = 0;
for (const [dir, w, h, scale] of SIZES) {
  mkdirSync(`${out}/${dir}`, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, isMobile: true, hasTouch: true,
    locale: 'he-IL', timezoneId: 'Asia/Jerusalem', geolocation: { latitude: end[0], longitude: end[1], accuracy: 4 }, permissions: ['geolocation'] });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('mone.lang', 'he');
    localStorage.setItem('mone.prefs', JSON.stringify({ theme: 'light', passengers: 1 }));
    localStorage.setItem('mone.history', JSON.stringify(s.history));
    sessionStorage.setItem('seeded', '1');
  }, seed);
  await ctx.clock.install({ time: new Date(NOW) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('pageerror', e.message); failed++; });
  await p.goto('file://' + root + 'dist/index.html');
  await p.waitForTimeout(2500);
  const vis = (sel) => p.locator(sel).locator('visible=true').first();
  if (await vis('#guestBtn').count()) { await vis('#guestBtn').click(); await p.waitForTimeout(600); }
  const go = async (name, params = {}, opts = { root: true }) => { await p.evaluate(([n, pa, o]) => window.__mone.go(n, pa, o), [name, params, opts]); await p.waitForTimeout(900); };
  const tiles = async () => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1500); };
  const shot = async (n) => { await p.screenshot({ path: `${out}/${dir}/${n}.png` }); console.log(dir, n); };

  await go('home'); await tiles(); await shot('1-home');
  // נסיעה פעילה רק מכאן: הבית צולם במצב "פנוי"
  await p.evaluate((lr) => localStorage.setItem('mone.liveRide', JSON.stringify(lr)), seed.liveRide);
  await p.reload(); await p.waitForTimeout(2500);
  await go('live', {}, {}); await tiles(); await shot('2-live');
  await go('home');
  await vis('#estimateBtn').click(); await p.waitForTimeout(500);
  await p.evaluate(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; set('km', '8.5'); set('minutes', '22'); });
  await p.waitForTimeout(600); await shot('3-estimate');
  await go('rides'); await shot('4-rides');
  await vis(`.li[data-id="${seed.history[1].id}"]`).click(); await tiles(); await shot('5-summary');
  await vis('#rideReceipt').click(); await p.waitForTimeout(1800); await shot('6-receipt');
  await p.evaluate(() => window.__mone.closeSheet()); await p.waitForTimeout(400);
  await go('tariffs'); await shot('7-tariffs');
  await go('rights'); await shot('8-rights');
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
