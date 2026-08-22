/*
 * ホーム画面へ入れられるようにするためのサービスワーカー。
 *
 * **中身は意図的に空に近い。** 画面や JS を溜め込むと、自動デプロイで新しい版が
 * 出ても古いものを掴んだままになり、「直したはずの画面にならない」が起きる
 * （このアプリは push のたびに本番へ出る）。
 * ここでは取得をそのまま通すだけにして、離線での動作は狙わない。
 *
 * 溜め込みを入れるなら、版を上げるたびに古い分を捨てる仕組みとセットにすること。
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // 何も細工をしない。ブラウザに任せたときと同じ結果を返す
  event.respondWith(fetch(event.request));
});
