// פונקציית שרת (Netlify Functions v2) שמתווכת בין האפליקציה ל-Google Maps Platform,
// כדי שמפתח ה-API יישאר בצד השרת (משתנה סביבה GOOGLE_MAPS_KEY ב-Netlify) ולא בקוד הציבורי.
//   POST /api/places  { input, sessionToken?, near?: {lat, lon} }      → { suggestions: [{ placeId, main, secondary }] }
//   POST /api/route   { origin, destination, departureTime? }         → { km, minutes, staticMinutes, polyline }
// origin/destination: { placeId } או { lat, lon }.
// האפליקציה המותקנת (Capacitor) קוראת מ-capacitor://localhost או https://localhost, ולכן CORS מפורש.

const ALLOWED_ORIGINS = new Set([
  'https://mone-taxi.netlify.app',
  'capacitor://localhost', 'https://localhost', 'http://localhost',
  'http://localhost:8080', 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:8080',
]);
const ISRAEL = { low: { latitude: 29.45, longitude: 34.2 }, high: { latitude: 33.4, longitude: 35.95 } };

function cors(req) {
  const origin = req.headers.get('origin') || '';
  const ok = ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+--mone-taxi\.netlify\.app$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://mone-taxi.netlify.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}
const json = (req, status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });

const waypoint = (p) => {
  if (!p) return null;
  if (typeof p.placeId === 'string' && p.placeId) return { placeId: p.placeId };
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { location: { latLng: { latitude: p.lat, longitude: p.lon } } };
  return null;
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'POST only' });
  const key = Netlify.env.get('GOOGLE_MAPS_KEY');
  if (!key) return json(req, 503, { error: 'missing-key', message: 'GOOGLE_MAPS_KEY לא מוגדר ב-Netlify' });

  let body;
  try { body = await req.json(); } catch { return json(req, 400, { error: 'bad-json' }); }
  const path = new URL(req.url).pathname;

  try {
    if (path.endsWith('/places')) {
      const input = String(body.input || '').trim().slice(0, 120);
      if (input.length < 2) return json(req, 200, { suggestions: [] });
      const payload = {
        input, languageCode: 'he', regionCode: 'il', includedRegionCodes: ['il'],
        locationRestriction: { rectangle: ISRAEL },
      };
      if (typeof body.sessionToken === 'string' && body.sessionToken.length <= 64) payload.sessionToken = body.sessionToken;
      if (body.near && Number.isFinite(body.near.lat) && Number.isFinite(body.near.lon)) {
        payload.origin = { latitude: body.near.lat, longitude: body.near.lon };
        payload.locationBias = { circle: { center: payload.origin, radius: 30000 } };
        delete payload.locationRestriction;   // locationBias ו-locationRestriction לא יכולים לבוא יחד
      }
      const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) return json(req, 502, { error: 'places', message: data?.error?.message || r.statusText });
      const suggestions = (data.suggestions || []).map((s) => s.placePrediction).filter(Boolean).slice(0, 6).map((p) => ({
        placeId: p.placeId,
        main: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
        distanceMeters: p.distanceMeters ?? null,
      }));
      return json(req, 200, { suggestions });
    }

    if (path.endsWith('/route')) {
      const origin = waypoint(body.origin), destination = waypoint(body.destination);
      if (!origin || !destination) return json(req, 400, { error: 'bad-waypoints' });
      const payload = {
        origin, destination, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'he', regionCode: 'il', units: 'METRIC',
        polylineQuality: 'OVERVIEW',
      };
      // זמן יציאה: רק אם הוא בעתיד (Google דוחה זמן בעבר); אחרת מחשבים לפי התנועה עכשיו
      const dep = body.departureTime ? new Date(body.departureTime) : null;
      if (dep && !isNaN(dep) && dep.getTime() > Date.now() + 60_000) payload.departureTime = dep.toISOString();
      const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.description',
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) return json(req, 502, { error: 'routes', message: data?.error?.message || r.statusText });
      const route = data.routes?.[0];
      if (!route) return json(req, 404, { error: 'no-route', message: 'לא נמצא מסלול נסיעה בין הנקודות' });
      const secs = (s) => Number(String(s || '0').replace('s', ''));
      return json(req, 200, {
        km: Math.round((route.distanceMeters || 0) / 100) / 10,
        minutes: Math.max(1, Math.round(secs(route.duration) / 60)),
        staticMinutes: Math.max(1, Math.round(secs(route.staticDuration || route.duration) / 60)),
        polyline: route.polyline?.encodedPolyline || null,
        via: route.description || '',
      });
    }

    return json(req, 404, { error: 'not-found' });
  } catch (e) {
    return json(req, 500, { error: 'server', message: String(e?.message || e) });
  }
};

export const config = { path: ['/api/places', '/api/route'] };
