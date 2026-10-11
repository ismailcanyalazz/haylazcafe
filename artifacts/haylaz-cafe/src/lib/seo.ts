/**
 * Arama motoru etiketlerinin tek kaynağı.
 *
 * Bu dosya saf (pure) tutulur: React, DOM veya tarayıcı API'si kullanmaz.
 * Böylece hem derleme sırasında `vite.config.ts` içinden çağrılıp index.html'e
 * gömülebilir, hem de gerekirse uygulama içinden kullanılabilir.
 *
 * İçerik `src/data/site.ts` ve `src/data/menu.ts` dosyalarından gelir.
 */
import {
  formatAddress,
  openingHoursSpecification,
  site,
} from "../data/site";
import { staticMenu } from "../data/menu";

/** Arama motorlarına kapatılacak yollar (yönetim ve oturum ekranları). */
export const PRIVATE_PATHS = [
  "/admin",
  "/kitchen",
  "/sign-in",
  "/sign-up",
] as const;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** JSON-LD içinde </script> kaçışını engeller. */
const escapeJsonLd = (value: string) => value.replace(/</g, "\\u003c");

const trimSlash = (value: string) => value.replace(/\/+$/, "");

/** Yapılandırmada site adresi varsa mutlak URL üretir, yoksa göreli bırakır. */
export function absoluteUrl(path: string): string {
  const base = trimSlash(site.url);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
}

export const pageTitle = `${site.name} | ${site.slogan}`;

/**
 * schema.org yapısal verisi. Google'ın yerel işletme ve menü sonuçlarında
 * kullandığı alanları içerir. Eksik bırakılan işletme bilgileri çıktıya
 * eklenmez — yanlış/boş veri göndermemek için.
 */
export function buildStructuredData(): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: site.name,
    description: site.description,
    slogan: site.slogan,
    servesCuisine: [...site.servesCuisine],
    priceRange: site.priceRange,
    currenciesAccepted: "TRY",
    paymentAccepted: "Nakit, Kredi Kartı",
    image: absoluteUrl(site.shareImage),
    hasMenu: {
      "@type": "Menu",
      name: `${site.name} Menüsü`,
      inLanguage: "tr-TR",
      hasMenuSection: staticMenu.map((section) => ({
        "@type": "MenuSection",
        name: section.title,
        hasMenuItem: section.items.map((item) => ({
          "@type": "MenuItem",
          name: item,
        })),
      })),
    },
  };

  if (site.url) {
    data["@id"] = `${trimSlash(site.url)}/#cafe`;
    data["url"] = trimSlash(site.url);
  }
  if (site.phone) data["telephone"] = site.phone;
  if (site.email) data["email"] = site.email;
  if (site.mapsUrl) data["hasMap"] = site.mapsUrl;

  const { streetAddress, district, city, postalCode, country } = site.address;
  if (streetAddress || city) {
    const address: Record<string, string> = { "@type": "PostalAddress", addressCountry: country };
    if (streetAddress) address["streetAddress"] = streetAddress;
    if (district) address["addressLocality"] = district;
    if (city) address["addressRegion"] = city;
    if (postalCode) address["postalCode"] = postalCode;
    data["address"] = address;
  }

  if (site.geo.latitude && site.geo.longitude) {
    data["geo"] = {
      "@type": "GeoCoordinates",
      latitude: site.geo.latitude,
      longitude: site.geo.longitude,
    };
  }

  const hours = openingHoursSpecification();
  if (hours.length > 0) data["openingHoursSpecification"] = hours;

  const sameAs = [site.social.instagram, site.social.facebook].filter(Boolean);
  if (sameAs.length > 0) data["sameAs"] = sameAs;

  return data;
}

/**
 * index.html içindeki `<!-- @seo -->` işaretinin yerine konulacak etiketler.
 * Derleme sırasında üretilir; böylece arama motorları JavaScript çalıştırmadan
 * da başlık, açıklama, canonical ve yapısal veriyi görür.
 */
export function renderSeoTags(): string {
  const canonical = site.url ? trimSlash(site.url) + "/" : "";
  const shareImage = absoluteUrl(site.shareImage);
  const lines: string[] = [
    `<title>${escapeHtml(pageTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(site.description)}" />`,
    `<meta name="author" content="${escapeHtml(site.name)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta name="theme-color" content="#211f1d" />`,
  ];

  if (canonical) lines.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);

  lines.push(
    `<meta property="og:type" content="restaurant.restaurant" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.name)}" />`,
    `<meta property="og:locale" content="tr_TR" />`,
    `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(site.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(shareImage)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(`${site.name} — bol malzemeli fırın kumpir`)}" />`,
  );
  if (canonical) lines.push(`<meta property="og:url" content="${escapeHtml(canonical)}" />`);

  lines.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(site.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(shareImage)}" />`,
  );

  if (site.phone) {
    lines.push(`<meta property="business:contact_data:phone_number" content="${escapeHtml(site.phone)}" />`);
  }
  const address = formatAddress();
  if (address) {
    lines.push(`<meta property="business:contact_data:street_address" content="${escapeHtml(address)}" />`);
  }

  lines.push(
    `<script type="application/ld+json">${escapeJsonLd(
      JSON.stringify(buildStructuredData()),
    )}</script>`,
  );

  return lines.map((line) => `    ${line}`).join("\n");
}

/**
 * JavaScript çalışmadığında görünen menü. Arama motoru botlarının sayfayı
 * boş görmemesi için index.html'e gömülür.
 */
export function renderNoscriptMenu(): string {
  const sections = staticMenu
    .map(
      (section) =>
        `      <h2>${escapeHtml(section.title)}</h2>\n      <ul>${section.items
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`,
    )
    .join("\n");
  const address = formatAddress();
  return [
    `    <noscript>`,
    `      <h1>${escapeHtml(site.name)} — ${escapeHtml(site.slogan)}</h1>`,
    `      <p>${escapeHtml(site.description)}</p>`,
    sections,
    address ? `      <p>${escapeHtml(address)}</p>` : "",
    site.phone ? `      <p>${escapeHtml(site.phone)}</p>` : "",
    `      <p>Sipariş verebilmek için tarayıcınızda JavaScript'i etkinleştirin.</p>`,
    `    </noscript>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Yönetim ekranlarını dizine kapatan robots.txt. */
export function renderRobotsTxt(): string {
  const lines = ["User-agent: *", "Allow: /"];
  for (const path of PRIVATE_PATHS) lines.push(`Disallow: ${path}`);
  if (site.url) {
    lines.push("", `Sitemap: ${trimSlash(site.url)}/sitemap.xml`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * sitemap.xml. Site adresi girilmemişse null döner ve dosya üretilmez —
 * göreli adresli bir sitemap arama motorları tarafından reddedilir.
 */
export function renderSitemapXml(lastModified = new Date()): string | null {
  if (!site.url) return null;
  const base = trimSlash(site.url);
  const date = lastModified.toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}
