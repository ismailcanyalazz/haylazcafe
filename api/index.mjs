/**
 * Vercel sunucusuz fonksiyonu — tüm /api/* istekleri buraya düşer.
 *
 * Yönlendirme vercel.json içindeki rewrite ile yapılır:
 *   /api/(.*)  ->  /api/index?__vpath=$1
 *
 * Neden böyle: dosya adıyla yapılan "catch-all" (api/[...path].mjs) yalnızca
 * tek segmenti eşleştirdi; /api/menu çalışırken /api/admin/access Vercel'in
 * 404'üne düşüyordu. Açık rewrite + aşağıdaki yol kurtarma, Vercel'in
 * req.url'i koruyup korumadığından bağımsız olarak doğru yolu üretir:
 *
 *   - req.url korunmuşsa  (__vpath yok)      -> olduğu gibi kullanılır
 *   - req.url yeniden yazılmışsa (__vpath var) -> /api/<yol> olarak kurulur
 *
 * Asıl uygulama derleme sırasında tek dosyaya paketlenir:
 *   pnpm --filter @workspace/api-server run build
 *     -> artifacts/api-server/dist/serverless.mjs
 */
import app from '../artifacts/api-server/dist/serverless.mjs';

export default function handler(req, res) {
  const raw = req.url || '/';

  if (raw.includes('__vpath=')) {
    const url = new URL(raw, 'http://localhost');
    const captured = url.searchParams.get('__vpath') ?? '';
    url.searchParams.delete('__vpath');
    const query = url.searchParams.toString();
    const path = captured.startsWith('/') ? captured.slice(1) : captured;
    req.url = `/api/${path}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
}
