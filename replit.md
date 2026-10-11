# Haylaz Cafe

Kurulum, komutlar, mimari ve "neyi nerede değiştiririm" bilgisi için
**[README.md](./README.md)** dosyasına bakın. Burada yalnızca Replit'e özgü
notlar var.

## Replit'te çalıştırma

Proje artık Vercel'e dağıtılacak şekilde yapılandırılmış olsa da Replit'te
de çalışır:

- Run düğmesi `.replit-artifact/artifact.toml` dosyalarındaki servisleri
  başlatır (site + API).
- `PORT` ve `BASE_PATH` Replit tarafından verilir. Vercel ve yerel
  geliştirmede tanımlı olmadıkları için `vite.config.ts` artık bunlara
  varsayılan atar — Replit davranışı değişmez.
- Secrets bölümüne en az `DATABASE_URL`, `ADMIN_PASSWORD` ve
  `ADMIN_SESSION_SECRET` girin.

## Kimlik doğrulama değişikliği

Yönetim paneli artık Clerk kullanmıyor; tek şifre ve imzalı çerezle çalışıyor
(`artifacts/api-server/src/lib/cafe-auth.ts`). Replit'in Clerk/Auth
entegrasyonunun açık olması gerekmez. `@clerk/*` paketleri `package.json`
içinde duruyor ama hiçbir yerde içe aktarılmıyor.
