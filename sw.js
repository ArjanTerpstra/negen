/* Negen · service worker (scope ./)
 *
 * Goal: the home-screen app opens instantly and works with no network at all, while a new version of the game
 * reaches the player on the very next online launch.
 *
 *  - The app document (navigations, ./ and ./index.html): NETWORK-FIRST, revalidated past the HTTP cache
 *    (cache: 'no-cache' -> a cheap 304 when unchanged), so a deploy shows up on the next online launch.
 *    If the network has not answered within NAV_TIMEOUT the cached copy is served instead, and the network
 *    answer still lands in the cache for next time. Offline (fetch rejects at once) the cache is used immediately.
 *  - Manifest, icons, splash images and Google Fonts (fonts.googleapis.com CSS, fonts.gstatic.com files):
 *    STALE-WHILE-REVALIDATE.
 *  - Never touched: non-GET requests, Range requests, anything outside this scope (other projects share the
 *    github.io origin), and every cross-origin host except Google Fonts.
 *
 * Shipping a new index.html needs NO change here. Bump VERSION only when this file's caching rules change;
 * activate then deletes the previous negen-* caches (and only those: the origin is shared).
 */
const VERSION = 'v1';
const SHELL = `negen-shell-${VERSION}`;   // the app document
const ASSETS = `negen-assets-${VERSION}`; // manifest, icons, splash images
const FONTS = `negen-fonts-${VERSION}`;   // Google Fonts stylesheet + font files
const KEEP = [SHELL, ASSETS, FONTS];

// 2.5 s: generous enough for a cold TLS handshake plus first byte on slow 3G (~1.5-2 s), short enough that a dead
// "one bar" connection never leaves the player on the splash for long. Losing the race only costs one launch on
// the previous version: the late response still updates the cache in the background.
const NAV_TIMEOUT = 2500;
const FONT_ENTRIES = 24;

const SCOPE = self.registration.scope;               // e.g. https://arjanterpstra.github.io/negen/
const SHELL_URL = SCOPE;                             // one canonical key for ./, ./index.html, ./?anything
const SCOPE_PATH = new URL(SCOPE).pathname;
const ASSET = /^(?:manifest\.webmanifest|(?:splash\/)?[\w.-]+\.(?:png|svg|ico|webp))$/;
const FONT_HOST = /^fonts\.(?:googleapis|gstatic)\.com$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // precache the app document and the manifest; 'no-cache' revalidates so we never store a stale HTTP-cache copy
    const [shell, manifest] = await Promise.all([
      fetch(new Request(SHELL_URL, { cache: 'no-cache', credentials: 'same-origin' })),
      fetch(new Request(SCOPE + 'manifest.webmanifest', { cache: 'no-cache' })).catch(() => null),
    ]);
    if (!isDocument(shell)) throw new Error('shell not cacheable: ' + shell.status); // no shell, no offline: retry next visit
    await (await caches.open(SHELL)).put(SHELL_URL, clean(shell));
    if (manifest && manifest.ok) await (await caches.open(ASSETS)).put(SCOPE + 'manifest.webmanifest', manifest);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (!key.startsWith('negen-') || KEEP.includes(key)) continue;
      // Google font files are immutable (versioned URLs): carry them over, so an update never costs offline typefaces
      if (key.startsWith('negen-fonts-')) {
        const from = await caches.open(key), to = await caches.open(FONTS);
        for (const req of await from.keys()) if (!(await to.match(req, { ignoreVary: true }))) { const res = await from.match(req, { ignoreVary: true }); if (res) await to.put(req, res); }
      }
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(SCOPE)) return;
    const rel = url.pathname.slice(SCOPE_PATH.length);
    const isShell = rel === '' || rel === 'index.html';
    if (req.mode === 'navigate' || isShell) { event.respondWith(networkFirst(event, isShell)); return; }
    if (ASSET.test(rel)) { event.respondWith(staleWhileRevalidate(event, ASSETS)); return; }
    return; // anything else in scope: plain network, not cached
  }
  if (FONT_HOST.test(url.hostname)) { event.respondWith(staleWhileRevalidate(event, FONTS)); return; }
  // every other cross-origin request: not ours, never cached
});

// The page posts the Google Fonts URLs it already used (they load before a first-visit page is controlled),
// so the very first session is enough to play offline with the real typefaces. Browsers do not reliably list
// cross-origin font files in Resource Timing, so the font files are read from the stylesheet itself: the faces
// that cover Latin (everything Dutch and English text needs), not the dozen other subsets.
self.addEventListener('message', (event) => {
  const d = event.data;
  if (!d || d.type !== 'f3-warm' || !Array.isArray(d.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(FONTS); let n = 0;
    const get = async (u) => {
      const hit = await cache.match(u, { ignoreVary: true }); if (hit) return hit;
      const res = await fetch(new Request(u, { mode: 'cors', credentials: 'omit' }));
      if (!res.ok) throw new Error(res.status);
      await cache.put(u, res.clone()); return res;
    };
    for (const u of new Set(d.urls.filter(isFontUrl).slice(0, FONT_ENTRIES))) {
      try {
        const res = await get(u); n++;
        if (new URL(u).hostname === 'fonts.googleapis.com') for (const f of latinFaces(await res.text())) { try { await get(f); n++; } catch {} }
      } catch {}
    }
    await trim(FONTS, FONT_ENTRIES);
    const shell = !!(await caches.match(SHELL_URL, { cacheName: SHELL }));
    if (event.source && event.source.postMessage) event.source.postMessage({ type: 'f3-warmed', fonts: n, shell });
  })());
});

function isFontUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' && FONT_HOST.test(x.hostname); } catch { return false; } }

// font files of the @font-face blocks whose unicode-range covers Basic Latin (or that have no range at all)
function latinFaces(css) {
  const out = new Set();
  for (const block of css.split('@font-face').slice(1)) {
    const range = (block.match(/unicode-range:([^;}]*)/i) || [])[1];
    if (range && !/U\+0+-0*FF\b/i.test(range)) continue;
    const src = block.match(/url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"]+)\1\)/);
    if (src) out.add(src[2]);
  }
  return [...out].slice(0, 8);
}

function networkFirst(event, isShell) {
  const req = event.request;
  // navigations: revalidate past the HTTP cache (GitHub Pages sends max-age=600); keep redirects opaque for the browser
  const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : req;
  let saved = Promise.resolve();
  const net = fetch(fresh).then((res) => {
    if (isShell && isDocument(res)) { const copy = clean(res.clone()); saved = caches.open(SHELL).then((c) => c.put(SHELL_URL, copy)); }
    return res;
  });
  event.waitUntil(net.then(() => saved, () => {}).catch(() => {})); // the cache update outlives the response
  return (async () => {
    const cached = await caches.match(SHELL_URL, { cacheName: SHELL });
    if (!cached) return net.catch(() => offlinePage());
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(cached), NAV_TIMEOUT);
      net.then((res) => {
        clearTimeout(timer);
        // a broken deploy or server error must not take the game away: the shell falls back to the last good copy
        resolve(isShell && !res.ok && res.type !== 'opaqueredirect' ? cached : res);
      }, () => { clearTimeout(timer); resolve(cached); });
    });
  })();
}

function staleWhileRevalidate(event, cacheName) {
  const req = event.request, fonts = cacheName === FONTS;
  // Google's stylesheet supports CORS: fetch it that way so the cached copy is a readable (non-opaque) response
  const fetchReq = fonts && new URL(req.url).hostname === 'fonts.googleapis.com' ? new Request(req.url, { mode: 'cors', credentials: 'omit' }) : req;
  let saved = Promise.resolve();
  const net = fetch(fetchReq)
    .catch((e) => (fetchReq !== req ? fetch(req) : Promise.reject(e))) // never worse than the page's own request
    .then((res) => {
      if (res.ok || (fonts && res.type === 'opaque' && req.mode === 'no-cors')) {
        const copy = res.clone(); saved = caches.open(cacheName).then((c) => c.put(req.url, copy)).then(() => fonts && trim(cacheName, FONT_ENTRIES));
      }
      return res;
    });
  event.waitUntil(net.then(() => saved, () => {}).catch(() => {}));
  return caches.open(cacheName)
    .then((c) => c.match(req.url, { ignoreVary: true }))
    .then((hit) => hit || net);
}

const isDocument = (res) => !!res && res.ok && res.type === 'basic' && /text\/html/.test(res.headers.get('content-type') || '');

// A response that went through a redirect must not be handed to a navigation (Safari refuses it): rebuild it.
function clean(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName), keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); // oldest first (insertion order)
}

function offlinePage() {
  const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#e8ecf3"><title>Negen</title>
<style>html{height:100%;background:#e8ecf3;color:#12224f;font:500 16px/1.5 -apple-system,system-ui,sans-serif}body{margin:0;min-height:100%;display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box}
b{display:grid;place-items:center;width:72px;height:72px;margin:0 auto 22px;border-radius:17px;background:linear-gradient(145deg,#2f58d0,#142f86);box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -4px 0 rgba(0,0,0,.25),0 14px 30px -10px rgba(20,47,134,.6);color:#fff;font:700 40px Georgia,serif}
h1{font:700 22px/1.3 Georgia,serif;margin:0 0 8px}p{margin:0;opacity:.7}@media (prefers-color-scheme:dark){html{background:#0a1020;color:#eef1fb}}</style>
<body><div><b>9</b><h1>Negen heeft één keer internet nodig</h1><p>Zodra er verbinding is, start het spel vanzelf.<br>Daarna speel je ook offline.</p></div>
<script>addEventListener('online',function(){location.reload()})</script></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
