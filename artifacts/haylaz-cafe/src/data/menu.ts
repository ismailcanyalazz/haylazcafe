/**
 * Basılı menünün kategori ve ürün adları.
 *
 * ⚠ Burada FİYAT YOKTUR ve olmamalıdır. Sitede gösterilen güncel fiyatlar
 *   her zaman veritabanından (/api/menu) gelir ve yönetim panelinden
 *   değiştirilir. Bu dosya yalnızca iki iş için kullanılır:
 *
 *   1. Google'a gönderilen yapısal veri (schema.org Menu) — arama sonuçlarında
 *      "bu kafede ne var" bilgisinin görünmesi için.
 *   2. JavaScript çalışmadan sayfayı açan tarayıcı/botlar için <noscript> menü.
 *
 *   Böylece panelden fiyat değiştirdiğinizde bu dosyayı güncellemeniz
 *   gerekmez; yalnızca menüye ürün ekleyip çıkardığınızda güncelleyin.
 *
 *   Veritabanındaki karşılığı: artifacts/api-server/src/seed-menu.ts
 */

export type StaticMenuSection = {
  title: string;
  items: string[];
};

export const staticMenu: StaticMenuSection[] = [
  {
    title: "Kahvaltı",
    items: [
      "Kaşarlı Tost",
      "Sucuklu Tost",
      "Karışık Tost",
      "Cheddar Tost",
      "Acılı Tost",
      "Kuymak",
      "Menemen",
      "Sucuklu Yumurta",
      "Tereyağlı Yumurta",
      "Mantarlı Omlet",
    ],
  },
  {
    title: "Serpme Kahvaltı",
    items: ["Serpme Kahvaltı (kişi başı, en az 2 kişilik)"],
  },
  {
    title: "Kumpir",
    items: ["Kaşarlı Kumpir", "Karışık Kumpir", "Double Karışık Kumpir"],
  },
  {
    title: "Waffle",
    items: [
      "Waffle",
      "Çubukta Waffle",
      "Bardakta Waffle",
      "Kova Waffle",
      "Double Waffle",
    ],
  },
  {
    title: "Makarnalar",
    items: [
      "Domates Soslu Makarna",
      "Mantarlı & Kremalı Makarna",
      "Mantar Tavuk Penne",
      "Pesto Makarna",
      "Çedar Makarna",
      "Barbekü Makarna",
      "Köri Makarna",
      "Dört Peynirli Makarna",
      "Yoğurtlu & Soslu Makarna",
      "Spagetti",
      "Tavuklu & Mantarlı Fettuccine",
    ],
  },
  {
    title: "Aperitifler & Atıştırmalıklar",
    items: [
      "Sigara Böreği",
      "Patates Kızartması",
      "Soğan Halkası",
      "Peynir Çubuğu",
      "Sıcak Sepet",
      "Çıtır Tavuk",
    ],
  },
  {
    title: "Soğuk İçecekler",
    items: ["Fuse Tea", "Kola", "Fanta", "Soda", "Ayran", "Churchill", "Su"],
  },
  {
    title: "Sıcak İçecekler",
    items: ["Çay", "Türk Kahvesi", "Nescafé"],
  },
];
