import type { CorsOptions } from "cors";
import type { RequestHandler } from "express";

const isProduction = () => process.env["NODE_ENV"] === "production";

/**
 * Yaygın tarayıcı saldırılarına karşı güvenlik başlıkları.
 * (helmet ile aynı işi yapar; yeni bağımlılık eklememek için elle yazıldı.)
 *
 * Content-Security-Policy bilinçli olarak eklenmedi: Clerk ve Google Fonts
 * gibi üçüncü taraf kaynaklar nedeniyle hatalı bir CSP siteyi bozabilir.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  if (isProduction()) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  // API yanıtları hiçbir zaman önbelleğe alınmamalı: fiyatlar ve sipariş
  // durumları anlık değişir.
  res.setHeader("Cache-Control", "no-store");
  next();
};

/**
 * CORS ayarları.
 *
 * Üretimde yalnızca `ALLOWED_ORIGINS` ortam değişkeninde (virgülle ayrılmış)
 * listelenen adreslere izin verilir. Değişken tanımlı değilse — Replit'te
 * site ve API aynı alan adından sunulduğu için — tarayıcı kaynağı olmayan
 * veya aynı kaynaklı istekler çalışmaya devam eder, farklı bir siteden gelen
 * istekler reddedilir.
 *
 * Geliştirmede tüm kaynaklara izin verilir.
 */
export function corsOptions(): CorsOptions {
  const configured = (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (!isProduction()) return { origin: true, credentials: true };

  return {
    credentials: true,
    origin(origin, callback) {
      // Sunucu-sunucu istekleri ve aynı kaynaklı gezinmeler Origin göndermez.
      if (!origin) return callback(null, true);
      if (configured.length === 0) return callback(null, false);
      callback(null, configured.includes(origin.replace(/\/+$/, "")));
    },
  };
}
