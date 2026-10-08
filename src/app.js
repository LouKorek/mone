// נקודת הכניסה של "מונה". הסדר כאן חשוב: שפה ותעריפים קודם, אחר כך המסכים, ורק בסוף ניווט ראשון.
// המסכים מוגדרים במודולים שב-src/ui; כל אחד רושם את עצמו (defineScreen) כשהוא נטען.
import { translateStatic } from './i18n.js';
import { isNative, initNative } from './native.js';
import { $, toast, initSheet, go, back, sheetOpen, closeSheet, currentScreen } from './ui/dom.js';
import { homeReady } from './ui/home.js';
import { currentEstimate } from './ui/estimate.js';
import { restoreLive, isRunning, setPendingReload } from './ui/live.js';
import { shownRide } from './ui/summary.js';
import './ui/rides.js';
import { applyTheme, pwa } from './ui/more.js';
import { startCloud, syncRides, currentUser } from './ui/account.js';
import { t } from './i18n.js';

applyTheme();
translateStatic();
initSheet();

// מסך ראשון: נסיעה פעילה שנשמרה → מונה חי; אחרת → בית
go('home', {}, { root: true });
if (restoreLive()) go('live');

startCloud();

// ============ PWA: עבודה בלי אינטרנט, עדכונים והתקנה ============
if (!isNative() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast(t('הורדה גרסה חדשה של מונה')); });
    });
  }).catch((e) => console.warn('sw', e));
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }       // התקנה ראשונה — אין מה לרענן
    if (isRunning()) { setPendingReload(() => location.reload()); return; }   // באמצע נסיעה לא מרעננים; נרענן אחרי הסיום
    location.reload();
  });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pwa.installEvt = e; });
window.addEventListener('appinstalled', () => { pwa.installEvt = null; toast(t('מונה הותקנה במסך הבית')); });

// מצב רשת
function renderOnline() { document.body.classList.toggle('offline', !navigator.onLine); }
window.addEventListener('online', () => { renderOnline(); if (currentUser()) syncRides(); });
window.addEventListener('offline', renderOnline);
renderOnline();

// ============ אפליקציה מותקנת (Android/iOS): כפתור חזרה ============
initNative({ onBack: () => { if (back()) return true; if (currentScreen() !== 'home') { go('home', {}, { root: true }); return true; } return false; } });

// לבדיקות ולתצוגה מקדימה
window.__mone = { go, currentScreen, currentEstimate, shownRide, homeReady, sheetOpen, closeSheet };
