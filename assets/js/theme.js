// Light and dark themes on one page. The inline script in layout.html sets html[data-theme] before
// first paint (from ?theme=light|dark, then localStorage "bc-theme", default DARK); this module owns
// changes after that: the nav toggle calls set(), which remembers the choice, cross-fades the grounds,
// updates <meta name="theme-color"> and tells subscribers.
//   ctx.theme.get()          'dark' | 'light'
//   ctx.theme.on(fn)         fn(theme) after every change; returns an unsubscribe function
//   ctx.theme.set('light')   what the toggle does
// A .stage band (and the nav bar and footer) is deep brand-blue with dark-set tokens in both themes, so code that draws inside one can ignore the theme.
// Sections that paint with JS (canvas, SVG fills) read colors from CSS tokens with tokenColor(el, name)
// and repaint on change; they never keep a literal color that only works on one ground.
const KEY = 'bc-theme';
const root = document.documentElement;
const subs = new Set();
const META = { dark: '#06080F', light: '#F4F3EF' };

export const getTheme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');
/** The theme an element is drawn in: dark inside a .stage band, otherwise the page theme. */
export const themeOf = (el) => (el?.closest?.('.stage, .chrome, #s15, .ground-dark') ? 'dark' : el?.closest?.('.ground-daylight') ? 'light' : getTheme());
/** A token's computed value on an element, e.g. tokenColor(el, '--bc-out'). */
export const tokenColor = (el, name) => getComputedStyle(el || root).getPropertyValue(name).trim();

function syncMeta(t) {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', META[t]);
}

export function setTheme(t, { persist = true, animate = true } = {}) {
  t = t === 'light' ? 'light' : 'dark';
  if (t === getTheme()) return;
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 320);
  }
  root.dataset.theme = t;
  syncMeta(t);
  if (persist) { try { localStorage.setItem(KEY, t); } catch { /* private mode: the choice lasts this page only */ } }
  for (const fn of [...subs]) { try { fn(t); } catch (e) { console.error(e); } }
  document.dispatchEvent(new CustomEvent('bc:themechange', { detail: { theme: t } }));
}

export function onTheme(fn) { subs.add(fn); return () => subs.delete(fn); }

export function initTheme() {
  if (!root.dataset.theme) root.dataset.theme = 'dark';
  syncMeta(getTheme());
  return { get: getTheme, set: setTheme, on: onTheme, of: themeOf, token: tokenColor };
}
