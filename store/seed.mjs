// יוצר נתוני דוגמה לצילומי מסך לחנויות: נסיעה חיה באמצע + היסטוריית נסיעות
import { loadTariffs, LiveMeter, computeFare } from '../src/engine.js';
import { readFileSync, writeFileSync } from 'node:fs';
loadTariffs(JSON.parse(readFileSync(new URL('../src/data/tariffs.json', import.meta.url), 'utf8')));
process.env.TZ = 'Asia/Jerusalem';

// מסלול: דיזנגוף סנטר → נמל תל אביב (בקירוב לאורך דיזנגוף/בן יהודה)
const route = (a, b, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [a[0] + (b[0] - a[0]) * t + Math.sin(t * 9) * 0.0004, a[1] + (b[1] - a[1]) * t + Math.cos(t * 7) * 0.0005]; });
const hav = (p, q) => { const R = 6371000, r = x => x * Math.PI / 180; const a = Math.sin(r(q[0] - p[0]) / 2) ** 2 + Math.cos(r(p[0])) * Math.cos(r(q[0])) * Math.sin(r(q[1] - p[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };

function makeRide(start, track, minutes, opts, extra = {}) {
  const m = new LiveMeter(start, opts);
  const totalM = track.slice(1).reduce((s, p, i) => s + hav(track[i], p), 0);
  const step = minutes * 60 / (track.length - 1);
  for (let i = 1; i < track.length; i++) m.tick(new Date(start.getTime() + i * step * 1000), step, hav(track[i - 1], track[i]));
  const f = m.snapshot();
  return { meter: m, ride: { id: start.getTime(), at: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString(), km: f.km, minutes: f.minutes, total: f.total, cashTotal: f.cashTotal, tariffLabel: f.tariffLabel, dayLabel: f.dayLabel, period: f.period, lines: f.lines, opts: { ...opts }, track, asked: null, ...extra } };
}
const base = { order: false, airport: null, road6: false, segment18: false, carmel: 0, fastLane: 0, eilat: false };
const now = new Date();
// נסיעה חיה: התחילה לפני 9 דקות, 4.1 ק"מ, הזמנה טלפונית
const liveStart = new Date(now.getTime() - 9 * 60000);
const liveTrack = route([32.0753, 34.7750], [32.0968, 34.7735], 40);
const live = makeRide(liveStart, liveTrack, 9, { ...base, order: true });
const liveRide = { meter: live.meter.toJSON(), opts: { ...base, order: true }, track: liveTrack };

// היסטוריה
const d = (daysAgo, h, mi) => { const x = new Date(now); x.setDate(x.getDate() - daysAgo); x.setHours(h, mi, 0, 0); return x; };
const r1 = makeRide(d(1, 22, 40), route([32.0853, 34.7818], [32.0114, 34.8867], 60), 24, { ...base, airport: 'ben-gurion' }, { taxi: '25-861-34', driver: 'רונן', asked: 118 }); // לנתב"ג, תעריף ב'
const r2 = makeRide(d(3, 8, 15), route([32.0663, 34.7770], [32.0800, 34.8400], 45), 18, base, { asked: 65 });
const r3 = makeRide(d(6, 13, 5), route([32.0879, 34.7887], [32.0596, 34.7723], 35), 14, { ...base, order: true });
const history = [r1.ride, r2.ride, r3.ride];
history.forEach(r => { r.total = Math.round(r.total * 100) / 100; });
writeFileSync(new URL('./seed.json', import.meta.url), JSON.stringify({ liveRide, history }));
console.log('live:', live.ride.km.toFixed(2), 'km', live.ride.total.toFixed(2), '| history totals:', history.map(r => r.total.toFixed(2) + ' ' + r.tariffLabel).join(' ; '));
