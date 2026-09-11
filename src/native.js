// גשר לאפליקציה המותקנת (Capacitor — Android/iOS). באתר הרגיל כל הפונקציות נופלות חזרה ל-Web API.
// הפלאגינים זמינים דרך window.Capacitor.Plugins (מוזרק על ידי ה-WebView), בלי צורך ב-bundler.
const cap = () => window.Capacitor;
export const isNative = () => !!cap()?.isNativePlatform?.();
export const platform = () => cap()?.getPlatform?.() || 'web';
const P = (name) => cap()?.Plugins?.[name];

// ---- מיקום: Geolocation plugin (הרשאות מערכת) עם נפילה ל-navigator.geolocation ----
export async function geoWatch(onFix, onErr, opts) {
  const G = isNative() && P('Geolocation');
  if (!G) {
    if (!('geolocation' in navigator)) { onErr({ code: 2, message: 'unsupported' }); return null; }
    return { web: navigator.geolocation.watchPosition(onFix, onErr, opts) };
  }
  try {
    const perm = await G.requestPermissions({ permissions: ['location'] });
    if (perm.location === 'denied') { onErr({ code: 1, message: 'denied' }); return null; }
  } catch (e) { /* ממשיכים — watchPosition יבקש בעצמו */ }
  const id = await G.watchPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: opts?.timeout || 20000 }, (pos, err) => {
    if (err) onErr({ code: /denied|permission/i.test(err.message || '') ? 1 : 2, message: err.message });
    else if (pos) onFix(pos);
  });
  return { native: id };
}
export async function geoClear(h) {
  if (!h) return;
  if (h.web != null) navigator.geolocation.clearWatch(h.web);
  if (h.native != null) await P('Geolocation')?.clearWatch({ id: h.native }).catch(() => {});
}

// ---- מסך דולק בזמן נסיעה ----
export async function keepAwake(on) {
  const K = isNative() && P('KeepAwake');
  if (!K) return null;
  try { if (on) await K.keepAwake(); else await K.allowSleep(); } catch (e) { /* */ }
  return true;
}

// ---- שיתוף קבלה (תמונה) דרך גיליון השיתוף של המערכת ----
export async function shareImage(blob, fileName, title, text) {
  const S = isNative() && P('Share'), F = isNative() && P('Filesystem');
  if (!S || !F) return false;
  const base64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  const w = await F.writeFile({ path: fileName, data: base64, directory: 'CACHE' });
  await S.share({ title, text, files: [w.uri], dialogTitle: title });
  return true;
}

// ---- התחברות: Google/Apple דרך המערכת, ואז Firebase JS SDK עם ה-credential ----
export async function nativeGoogleCredential() {
  const A = P('FirebaseAuthentication'); if (!A) throw Object.assign(new Error('no plugin'), { code: 'native/no-plugin' });
  const r = await A.signInWithGoogle({ skipNativeAuth: true });
  return { idToken: r.credential?.idToken, accessToken: r.credential?.accessToken };
}
export async function nativeAppleCredential() {
  const A = P('FirebaseAuthentication'); if (!A) throw Object.assign(new Error('no plugin'), { code: 'native/no-plugin' });
  const r = await A.signInWithApple({ skipNativeAuth: true });
  return { idToken: r.credential?.idToken, nonce: r.credential?.nonce, displayName: r.user?.displayName || null };
}
export async function nativeSignOut() { try { await P('FirebaseAuthentication')?.signOut(); } catch (e) { /* */ } }
export const hasNativeApple = () => isNative() && platform() === 'ios';

// ---- מערכת: סרגל מצב, כפתור חזרה באנדרואיד ----
export async function initNative({ onBack }) {
  if (!isNative()) return;
  document.documentElement.classList.add('native', platform());
  try { await P('StatusBar')?.setStyle({ style: 'DARK' }); await P('StatusBar')?.setBackgroundColor({ color: '#0f141d' }); } catch (e) { /* */ }
  try { await P('App')?.addListener('backButton', ({ canGoBack }) => { if (!onBack()) P('App').minimizeApp(); }); } catch (e) { /* */ }
}
