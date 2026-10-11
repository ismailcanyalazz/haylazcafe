/**
 * Vercel sunucusuz fonksiyonu — tüm /api/* istekleri buraya düşer.
 *
 * Dosya adındaki [...path] Vercel'in "catch-all" biçimidir: /api/menu,
 * /api/admin/login gibi tüm alt yollar tek fonksiyona yönlenir ve istekteki
 * özgün yol korunur.
 *
 * Asıl uygulama derleme sırasında tek dosyaya paketlenir:
 *   pnpm --filter @workspace/api-server run build
 *     → artifacts/api-server/dist/serverless.mjs
 *
 * Buradan yalnızca o paket içe aktarılır; böylece Vercel'in pnpm çalışma
 * alanı paketlerini (@workspace/db, @workspace/api-zod) ayrıca çözmesi
 * gerekmez.
 */
export { default } from '../artifacts/api-server/dist/serverless.mjs';
