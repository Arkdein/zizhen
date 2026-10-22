/* 字斟句酌 service worker: works offline after the first visit. Bump VERSION after editing any file. */
const VERSION = 'zizhen-2026-10-22c';
const SHELL = ['./', 'index.html', 'css/app.css', 'css/fonts/zz-rare.woff2', 'js/parse.js', 'js/zz.js', 'js/app.js',
  'data/texts/taohua.js', 'data/texts/zouji.js', 'data/texts/mashuo.js', 'data/texts/zongqiu.js', 'data/texts/liujingting.js',
  'js/vendor/html2canvas.min.js', 'js/vendor/jspdf.umd.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== VERSION + '-ext').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // network first so edits arrive; cache when offline
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else if (/(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION + '-ext').then(c => c.put(req, cp)); return r; })));
  }
});
