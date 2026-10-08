// מפה (Leaflet + OpenStreetMap): מפת הנסיעה החיה ומפה קטנה לסיכום. הספרייה נטענת מ-CDN; בלעדיה המפה פשוט לא מוצגת.
import { t } from '../i18n.js';
import { $ } from './dom.js';

const TAXI_SVG = `<svg viewBox="0 0 32 32"><path d="M7 14l2.2-5A3 3 0 0 1 12 7h8a3 3 0 0 1 2.8 2l2.2 5h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v2a2 2 0 0 1-4 0v-2H11v2a2 2 0 0 1-4 0v-2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm3.2 0h11.6l-1.4-3.2a1 1 0 0 0-.9-.6h-7a1 1 0 0 0-.9.6zM8 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0zm13 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" fill="#f2b91d"/><rect x="13" y="4" width="6" height="3" rx="1" fill="#f2b91d"/></svg>`;
export const hasLeaflet = () => typeof window.L !== 'undefined';
const LINE = '#f2b91d';

export class LiveMap {
  constructor(elId) { this.elId = elId; this.map = null; this.line = null; this.taxi = null; this.start = null; this.follow = true; this.onDrag = null; }
  ensure() {
    if (this.map || !hasLeaflet()) return this.map;
    const el = $(this.elId); if (!el) return null;
    const m = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    m.setView([32.08, 34.78], 13);
    m.on('dragstart', () => { this.follow = false; this.onDrag?.(); });
    this.line = L.polyline([], { color: LINE, weight: 5, opacity: .95, lineJoin: 'round' }).addTo(m);
    this.map = m; setTimeout(() => m.invalidateSize(), 60);
    return m;
  }
  resize() { if (this.map) setTimeout(() => this.map.invalidateSize(), 60); }
  reset() {
    if (!this.map) return;
    this.line.setLatLngs([]); this.taxi?.remove(); this.taxi = null; this.start?.remove(); this.start = null; this.follow = true;
  }
  destroy() { if (this.map) { this.map.remove(); this.map = null; this.line = null; this.taxi = null; this.start = null; } }
  recenter(lat, lon) { this.follow = true; if (this.map && lat != null) this.map.setView([lat, lon], Math.max(this.map.getZoom(), 16)); }
  addPoint(lat, lon, heading) {
    const m = this.ensure(); if (!m) return;
    if (!this.start) {
      this.start = L.marker([lat, lon], { icon: L.divIcon({ className: 'start-marker', iconSize: [14, 14] }), interactive: false }).addTo(m);
      m.setView([lat, lon], 16);
    }
    this.line.addLatLng([lat, lon]);
    if (!this.taxi) this.taxi = L.marker([lat, lon], { icon: L.divIcon({ className: 'taxi-marker', html: TAXI_SVG, iconSize: [34, 34], iconAnchor: [17, 17] }), interactive: false }).addTo(m);
    else this.taxi.setLatLng([lat, lon]);
    if (heading != null) { const svg = this.taxi.getElement()?.querySelector('svg'); if (svg) svg.style.transform = `rotate(${heading}deg)`; }
    if (this.follow) m.panTo([lat, lon], { animate: true, duration: .5 });
  }
  finish(track) {
    if (!this.map || track.length < 2) return;
    this.follow = false;
    this.map.fitBounds(L.latLngBounds(track), { padding: [24, 24], maxZoom: 16 });
  }
}
export function bearing(a, b) {
  const r = (x) => x * Math.PI / 180, y = Math.sin(r(b[1] - a[1])) * Math.cos(r(b[0]));
  const x = Math.cos(r(a[0])) * Math.sin(r(b[0])) - Math.sin(r(a[0])) * Math.cos(r(b[0])) * Math.cos(r(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// מפה קטנה (סיכום נסיעה / ספרייה): קו המסלול בלבד, ללא אינטראקציה
export function miniMap(el, track) {
  if (!hasLeaflet() || !track || track.length < 2) { el.remove(); return; }
  const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
  L.polyline(track, { color: LINE, weight: 4 }).addTo(m);
  L.marker(track[0], { icon: L.divIcon({ className: 'start-marker', iconSize: [12, 12] }), interactive: false }).addTo(m);
  L.marker(track[track.length - 1], { icon: L.divIcon({ className: 'taxi-marker', html: TAXI_SVG, iconSize: [28, 28], iconAnchor: [14, 14] }), interactive: false }).addTo(m);
  setTimeout(() => { m.invalidateSize(); m.fitBounds(L.latLngBounds(track), { padding: [16, 16], maxZoom: 16 }); }, 50);
  return m;
}
export const mapEmptyText = () => t('המפה תופיע כאן בזמן הנסיעה');
