# Haylaz Cafe

Haylaz Cafe'nin müşteriye açık menü/sipariş sitesi ve işletme sahibinin fiyat,
menü ve sipariş yönetimini yaptığı panel.

- **Müşteri tarafı:** menüyü kategori kategori görür, kumpir ve waffle
  malzemelerini seçerek sepete ekler, ad-telefon ile sipariş gönderir.
- **Yönetim tarafı (`/admin`):** şifreyle girilir; fiyat güncelleme, toplu
  yüzde değişimi (önizlemeli), kampanya fiyatı, fiyat geçmişi, sipariş takibi
  ve mutfak ekranı.

## Hızlı kurulum (Vercel)

### 1. Veritabanı

[Neon](https://neon.tech) üzerinde ücretsiz bir Postgres oluşturun.
Vercel panelinde **Storage › Create Database › Neon** yolunu izlerseniz
`DATABASE_URL` projeye otomatik eklenir. Elle ekliyorsanız **pooled
(havuzlu)** bağlantı adresini kullanın.

### 2. Vercel'de proje oluşturun

Bu depoyu Vercel'e bağlayın. `vercel.json` dosyası derleme ayarlarını
zaten içerdiği için **Framework Preset dışında bir şey değiştirmeyin**:

| Ayar | Değer |
| --- | --- |
| Framework Preset | Other |
| Build Command | (vercel.json'dan gelir) |
| Output Directory | (vercel.json'dan gelir) |
| Install Command | (vercel.json'dan gelir) |

### 3. Ortam değişkenleri

**Settings › Environment Variables** altına ekleyin (`.env.example` dosyasına
da bakabilirsiniz):

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `DATABASE_URL` | **evet** | Postgres bağlantı adresi |
| `ADMIN_PASSWORD` | **evet** | Yönetim paneli şifresi, en az 8 karakter |
| `ADMIN_SESSION_SECRET` | **evet** | Oturum imzalama anahtarı, en az 32 karakter. Üretmek için: `openssl rand -hex 32` |
| `ADMIN_EMAIL` | hayır | Fiyat geçmişinde "kim değiştirdi" etiketi |
| `ALLOWED_ORIGINS` | önerilir | Tarayıcıdan istek kabul edilecek adresler, virgülle ayrılmış |
| `LOG_LEVEL` | hayır | Varsayılan `info` |

> `ADMIN_PASSWORD` veya `ADMIN_SESSION_SECRET` tanımlı değilse yönetim paneli
> **tamamen kapalıdır** ve uyarı gösterir. Bu bilinçli bir güvenlik
> varsayılanıdır.

### 4. Veritabanını hazırlayın

Tablolar ve menü, bir defaya mahsus yerelden yüklenir:

```bash
pnpm install
export DATABASE_URL="<Neon bağlantı adresiniz>"

pnpm run db:push      # tabloları oluşturur
pnpm run seed:menu    # basılı menüyü yükler (46 ürün, 139 malzeme seçeneği)
```

`seed:menu` tekrar tekrar çalıştırılabilir; panelden girdiğiniz fiyatları
**ezmez**. Fiyatları basılı menüye geri döndürmek isterseniz:

```bash
pnpm --filter @workspace/api-server run seed:menu -- --force-prices
```

### 5. İşletme bilgilerini doldurun

`artifacts/haylaz-cafe/src/data/site.ts` dosyasındaki `TODO` alanlarını
doldurup değişikliği gönderin. Adres, telefon, çalışma saatleri, Instagram ve
site adresi buradan; iletişim bölümü, `sitemap.xml`, canonical adres ve
Google'ın yerel işletme sonuçları için kullanılan yapısal veri otomatik
üretilir. Doldurulmayan alanlar sitede hiç görünmez.

## Yerel geliştirme

```bash
pnpm install
cp .env.example .env     # içini doldurun

pnpm --filter @workspace/api-server run dev    # API  → http://localhost:5000
pnpm --filter @workspace/haylaz-cafe run dev   # site → http://localhost:5173
```

> Komutlar `sh` kabuğu varsayar. **Windows'ta doğrudan çalışmaz**; WSL, Git Bash
> veya macOS/Linux kullanın.

## Komutlar

| Komut | İş |
| --- | --- |
| `pnpm run db:push` | Veritabanı şemasını uygular |
| `pnpm run seed:menu` | Basılı menüyü veritabanına aktarır |
| `pnpm run typecheck` | Tüm paketlerde tip denetimi |
| `pnpm run build` | Tip denetimi + tüm paketleri derler |
| `pnpm run vercel-build` | Vercel'in çalıştırdığı derleme (API paketi + site) |

## Mimari

```
artifacts/haylaz-cafe     React + Vite — müşteri sitesi ve yönetim paneli
artifacts/api-server      Express 5 — menü, sipariş ve yönetim uçları
api/[...path].mjs         Vercel sunucusuz fonksiyonu (API paketini çağırır)
lib/db                    Drizzle ORM şeması ve bağlantı havuzu
lib/api-spec              OpenAPI sözleşmesi (Orval ile istemci üretir)
lib/api-zod               Üretilmiş Zod şemaları
lib/api-client-react      Üretilmiş React Query hook'ları
```

Vercel'de site statik olarak, Express uygulaması ise tek bir sunucusuz
fonksiyon olarak yayınlanır. `/api/*` istekleri `api/[...path].mjs` dosyasına,
diğer tüm yollar tek sayfa uygulamasına yönlenir.

### Neyi nerede değiştirirsiniz

| Konu | Dosya |
| --- | --- |
| **İşletme bilgileri** (adres, telefon, saat, sosyal medya) | `artifacts/haylaz-cafe/src/data/site.ts` |
| **Menü içeriği** (ürün, fiyat, malzeme seçenekleri) | `artifacts/api-server/src/seed-menu.ts` |
| Menü başlıkları (yalnızca SEO/`<noscript>`, fiyatsız) | `artifacts/haylaz-cafe/src/data/menu.ts` |
| SEO etiketleri, JSON-LD, robots.txt, sitemap.xml | `artifacts/haylaz-cafe/src/lib/seo.ts` |
| Müşteri sitesi | `artifacts/haylaz-cafe/src/App.tsx` |
| Yönetim paneli | `artifacts/haylaz-cafe/src/pages/admin.tsx` |
| Giriş / oturum | `artifacts/api-server/src/lib/cafe-auth.ts` |
| Güvenlik başlıkları, CORS, istek sınırı, hata yakalama | `artifacts/api-server/src/middlewares/` |

> **Yalnızca fiyat** değiştiriyorsanız hiçbir dosyaya dokunmayın — yönetim
> panelinden değiştirin. Menüye ürün **ekleyip çıkarırken** `seed-menu.ts` ile
> `data/menu.ts` dosyalarını birlikte güncelleyin.

## Önemli tasarım kararları

- **Para birimi her yerde kuruş (tam sayı).** 75 TL = `7500`. Hiçbir yerde
  ondalık sayı kullanılmaz, kuruş hatası oluşmaz.
- **Fiyat sunucuda doğrulanır.** İstemci beklediği toplamı gönderir; sunucu
  kendi hesabıyla karşılaştırır, tutmazsa siparişi reddeder. Tarayıcıdan fiyat
  değiştirerek ucuza sipariş verilemez.
- **Sipariş anında fotoğraf alınır.** Ürün adı ve seçilen malzemeler sipariş
  anındaki hâliyle saklanır; sonradan fiyat değişse de geçmiş siparişler
  bozulmaz.
- **Fiyatsız ürün satılamaz ve müşteriye gösterilmez.** Veritabanı kısıtları
  bunu garantiler. Fiyatı olup satışa kapatılanlar "Tükendi" görünür.
- **Oturum sunucuda tutulmaz.** Giriş, HMAC ile imzalanmış ve süresi dolan bir
  HttpOnly çerez üretir; her istekte imza yeniden doğrulanır. Sunucusuz ortamda
  oturum tablosu gerekmez.
- **SEO derleme zamanında gömülür.** Tek sayfa uygulaması olmasına rağmen
  başlık, açıklama ve yapısal veri `index.html` içine yazılır; arama motoru
  JavaScript çalıştırmasa da menüyü ve işletme bilgisini görür.

## Bilinen notlar

- `@clerk/*` ve `@replit/*` paketleri `package.json` içinde duruyor ama artık
  kullanılmıyor. Kilit dosyası (`pnpm-lock.yaml`) bozulmasın diye bırakıldı;
  temizlemek için bağımlılıkları silip `pnpm install` çalıştırmanız yeterli.
- Serpme Kahvaltı'nın "en az 2 kişilik" kuralı açıklamada yazıyor ama sepette
  teknik olarak zorlanmıyor.
- İstek sınırlayıcı fonksiyon belleğindedir; Vercel birden fazla örnek
  çalıştırırsa sınır örnek başına uygulanır.
