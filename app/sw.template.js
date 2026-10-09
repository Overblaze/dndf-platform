// The DnDF service worker: what lets the site open with no connection.
// Built by app/vite.config.ts, which fills in the list of files the app is made of.
//
// - The app's own files are kept on the device when the site is first opened.
// - Opening the site asks the network first, so a new version is picked up as soon as there is a
//   connection; with none, the copy kept on the device is used.
// - Nothing from the database is ever kept here: characters on an account, Devil Fruits and
//   pictures are fetched live, by the page, with the player's own sign-in.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const SHELL = `dndf-shell-${VERSION}`;
const FONTS = 'dndf-fonts-v1';
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(new URL(file, SCOPE).href, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('dndf-shell-') && name !== SHELL).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** The page itself: the network's copy when it answers in time, else the one kept here. */
async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),
    ]);
    if (fresh.ok) await cache.put(INDEX, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(INDEX, { ignoreVary: true })) ?? Response.error();
  }
}

/** One of the app's own files: the copy kept here, else the network's (which is then kept). */
async function file(request) {
  const cache = await caches.open(SHELL);
  // By address alone: servers mark these files as varying with request headers (Origin, Accept-Encoding),
  // and the copy kept at install was asked for with different ones than a page's own script tag sends.
  const kept = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (kept) return kept;
  const fresh = await fetch(request);
  if (fresh.ok) await cache.put(request, fresh.clone());
  return fresh;
}

/** A font: the copy kept here at once, refreshed behind it. */
async function font(request) {
  const cache = await caches.open(FONTS);
  const kept = await cache.match(request, { ignoreVary: true });
  const fresh = fetch(request).then((response) => { if (response.ok || response.type === 'opaque') void cache.put(request, response.clone()); return response; });
  if (kept) { fresh.catch(() => {}); return kept; }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)) {
    if (request.mode === 'navigate') event.respondWith(page(request));
    else if (url.pathname !== new URL('sw.js', SCOPE).pathname) event.respondWith(file(request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(font(request));
  // The table's background picture is public and never changes under one address: kept like a font.
  else if (url.pathname.includes('/storage/v1/object/public/app-background/')) event.respondWith(font(request));
  // Everything else (the database, sign-in) goes straight to the network, untouched.
});
