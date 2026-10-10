// Duskhollow service worker: precache everything, network-first with cache fallback (so updates show, offline still works).
const CACHE = 'duskhollow-v1';
const ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './vendor/phaser.min.js', './vendor/easystar.min.js',
  './src/tiledefs.js', './src/data.js', './src/main.js',
  './assets/grassland_tiles.png', './assets/hero.png', './assets/light.png', './assets/glow.png',
  './assets/npc_smith.png', './assets/npc_healer.png', './assets/npc_innkeeper.png',
  './assets/npc_sage.png', './assets/npc_barmaid.png', './assets/npc_trader.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
