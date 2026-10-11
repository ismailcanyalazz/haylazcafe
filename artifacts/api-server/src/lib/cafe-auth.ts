import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";

/**
 * Yönetim paneli kimlik doğrulaması — tek şifre + imzalı çerez.
 *
 * Üçüncü parti bir kimlik sağlayıcıya (Clerk vb.) bağımlılık yoktur.
 * Tek kişilik bir işletme paneli için yeterli ve Vercel'in sunucusuz
 * ortamında durum (state) tutmadan çalışır:
 *
 *  1. `/api/admin/login` şifreyi doğrular ve HMAC ile imzalanmış, son
 *     kullanma tarihi olan bir oturum jetonunu HttpOnly çerezde saklar.
 *  2. Her korumalı istekte çerezdeki imza yeniden hesaplanıp karşılaştırılır.
 *     Sunucuda oturum tablosu tutulmaz.
 *
 * Gerekli ortam değişkenleri:
 *   ADMIN_PASSWORD        — panele giriş şifresi (zorunlu)
 *   ADMIN_SESSION_SECRET  — jeton imzalama anahtarı (zorunlu, uzun ve rastgele)
 *   ADMIN_EMAIL           — fiyat geçmişinde "kim değiştirdi" olarak görünür (isteğe bağlı)
 */

const COOKIE_NAME = "haylaz_admin";
/** Oturum süresi: 12 saat. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_VERSION = "v1";

export class AdminAuthConfigError extends Error {}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * İmzalama anahtarı. Tanımlı değilse oturum açılamaz — şifreden türetilmiş
 * zayıf bir anahtara sessizce düşmek, jetonun tahmin edilebilir olması
 * demek olurdu.
 */
function sessionSecret(): string {
  const secret = readEnv("ADMIN_SESSION_SECRET");
  if (secret.length < 32) {
    throw new AdminAuthConfigError(
      "ADMIN_SESSION_SECRET tanımlı değil ya da 32 karakterden kısa.",
    );
  }
  return secret;
}

function adminPassword(): string {
  const password = readEnv("ADMIN_PASSWORD");
  if (password.length < 8) {
    throw new AdminAuthConfigError(
      "ADMIN_PASSWORD tanımlı değil ya da 8 karakterden kısa.",
    );
  }
  return password;
}

/** Yönetim girişi yapılandırılmış mı? (Yapılandırılmamışsa panel tamamen kapalıdır.) */
export function adminAuthConfigured(): boolean {
  try {
    adminPassword();
    sessionSecret();
    return true;
  } catch {
    return false;
  }
}

/** Fiyat geçmişi kayıtlarında görünecek etiket. */
export function adminLabel(): string {
  return readEnv("ADMIN_EMAIL") || "yönetici";
}

/**
 * Uzunluktan ve içerikten sızıntı olmaması için her iki değer de önce
 * sabit uzunlukta bir özete indirgenir, sonra sabit zamanlı karşılaştırılır.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const secret = "haylaz-compare";
  const digestA = createHmac("sha256", secret).update(a).digest();
  const digestB = createHmac("sha256", secret).update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function verifyAdminPassword(candidate: string): boolean {
  return constantTimeEquals(candidate, adminPassword());
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

/** `v1.<sonKullanma>.<rastgele>.<imza>` biçiminde oturum jetonu üretir. */
export function createSessionToken(now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS;
  const nonce = randomBytes(12).toString("hex");
  const payload = `${TOKEN_VERSION}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/** Jeton geçerliyse son kullanma zamanını, değilse null döner. */
export function verifySessionToken(
  token: string,
  now = Date.now(),
): { expiresAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, rawExpiry, nonce, signature] = parts;
  if (version !== TOKEN_VERSION || !rawExpiry || !nonce || !signature) return null;

  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  const payload = `${version}.${rawExpiry}.${nonce}`;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  if (!constantTimeEquals(signature, expected)) return null;

  return { expiresAt };
}

function readCookie(req: Request): string | null {
  const fromParser = (req as Request & { cookies?: Record<string, unknown> })
    .cookies?.[COOKIE_NAME];
  if (typeof fromParser === "string") return fromParser;

  // cookie-parser devre dışıysa başlığı doğrudan çözümle.
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === COOKIE_NAME) {
      return decodeURIComponent(pair.slice(index + 1).trim());
    }
  }
  return null;
}

/** İsteğin açık bir yönetici oturumu var mı? */
export function hasAdminSession(req: Request): boolean {
  if (!adminAuthConfigured()) return false;
  const token = readCookie(req);
  return token !== null && verifySessionToken(token) !== null;
}

const cookieAttributes = (maxAgeSeconds: number) => {
  const attributes = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  // Yerel geliştirmede http üzerinden çalışıldığı için Secure yalnızca
  // üretimde eklenir; aksi halde çerez hiç gönderilmez.
  if (process.env["NODE_ENV"] === "production") attributes.push("Secure");
  return attributes.join("; ");
};

export function sessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(
    Math.floor(SESSION_TTL_MS / 1000),
  )}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

/** Korumalı yönetim uç noktaları için koruma katmanı. */
export const requireCafeAdmin: RequestHandler = (req, res, next) => {
  if (!adminAuthConfigured()) {
    res.status(503).json({
      error:
        "Yönetim paneli yapılandırılmamış. Sunucuda ADMIN_PASSWORD ve ADMIN_SESSION_SECRET tanımlanmalı.",
    });
    return;
  }
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: "Oturum açmanız gerekiyor." });
    return;
  }
  res.locals["cafeAdminUserId"] = "admin";
  res.locals["cafeAdminEmail"] = adminLabel();
  next();
};

/**
 * Eski Clerk kurulumundan kalan ad; artık yönetici oturumuyla aynı şeyi
 * ifade ediyor. Rotalardaki kullanım bozulmasın diye korunuyor.
 */
export const requireCafeSignIn: RequestHandler = requireCafeAdmin;
