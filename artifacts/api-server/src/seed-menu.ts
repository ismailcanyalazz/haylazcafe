/**
 * Haylaz Cafe — basılı menünün veritabanına aktarılması.
 *
 * Çalıştırma:
 *   pnpm --filter @workspace/api-server run seed:menu
 *
 * Fiyatları basılı menüdeki değerlere geri döndürmek için (yönetim panelinde
 * yapılmış fiyat değişikliklerini EZER):
 *   pnpm --filter @workspace/api-server run seed:menu -- --force-prices
 *
 * Script tekrar tekrar çalıştırılabilir (idempotent):
 *  - Yeni ürün/seçenek varsa ekler.
 *  - Var olan kayıtların adını, kategorisini, açıklamasını ve sırasını günceller.
 *  - Var olan kayıtların FİYATINA ve satış durumuna dokunmaz; böylece panelden
 *    yapılan fiyat güncellemeleri korunur (--force-prices bunu değiştirir).
 *  - Menüden kaldırılmış ürünleri silmez, yalnızca raporlar.
 */
import { asc, eq, isNull, notInArray, sql } from "drizzle-orm";
import {
  db,
  menuOptionsTable,
  pool,
  productsTable,
} from "@workspace/db";

type PricingModel = "free" | "per_selection" | "per_unit" | "price_delta";

type SeedOption = {
  group: string;
  name: string;
  /** Kuruş cinsinden. null ise, panelden fiyat girilene kadar satışa kapalı kalır. */
  priceCents: number | null;
  pricingModel?: PricingModel;
  maxQuantity?: number;
};

type SeedProduct = {
  slug: string;
  name: string;
  description: string;
  /** Kuruş cinsinden: 75 TL -> 7500 */
  priceCents: number;
  options?: SeedOption[];
};

type SeedCategory = {
  /** Menüde ve sitede görünen kategori adı. */
  title: string;
  imageUrl: string | null;
  products: SeedProduct[];
};

/** Basılı menüdeki TL tutarını kuruşa çevirir. */
const lira = (value: number) => value * 100;

const free = (group: string, names: string[]): SeedOption[] =>
  names.map((name) => ({ group, name, priceCents: 0, pricingModel: "free" }));

const unpriced = (group: string, names: string[]): SeedOption[] =>
  names.map((name) => ({ group, name, priceCents: null }));

/** Kumpir sipariş fişindeki malzemeler ve soslar — fiyata dahil. */
const KUMPIR_OPTIONS: SeedOption[] = [
  ...free("Malzemeler", [
    "Tereyağı",
    "Kaşar",
    "Mısır",
    "Zeytin",
    "Kısır",
    "Havuç Tarator",
    "Rus Salatası",
    "Turşu",
    "Mor Lahana",
    "Jalapeño Biber",
    "Kapya Biber",
  ]),
  ...free("Soslar", [
    "Ketçap",
    "Mayonez",
    "Acı Sos",
    "Barbekü Sos",
    "Ranch Sos",
    "Sos Karışık",
  ]),
  ...unpriced("Ekstra Malzeme", ["Sosis"]),
];

/** Waffle sipariş fişindeki meyveler, soslar ve ekstralar. */
const WAFFLE_OPTIONS: SeedOption[] = [
  ...free("Meyveler", ["Çilek", "Muz", "Kivi"]),
  ...free("Soslar", [
    "Sütlü Çikolata",
    "Bitter Çikolata",
    "Beyaz Çikolata",
    "Karamel Sos",
    "Fıstık Sosu",
  ]),
  ...unpriced("Ekstra Malzeme", [
    "Bonibon",
    "Çokel Taşı",
    "Pirinç Patlağı",
    "Renkli Pasta Süsü",
    "Renkli Draje",
    "Kakaolu Toplar",
    "Beyaz Toplar",
    "Karamel Parçacık",
    "Kakaolu Gevrek",
  ]),
];

const SERPME_ICERIK = [
  "Siyah zeytin",
  "Yeşil zeytin",
  "Bal",
  "Tereyağı",
  "Kaymak",
  "3 çeşit reçel",
  "Çikolata kreması",
  "Beyaz peynir",
  "Kaşar peynir",
  "Lor peynir",
  "Süzme peynir",
  "Burgu peynir",
  "Top peynir",
  "Tel peynir",
  "Kahvaltılık sos",
  "Sucuklu yumurta",
  "Patates kızartması",
  "Sigara böreği",
  "Soğan halkası",
  "Menemen",
  "Domates",
  "Salatalık",
  "Yeşillik",
  "Mevsim meyveleri",
].join(", ");

export const MENU: SeedCategory[] = [
  {
    title: "Kahvaltı",
    imageUrl: "/images/breakfast.jpg",
    products: [
      { slug: "kasarli-tost", name: "Kaşarlı Tost", priceCents: lira(75), description: "Bol kaşarlı, kızgın tostta eritilmiş klasik lezzet." },
      { slug: "sucuklu-tost", name: "Sucuklu Tost", priceCents: lira(100), description: "Dilim sucuk ve kaşar ile hazırlanan doyurucu tost." },
      { slug: "karisik-tost", name: "Karışık Tost", priceCents: lira(100), description: "Sucuk, kaşar ve salamın bir arada buluştuğu karışık tost." },
      { slug: "cheddar-tost", name: "Cheddar Tost", priceCents: lira(130), description: "Akışkan cheddar peyniriyle hazırlanan özel tost." },
      { slug: "acili-tost", name: "Acılı Tost", priceCents: lira(130), description: "Acı sevenler için jalapeño ve acı sos eşliğinde." },
      { slug: "kuymak", name: "Kuymak", priceCents: lira(200), description: "Tereyağı ve tel peynirle, bakır sahanda sıcak servis." },
      { slug: "menemen", name: "Menemen", priceCents: lira(150), description: "Domates, biber ve yumurta ile ocakta pişen klasik menemen." },
      { slug: "sucuklu-yumurta", name: "Sucuklu Yumurta", priceCents: lira(150), description: "Sahanda sucuklu yumurta, taze ekmek eşliğinde." },
      { slug: "tereyagli-yumurta", name: "Tereyağlı Yumurta", priceCents: lira(100), description: "Tereyağında pişirilmiş, sade ve doyurucu sahanda yumurta." },
      { slug: "mantarli-omlet", name: "Mantarlı Omlet", priceCents: lira(150), description: "Taze mantar ve kaşar ile kabartılmış omlet." },
    ],
  },
  {
    title: "Serpme Kahvaltı",
    imageUrl: "/images/breakfast.jpg",
    products: [
      {
        slug: "serpme-kahvalti",
        name: "Serpme Kahvaltı",
        priceCents: lira(250),
        description: `Kişi başı fiyattır ve en az 2 kişilik verilir. İçindekiler: ${SERPME_ICERIK}.`,
      },
    ],
  },
  {
    title: "Kumpir",
    imageUrl: "/images/kumpir.jpg",
    products: [
      { slug: "kasarli-kumpir", name: "Kaşarlı Kumpir", priceCents: lira(180), description: "Fırından yeni çıkan patates, tereyağı ve bol kaşarla ezilerek hazırlanır. Malzemelerini sen seç.", options: KUMPIR_OPTIONS },
      { slug: "karisik-kumpir", name: "Karışık Kumpir", priceCents: lira(230), description: "Dilediğin tüm malzemelerle doldurulan, Haylaz'ın en çok tercih edilen kumpiri.", options: KUMPIR_OPTIONS },
      { slug: "double-karisik-kumpir", name: "Double Karışık Kumpir", priceCents: lira(280), description: "Çift porsiyon patates ve iki kat malzeme: paylaşmalık büyük boy kumpir.", options: KUMPIR_OPTIONS },
    ],
  },
  {
    title: "Waffle",
    imageUrl: "/images/waffle.jpg",
    products: [
      { slug: "waffle", name: "Waffle", priceCents: lira(200), description: "Sıcacık waffle hamuru; meyvelerini, soslarını ve ekstralarını kendin seç.", options: WAFFLE_OPTIONS },
      { slug: "cubukta-waffle", name: "Çubukta Waffle", priceCents: lira(150), description: "Yürürken yemelik, çubuğa geçirilmiş pratik waffle.", options: WAFFLE_OPTIONS },
      { slug: "bardakta-waffle", name: "Bardakta Waffle", priceCents: lira(150), description: "Kat kat waffle, meyve ve sos; bardakta servis edilir.", options: WAFFLE_OPTIONS },
      { slug: "kova-waffle", name: "Kova Waffle", priceCents: lira(200), description: "Bol malzemeli, paylaşmaya da uygun kova sunum.", options: WAFFLE_OPTIONS },
      { slug: "double-waffle", name: "Double Waffle", priceCents: lira(250), description: "Çift waffle, çift keyif. İki kişilik tatlı molası.", options: WAFFLE_OPTIONS },
    ],
  },
  {
    title: "Makarnalar",
    imageUrl: "/images/pasta.jpg",
    products: [
      { slug: "domates-soslu-makarna", name: "Domates Soslu Makarna", priceCents: lira(150), description: "Ev yapımı domates sosu ve fesleğenle hazırlanır." },
      { slug: "mantarli-kremali-makarna", name: "Mantarlı & Kremalı Makarna", priceCents: lira(180), description: "Taze mantar ve krema ile pişirilen kadifemsi sos." },
      { slug: "mantar-tavuk-penne", name: "Mantar Tavuk Penne", priceCents: lira(220), description: "Izgara tavuk parçaları ve mantarla penne makarna." },
      { slug: "pesto-makarna", name: "Pesto Makarna", priceCents: lira(180), description: "Fesleğenli pesto sos ve parmesan dokunuşu." },
      { slug: "cedar-makarna", name: "Çedar Makarna", priceCents: lira(200), description: "Eritilmiş çedar peyniriyle hazırlanan kremsi makarna." },
      { slug: "barbeku-makarna", name: "Barbekü Makarna", priceCents: lira(220), description: "Tütsülenmiş barbekü sos ve tavukla hazırlanır." },
      { slug: "kori-makarna", name: "Köri Makarna", priceCents: lira(220), description: "Köri baharatı ve krema ile hafif baharatlı tabak." },
      { slug: "dort-peynirli-makarna", name: "Dört Peynirli Makarna", priceCents: lira(220), description: "Dört farklı peynirin buluştuğu yoğun lezzet." },
      { slug: "yogurtlu-soslu-makarna", name: "Yoğurtlu & Soslu Makarna", priceCents: lira(170), description: "Sarımsaklı yoğurt ve tereyağlı sos ile servis edilir." },
      { slug: "spagetti", name: "Spagetti", priceCents: lira(150), description: "İnce uzun spagetti, klasik sosuyla." },
      { slug: "tavuklu-mantarli-fettuccine", name: "Tavuklu & Mantarlı Fettuccine", priceCents: lira(240), description: "Geniş fettuccine, tavuk ve mantarlı kremalı sosla." },
    ],
  },
  {
    title: "Aperitifler & Atıştırmalıklar",
    imageUrl: null,
    products: [
      { slug: "sigara-boregi", name: "Sigara Böreği", priceCents: lira(70), description: "Peynirli, çıtır çıtır kızartılmış el açması börek." },
      { slug: "patates-kizartmasi", name: "Patates Kızartması", priceCents: lira(120), description: "Dışı çıtır, içi yumuşak; sosuyla birlikte." },
      { slug: "sogan-halkasi", name: "Soğan Halkası", priceCents: lira(100), description: "Galeta ununa bulanmış, altın rengi soğan halkaları." },
      { slug: "peynir-cubugu", name: "Peynir Çubuğu", priceCents: lira(120), description: "İçi uzayan peynirli çubuklar, sıcak servis." },
      { slug: "sicak-sepet", name: "Sıcak Sepet", priceCents: lira(180), description: "Patates, soğan halkası, sigara böreği ve çıtır tavuk bir arada paylaşmalık sepet." },
      { slug: "citir-tavuk", name: "Çıtır Tavuk", priceCents: lira(180), description: "Baharatlı galeta ile kaplanmış, çıtır tavuk parçaları." },
    ],
  },
  {
    title: "Soğuk İçecekler",
    imageUrl: "/images/coffee.jpg",
    products: [
      { slug: "fuse-tea", name: "Fuse Tea", priceCents: lira(80), description: "Buz gibi soğuk çay." },
      { slug: "kola", name: "Kola", priceCents: lira(80), description: "Soğuk kutu kola." },
      { slug: "fanta", name: "Fanta", priceCents: lira(80), description: "Portakal aromalı gazlı içecek." },
      { slug: "soda", name: "Soda", priceCents: lira(40), description: "Sade maden suyu." },
      { slug: "ayran", name: "Ayran", priceCents: lira(50), description: "Günlük, köpüklü ayran." },
      { slug: "churchill", name: "Churchill", priceCents: lira(70), description: "Limonlu, zencefilli ve buzlu klasik Churchill." },
      { slug: "su", name: "Su", priceCents: lira(20), description: "0,5 lt içme suyu." },
    ],
  },
  {
    title: "Sıcak İçecekler",
    imageUrl: "/images/coffee.jpg",
    products: [
      { slug: "cay", name: "Çay", priceCents: lira(15), description: "Demlikte demlenen, ince belli bardakta çay." },
      { slug: "turk-kahvesi", name: "Türk Kahvesi", priceCents: lira(70), description: "Közde pişirilen, bol köpüklü Türk kahvesi." },
      { slug: "nescafe", name: "Nescafé", priceCents: lira(60), description: "Sıcak, sütlü ya da sade hazır kahve." },
    ],
  },
];

type FlatProduct = typeof productsTable.$inferInsert & { seedOptions: SeedOption[] };

function flattenMenu(): FlatProduct[] {
  const rows: FlatProduct[] = [];
  MENU.forEach((category, categoryIndex) => {
    category.products.forEach((product, productIndex) => {
      rows.push({
        slug: product.slug,
        name: product.name,
        category: category.title,
        description: product.description,
        imageUrl: category.imageUrl,
        basePriceCents: product.priceCents,
        isActive: true,
        // Kategoriler arası global sıralama: basılı menü sırası korunur.
        sortOrder: (categoryIndex + 1) * 1000 + productIndex,
        seedOptions: product.options ?? [],
      });
    });
  });
  return rows;
}

async function main() {
  const forcePrices = process.argv.includes("--force-prices");
  const seedProducts = flattenMenu();
  const seedSlugs = seedProducts.map((product) => product.slug);

  console.log(
    `Haylaz Cafe menüsü aktarılıyor — ${MENU.length} kategori, ${seedProducts.length} ürün.` +
      (forcePrices ? "\n⚠  --force-prices: fiyatlar basılı menüdeki değerlere sıfırlanacak." : ""),
  );

  const before = await db
    .select({ slug: productsTable.slug })
    .from(productsTable);
  const knownSlugs = new Set(before.map((row) => row.slug));
  const newProducts = seedSlugs.filter((slug) => !knownSlugs.has(slug)).length;

  let newOptions = 0;

  await db.transaction(async (tx) => {
    for (const { seedOptions, ...product } of seedProducts) {
      const [row] = await tx
        .insert(productsTable)
        .values(product)
        .onConflictDoUpdate({
          target: productsTable.slug,
          set: {
            name: product.name,
            category: product.category,
            description: product.description,
            imageUrl: product.imageUrl,
            sortOrder: product.sortOrder,
            // Fiyat ve satış durumu yalnızca --force-prices ile ezilir; aksi
            // halde yönetim panelinden yapılan değişiklikler korunur.
            ...(forcePrices
              ? { basePriceCents: product.basePriceCents, isActive: true }
              : {}),
          },
        })
        .returning({ id: productsTable.id });

      if (!row) throw new Error(`${product.slug} kaydedilemedi.`);

      const existingOptions = await tx
        .select({ group: menuOptionsTable.group, name: menuOptionsTable.name })
        .from(menuOptionsTable)
        .where(eq(menuOptionsTable.productId, row.id));
      const existingKeys = new Set(
        existingOptions.map((option) => `${option.group}\u0000${option.name}`),
      );

      for (const [index, option] of seedOptions.entries()) {
        if (!existingKeys.has(`${option.group}\u0000${option.name}`)) newOptions += 1;

        await tx
          .insert(menuOptionsTable)
          .values({
            productId: row.id,
            group: option.group,
            name: option.name,
            priceCents: option.priceCents,
            pricingModel: option.pricingModel ?? "per_selection",
            // Fiyatı bilinmeyen ekstralar, panelden fiyat girilene kadar kapalı.
            isActive: option.priceCents !== null,
            maxQuantity: option.maxQuantity ?? 1,
            sortOrder: index,
          })
          .onConflictDoUpdate({
            target: [
              menuOptionsTable.productId,
              menuOptionsTable.group,
              menuOptionsTable.name,
            ],
            set: {
              sortOrder: index,
              ...(forcePrices
                ? {
                    priceCents: option.priceCents,
                    pricingModel: option.pricingModel ?? "per_selection",
                    isActive: option.priceCents !== null,
                    maxQuantity: option.maxQuantity ?? 1,
                    archivedAt: null,
                  }
                : {}),
            },
          });
      }
    }
  });

  const [productTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productsTable);
  const productCount = productTotal?.count ?? 0;
  const pendingOptions = await db
    .select({ name: menuOptionsTable.name })
    .from(menuOptionsTable)
    .where(isNull(menuOptionsTable.priceCents));
  const strays = await db
    .select({ name: productsTable.name })
    .from(productsTable)
    .where(notInArray(productsTable.slug, seedSlugs))
    .orderBy(asc(productsTable.name));

  console.log(`✓ ${newProducts} yeni ürün, ${newOptions} yeni seçenek eklendi.`);
  console.log(`✓ Menüde toplam ${productCount} ürün var.`);
  if (pendingOptions.length > 0) {
    const unique = [...new Set(pendingOptions.map((option) => option.name))];
    console.log(
      `• Fiyatı girilmemiş ${unique.length} ekstra seçenek satışa kapalı: ${unique.join(", ")}.\n` +
        "  Yönetim › Fiyatlar ekranından fiyat verdiğinizde otomatik olarak satışa açılır.",
    );
  }
  if (strays.length > 0) {
    console.log(
      `• Basılı menüde olmayan ${strays.length} ürün veritabanında duruyor (silinmedi): ${strays
        .map((item) => item.name)
        .join(", ")}.`,
    );
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Menü aktarımı başarısız:", error);
    await pool.end();
    process.exitCode = 1;
  });
