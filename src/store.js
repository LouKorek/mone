// מצב האפליקציה במקום אחד: הנסיעה שמתכננים (draft), ספריית הנסיעות, מקומות שמורים, העדפות, ונסיעה חיה שנשמרת לשחזור.
// המסכים לא כותבים ל-localStorage בעצמם – הם קוראים לפעולות כאן ומאזינים לשינויים דרך subscribe.

const KEYS = { rides: 'mone.history', live: 'mone.liveRide', places: 'mone.places', prefs: 'mone.prefs' };
const readJSON = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? fb; } catch (e) { return fb; } };
const writeJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

// ---- מאזינים ----
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = (what, data) => listeners.forEach((fn) => { try { fn(what, data); } catch (e) { console.warn('store', e); } });

// ---- תוספות לנסיעה (מה שבתוקף) ----
export const newSurcharges = () => ({ order: false, airport: null, road6: false, segment18: false, carmel: 0, eilat: false, fastLane: 0, fastLaneOn: false });
// ערכי ברירת המחדל של התוספות שמזוהות אוטומטית לפי מיקום
export const AUTO_DEFAULT = { airport: null, road6: false, segment18: false, carmel: 0 };

// ---- העדפות ----
export const prefs = Object.assign({ theme: 'auto', passengers: 2 }, readJSON(KEYS.prefs, {}));
export function setPref(k, v) { prefs[k] = v; writeJSON(KEYS.prefs, prefs); emit('prefs', k); }

// ---- מקומות שמורים: בית, עבודה, אחרונים (במכשיר בלבד) ----
export const places = Object.assign({ home: null, work: null, recent: [] }, readJSON(KEYS.places, {}));
const savePlaces = () => { writeJSON(KEYS.places, places); emit('places'); };
export const samePlace = (a, b) => !!a && !!b && ((a.placeId && a.placeId === b.placeId) || a.label === b.label);
export function rememberPlace(p) {
  if (!p || p.gps) return;
  const clean = { label: p.label, placeId: p.placeId || null, lat: p.lat ?? null, lon: p.lon ?? null };
  places.recent = [clean, ...places.recent.filter((x) => !samePlace(x, clean))].slice(0, 6); savePlaces();
}
export function setNamedPlace(tag, p) { places[tag] = p ? { label: p.label, placeId: p.placeId || null, lat: p.lat ?? null, lon: p.lon ?? null } : null; savePlaces(); }
export function quickPlaces() {
  const items = [];
  if (places.home) items.push({ tag: 'home', p: places.home });
  if (places.work) items.push({ tag: 'work', p: places.work });
  places.recent.filter((x) => !samePlace(x, places.home) && !samePlace(x, places.work)).forEach((p) => items.push({ tag: 'recent', p }));
  return items;
}

// ---- הנסיעה שמתכננים (מחשבון/הערכה) ----
export const draft = {
  from: null, to: null,            // Place: { label, placeId?, lat?, lon?, gps? }
  when: null,                      // Date, או null = עכשיו
  km: 0, minutes: 0,
  route: null, points: null,       // תוצאת Routes API והקו המפוענח
  found: [],                       // שמות התוספות שזוהו מהמסלול
  opts: newSurcharges(),
  auto: {},                        // תוספות שהמערכת הפעילה (מפתח → ערך), להבדיל ממה שהמשתמש קבע
  asked: null,
};
export function resetDraft() {
  Object.assign(draft, { from: null, to: null, when: null, km: 0, minutes: 0, route: null, points: null, found: [], opts: newSurcharges(), auto: {}, asked: null });
  emit('draft');
}
export function clearDraftRoute() { draft.route = null; draft.points = null; draft.found = []; resetAuto(draft); emit('draft'); }
// מבטל את מה שהזיהוי האוטומטי הפעיל (ורק אותו)
export function resetAuto(target) {
  for (const [k, v] of Object.entries(target.auto)) if (target.opts[k] === v) target.opts[k] = AUTO_DEFAULT[k];
  target.auto = {};
}
// מפעיל תוספות שזוהו, בלי לדרוס בחירה ידנית. מחזיר את המפתחות שנוספו.
export function applyDetected(target, detected, manual = null) {
  const want = { airport: detected.airport === 'haifa' ? 'ramon' : detected.airport, road6: detected.road6, segment18: detected.segment18, carmel: detected.carmel || 0 };
  const added = [];
  for (const [k, v] of Object.entries(want)) {
    if (!v || (manual && manual.has(k))) continue;
    const better = k === 'carmel' ? v > target.opts[k] : target.opts[k] !== v;
    if (better) { target.opts[k] = v; target.auto[k] = v; added.push([k, v]); }
  }
  return added;
}

// ---- ספריית נסיעות ----
export const loadRides = () => readJSON(KEYS.rides, []);
// שמירה עם הגנה ממכסת האחסון (~5MB): אם אין מקום — מוותרים על מסלולי ה-GPS של הנסיעות הישנות ומנסים שוב
export function storeRides(list) {
  list = list.slice(0, 100);
  for (let keepTracks = list.length; keepTracks >= 0; keepTracks = keepTracks > 10 ? Math.floor(keepTracks / 2) : keepTracks - 1) {
    try { localStorage.setItem(KEYS.rides, JSON.stringify(keepTracks >= list.length ? list : list.map((r, i) => i < keepTracks ? r : { ...r, track: [] }))); emit('rides'); return true; }
    catch (e) { if (e.name !== 'QuotaExceededError' && e.code !== 22) return false; }
  }
  return false;
}
export function saveRide(ride) { const list = loadRides(); list.unshift(ride); storeRides(list); emit('ride-saved', ride); }
export function updateRide(ride) {
  if (ride.source === 'calc') return;
  const list = loadRides(); const i = list.findIndex((r) => r.id === ride.id);
  if (i >= 0) list[i] = ride; else list.unshift(ride);
  storeRides(list); emit('ride-saved', ride);
}
export function deleteRide(id) { storeRides(loadRides().filter((r) => r.id !== id)); emit('ride-deleted', id); }
export const lastRide = () => loadRides()[0] || null;

// ---- נסיעה חיה (שחזור אחרי סגירה) ----
export const saveLive = (obj) => writeJSON(KEYS.live, obj);
export const loadLive = () => readJSON(KEYS.live, null);
export const clearLive = () => writeJSON(KEYS.live, null);
