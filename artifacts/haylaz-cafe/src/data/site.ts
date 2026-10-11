/**
 * ============================================================================
 *  HAYLAZ CAFE — İŞLETME BİLGİLERİ
 * ============================================================================
 *  Sitedeki iletişim bölümü, Google için yapısal veri (JSON-LD), site başlıkları
 *  ve paylaşım kartları BU DOSYADAN beslenir. Tek yerden düzenleyin.
 *
 *  Aşağıdaki `TODO` yazan alanları doldurun; doldurulmayan alanlar sitede
 *  otomatik olarak gizlenir (boş kutu görünmez) ve Google'a eksik bilgi
 *  gönderilmez.
 *
 *  Değişiklikten sonra siteyi yeniden derleyin:
 *      pnpm --filter @workspace/haylaz-cafe run build
 * ============================================================================
 */

export type OpeningHours = {
  /** Pazartesi = 1 ... Pazar = 7 */
  days: number[];
  /** "09:00" biçiminde. Kapalı günler için bu günü listeye hiç eklemeyin. */
  opens: string;
  closes: string;
};

export type SiteConfig = {
  name: string;
  shortName: string;
  slogan: string;
  url: string;
  description: string;
  address: {
    streetAddress: string;
    district: string;
    city: string;
    postalCode: string;
    country: string;
  };
  mapsUrl: string;
  geo: { latitude: string; longitude: string };
  phone: string;
  email: string;
  social: { instagram: string; facebook: string; whatsapp: string };
  openingHours: OpeningHours[];
  priceRange: string;
  shareImage: string;
  servesCuisine: string[];
};

export const site: SiteConfig = {
  /** İşletmenin tam adı. */
  name: "Haylaz Cafe",
  shortName: "Haylaz",
  slogan: "Lezzetin En Keyifli Hali!",

  /**
   * Sitenin yayına alınacağı tam adres (sonunda / olmadan).
   * Örn. "https://haylazcafe.com". Canonical adres, sitemap ve paylaşım
   * kartları bunu kullanır. Doldurulmazsa tarayıcıdaki adres kullanılır.
   */
  url: "", // TODO: Vercel yayına alındıktan sonra tam adresi yazın, ör. "https://haylazcafe.vercel.app"

  description:
    "Nallıhan'ın lezzet durağı Haylaz Cafe: dolu dolu kumpir, bol soslu waffle, kremalı makarnalar, serpme kahvaltı ve taze kahve.",

  /** Google Haritalar ve yapısal veri için açık adres. */
  address: {
    streetAddress: "Nasuhpaşa Mah. Cami Sk. No:5",
    district: "Nallıhan",
    city: "Ankara",
    postalCode: "06920",
    country: "TR",
  },

  /**
   * Google Haritalar bağlantısı. İşletme sayfanızda "Paylaş › Bağlantıyı
   * kopyala" ile aldığınız adresi yapıştırın.
   */
  mapsUrl:
    "https://maps.google.com/maps?q=Nasuhpaşa,+Cami+Sk.+No:5,+06920+Nallıhan/Ankara",

  /** Konum koordinatları (Google Haritalar'da sağ tık › koordinatlar). */
  geo: {
    latitude: "", // TODO: ör. "41.0255"
    longitude: "", // TODO: ör. "40.5177"
  },

  /** Uluslararası biçimde: "+905xxxxxxxxx" */
  phone: "", // TODO: ör. "+905321234567" — doldurulana kadar sitede telefon gösterilmez
  email: "", // TODO (isteğe bağlı)

  social: {
    instagram: "https://instagram.com/cafehaylaz",
    facebook: "",
    whatsapp: "", // TODO: ör. "https://wa.me/905xxxxxxxxx"
  },

  /**
   * Çalışma saatleri. Kapalı olduğunuz günü listeye eklemeyin.
   * Örnek: hafta içi 08:00–23:00, hafta sonu 09:00–24:00:
   *   [{ days: [1,2,3,4,5], opens: "08:00", closes: "23:00" },
   *    { days: [6,7],       opens: "09:00", closes: "24:00" }]
   */
  openingHours: [
    // Her gün 08:00 – 00:00
    { days: [1, 2, 3, 4, 5, 6, 7], opens: "08:00", closes: "00:00" },
  ],

  /** Google'da görünen fiyat aralığı göstergesi: "₺", "₺₺" veya "₺₺₺". */
  priceRange: "₺₺",

  /** Paylaşım kartlarında kullanılacak görsel (site köküne göre). */
  shareImage: "/images/kumpir.jpg",

  /** Menüdeki ana mutfak türleri — arama motorları için. */
  servesCuisine: ["Kumpir", "Waffle", "Kahvaltı", "Makarna", "Kahve"],
};

const DAY_NAMES = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
] as const;

const SCHEMA_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "Pazartesi – Cuma: 08:00–23:00" gibi, sitede gösterilecek satırlar. */
export function formatOpeningHours(): string[] {
  return site.openingHours.map((entry) => {
    const days = [...entry.days].sort((a, b) => a - b);
    const labels = days.map((day) => DAY_NAMES[day - 1]).filter(Boolean);
    const isRange =
      days.length > 2 && days.every((day, index) => index === 0 || day === days[index - 1]! + 1);
    const dayLabel = isRange
      ? `${labels[0]} – ${labels[labels.length - 1]}`
      : labels.join(", ");
    return `${dayLabel}: ${entry.opens} – ${entry.closes}`;
  });
}

/** schema.org openingHoursSpecification dizisi. */
export function openingHoursSpecification() {
  return site.openingHours.map((entry) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: entry.days.map((day) => SCHEMA_DAYS[day - 1]).filter(Boolean),
    opens: entry.opens,
    closes: entry.closes,
  }));
}

/** "Cumhuriyet Mah. Atatürk Cad. No:12, Merkez / Rize" */
export function formatAddress(): string {
  const { streetAddress, district, city } = site.address;
  const tail = [district, city].filter(Boolean).join(" / ");
  return [streetAddress, tail].filter(Boolean).join(", ");
}

/** "+90 5xx xxx xx xx" biçiminde okunabilir telefon. */
export function formatPhone(): string {
  const digits = site.phone.replace(/[^\d+]/g, "");
  const match = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits);
  return match ? `+90 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : site.phone;
}

export const hasAddress = () => Boolean(site.address.streetAddress || site.address.city);
export const hasHours = () => site.openingHours.length > 0;
