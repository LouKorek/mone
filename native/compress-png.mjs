// מכווץ את קובצי ה-PNG שנוצרו על ידי capacitor-assets (splash + אייקונים) בפלטת צבעים,
// כדי להקטין את ה-AAB/APK (חוסך כמה MB). מריצים אחרי `capacitor-assets generate` ולפני `cap sync`.
// משתמש ב-sharp שמגיע עם @capacitor/assets.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sharpPath = require.resolve('sharp', { paths: [dirname(require.resolve('@capacitor/assets/package.json')), root] });
const sharp = require(sharpPath);

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['android/app/src/main/res', 'ios/App/App/Assets.xcassets'];
const walk = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : /\.png$/i.test(f) && out.push(p); } return out; };

let before = 0, after = 0, n = 0;
for (const d of dirs) {
  const abs = resolve(root, d);
  let files = [];
  try { files = walk(abs); } catch { continue; }
  for (const p of files) {
    const src = readFileSync(p);
    const buf = await sharp(src).png({ palette: true, quality: 85, effort: 10 }).toBuffer();
    before += src.length;
    if (buf.length < src.length) { writeFileSync(p, buf); after += buf.length; n++; } else after += src.length;
  }
}
console.log(`כווצו ${n} קבצים: ${(before / 1e6).toFixed(2)}MB → ${(after / 1e6).toFixed(2)}MB`);
