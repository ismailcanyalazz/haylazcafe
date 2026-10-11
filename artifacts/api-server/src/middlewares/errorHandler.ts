import type { ErrorRequestHandler, RequestHandler } from "express";
import { logger } from "../lib/logger";

/** Bilinmeyen /api yolları için HTML yerine JSON 404 döndürür. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Kaynak bulunamadı: ${req.method} ${req.path}` });
};

/**
 * Son çare hata yakalayıcı.
 *
 * Bu olmadan Express, yığın izini (stack trace) HTML olarak döndürür; bu hem
 * istemcide çözümlenemez hem de sunucu iç yapısını sızdırır.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  // Gövdesi bozuk JSON olan istekler (express.json çözümleme hatası).
  if (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as { status?: number }).status === 400
  ) {
    res.status(400).json({ error: "İstek gövdesi geçerli bir JSON değil." });
    return;
  }

  // express.json limit aşımı.
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({ error: "İstek gövdesi çok büyük." });
    return;
  }

  logger.error(
    { err: error, method: req.method, url: req.originalUrl?.split("?")[0] },
    "Beklenmeyen sunucu hatası",
  );

  res.status(500).json({
    error: "Beklenmeyen bir hata oluştu. Lütfen kısa süre sonra tekrar deneyin.",
  });
};
