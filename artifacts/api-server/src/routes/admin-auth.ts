import { Router, type IRouter } from "express";
import {
  adminAuthConfigured,
  clearSessionCookieHeader,
  createSessionToken,
  sessionCookieHeader,
  verifyAdminPassword,
} from "../lib/cafe-auth";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();

/**
 * Şifre deneme sınırı. Tek şifreli bir panelde kaba kuvvet denemesi en
 * gerçekçi saldırıdır; IP başına 15 dakikada 8 denemeye izin verilir.
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 8,
  message:
    "Çok fazla hatalı giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.",
});

router.post("/admin/login", loginRateLimit, (req, res): void => {
  if (!adminAuthConfigured()) {
    res.status(503).json({
      error:
        "Yönetim paneli yapılandırılmamış. Sunucuda ADMIN_PASSWORD ve ADMIN_SESSION_SECRET tanımlanmalı.",
    });
    return;
  }

  const body: unknown = req.body;
  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { password?: unknown }).password
      : undefined;

  if (typeof password !== "string" || password.length === 0) {
    res.status(400).json({ error: "Şifre girilmedi." });
    return;
  }

  if (!verifyAdminPassword(password)) {
    // Hangi kısmın yanlış olduğunu ele vermeyen tek bir mesaj.
    res.status(401).json({ error: "Şifre hatalı." });
    return;
  }

  res.setHeader("Set-Cookie", sessionCookieHeader(createSessionToken()));
  res.json({ ok: true });
});

router.post("/admin/logout", (_req, res): void => {
  res.setHeader("Set-Cookie", clearSessionCookieHeader());
  res.json({ ok: true });
});

export default router;
