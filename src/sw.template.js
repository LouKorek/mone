// Service Worker של "מונה" — נוצר על ידי build.mjs (הגרסה מוחלפת בזמן הבנייה).
// מטרה: האפליקציה נפתחת ומחשבת גם בלי אינטרנט; המפה, הגופנים והספריות נשמרות אחרי השימוש הראשון.
const VERSION = '__BUILD__';
const STATIC = 'mone-static-' + VERSION;
const RUNTIME = 'mone-runtime';
const TILES = 'mone-tiles';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('mone-static-') && k !== STATIC).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// כתובות שאסור לשמור במטמון: התחברות, Firestore, ומה שלא GET
const NEVER = [/identitytoolkit|securetoken|firestore\.googleapis|googleapis\.com\/.*token|\/__\/auth\/|\/__\/firebase\//];

async function limit(cacheName, max) {
  const c = await caches.open(cacheName); const keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NEVER.some((re) => re.test(req.url))) return;

  // ניווט (פתיחת האפליקציה): רשת קודם, ואם אין — הגרסה השמורה
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(STATIC); c.put(url.pathname === '/' || url.pathname === '/index.html' ? '/' : req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // אריחי מפה: מהמטמון אם יש, ובמקביל רענון; עד 400 אריחים
  if (/tile\.openstreetmap\.org/.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); limit(TILES, 400); } return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // קבצים שלנו + ספריות/גופנים מ-CDN: מטמון קודם, אחרת רשת ושמירה
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com\/firebasejs/.test(url.host + url.pathname);
  if (sameOrigin || cdn) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') { const c = await caches.open(sameOrigin ? STATIC : RUNTIME); c.put(req, r.clone()); }
        return r;
      } catch { return Response.error(); }
    })());
  }
});
