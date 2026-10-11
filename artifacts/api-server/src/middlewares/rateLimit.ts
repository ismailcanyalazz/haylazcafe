import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Basit, bellek içi istek sınırlayıcı (sabit pencere).
 *
 * Tek sunucu örneği için yeterlidir ve yeni bağımlılık gerektirmez.
 * Birden fazla örneğe ölçeklenirse Redis tabanlı bir sınırlayıcıya geçilmeli.
 */
export function rateLimit(options: {
  /** Pencere uzunluğu (ms). */
  windowMs: number;
  /** Pencere başına izin verilen istek sayısı. */
  max: number;
  /** Sınır aşıldığında dönecek mesaj. */
  message: string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const sweep = (now: number) => {
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader("RateLimit-Limit", options.max);
      res.setHeader("RateLimit-Remaining", options.max - 1);
      next();
      return;
    }

    bucket.count += 1;
    res.setHeader("RateLimit-Limit", options.max);
    res.setHeader("RateLimit-Remaining", Math.max(0, options.max - bucket.count));

    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({ error: options.message });
      return;
    }

    next();
  };
}
