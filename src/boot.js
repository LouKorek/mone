// אתחול שחייב לקרות לפני שמודולי הממשק נטענים: שפה ותעריפים.
// כל מודולי src/ui מייבאים את dom.js, ש-מייבא את הקובץ הזה — כך הוא תמיד רץ ראשון.
import tariffs from './data/tariffs.json' with { type: 'json' };
import { loadTariffs } from './engine.js';
import { initLang } from './i18n.js';

initLang();
loadTariffs(tariffs);
export const booted = true;
