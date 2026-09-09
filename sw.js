const CACHE = 'agenda-v1';
const FILES = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './supabase-config.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    
    // Ignora requisições diretas para a API do Supabase no cache offline
    if (e.request.url.includes('supabase.co')) return;

    e.respondWith(
        caches.match(e.request).then(cached => 
            cached || fetch(e.request).catch(() => caches.match('./index.html'))
        )
    );
});