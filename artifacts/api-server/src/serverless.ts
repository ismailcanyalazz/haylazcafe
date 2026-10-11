/**
 * Vercel sunucusuz fonksiyon girişi.
 *
 * `index.ts` kalıcı bir sunucu açar (`app.listen`); Vercel'de ise her istek
 * için fonksiyon çağrılır ve dinleme yapılmaz. Bu dosya Express uygulamasını
 * olduğu gibi dışa verir — Express uygulaması zaten `(req, res)` imzalı bir
 * fonksiyon olduğu için Vercel'in Node çalışma zamanı onu doğrudan kullanır.
 *
 * Bu giriş noktası esbuild ile tek dosyaya paketlenir
 * (bkz. build.mjs → dist/serverless.mjs) ve kökteki `api/[...path].mjs`
 * dosyası bu pakete yönlendirir.
 */
import app from "./app";

export default app;
