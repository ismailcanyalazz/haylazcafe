import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminAccessQueryKey, getListAdminPricingQueryKey, getListPriceHistoryQueryKey, getListAdminOrdersQueryKey,
  getGetPublicMenuQueryKey, useGetAdminAccess, useListAdminPricing, useCreateAdminProduct, useUpdateAdminProduct,
  useCreateAdminOption, useUpdateAdminOption, usePreviewBulkPricing, useApplyBulkPricing, useListPriceHistory,
  useListAdminOrders, useUpdateAdminOrderStatus,
} from '@workspace/api-client-react';
import type {
  AdminOrder, AdminOption, AdminProduct, BulkPriceUpdate, OrderStatus, ProductInput, ProductUpdate, OptionInput, OptionUpdate,
} from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, ChefHat, CircleAlert, Clock3, LogOut, PackagePlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, Tag, X } from 'lucide-react';
import { adminLogin, adminLogout } from '../lib/admin-auth';

const money = (cents: number | null | undefined) => cents == null ? 'Fiyat belirlenmemiş' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(cents / 100);
const statusNames: Record<string, string> = { received: 'Yeni alındı', confirmed: 'Onaylandı', preparing: 'Hazırlanıyor', ready: 'Hazır', completed: 'Tamamlandı', cancelled: 'İptal edildi' };
const statusTone: Record<string, string> = { received: 'bg-[#f8ead7] text-[#94602a]', confirmed: 'bg-[#e9e5d5] text-[#6f653b]', preparing: 'bg-[#f4e2d9] text-[#a04d35]', ready: 'bg-[#e1eee1] text-[#47724d]', completed: 'bg-[#e9e4db] text-[#655c50]', cancelled: 'bg-[#f4dddd] text-[#a34238]' };
const errorCode = (error: unknown) => {
  const e = error as { status?: number; response?: { status?: number }; message?: string };
  return e?.status ?? e?.response?.status ?? (e?.message?.includes('403') ? 403 : e?.message?.includes('401') ? 401 : 0);
};
const errorText = (error: unknown) => {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || 'İşlem tamamlanamadı. Yeniden deneyin.';
};
const shortDate = (date: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));

export function AdminGuard({ children }: { children: ReactNode }) {
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey(), retry: false } });
  if (access.isLoading) return <AdminLoading />;
  if (access.isError) {
    const code = errorCode(access.error);
    // 503: sunucuda ADMIN_PASSWORD / ADMIN_SESSION_SECRET tanımlanmamış.
    return <AccessCard kind={code === 503 ? 'unconfigured' : 'error'} message={errorText(access.error)} retry={() => access.refetch()} />;
  }
  if (!access.data?.canManage) return <AdminLogin onSuccess={() => access.refetch()} />;
  return <>{children}</>;
}

/** Şifre ile giriş ekranı. */
function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await adminLogin(password);
      setPassword('');
      // Önceki oturumdan kalan önbelleği temizle.
      client.clear();
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="grid min-h-[100dvh] place-items-center bg-[#292623] p-5">
    <div className="w-full max-w-md rounded-[26px] bg-[#fbf8f1] p-8 shadow-2xl">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#f1e3d7] text-[#bd583a]"><ShieldCheck /></span>
        <p className="mt-5 text-[9px] font-bold uppercase tracking-[.22em] text-[#c45d40]">Haylaz Cafe · Yönetim</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Yönetici girişi</h1>
        <p className="mt-3 text-sm leading-6 text-[#766b61]">Fiyat ve sipariş ekranlarına ulaşmak için yönetici şifrenizi girin.</p>
      </div>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block text-xs font-bold">Yönetici şifresi
          <input
            type="password" required autoFocus autoComplete="current-password"
            value={password} onChange={(event) => setPassword(event.target.value)}
            className="field-control mt-2" placeholder="••••••••" data-testid="input-admin-password"
          />
        </label>
        {error && <p role="alert" className="rounded-xl bg-[#fbede8] p-3 text-xs text-[#90432f]" data-testid="status-login-error">{error}</p>}
        <button disabled={busy || password.length === 0} className="w-full rounded-full bg-[#c45d40] px-5 py-4 text-xs font-bold text-white disabled:opacity-50" data-testid="button-admin-login">
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
      <Link href="/" className="mt-5 block text-center text-[10px] font-bold text-[#8a7d70]" data-testid="link-login-home">Müşteri sitesine dön</Link>
    </div>
  </div>;
}

function AdminLoading() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f3eee5]"><div className="w-[min(420px,90vw)] space-y-4 rounded-[24px] border border-[#e3d8cb] bg-[#fbf8f1] p-8"><div className="skeleton h-5 w-28 rounded" /><div className="skeleton h-10 w-3/4 rounded" /><div className="skeleton h-28 rounded-2xl" /><span className="text-xs text-[#86796d]">Yönetici yetkisi doğrulanıyor…</span></div></div>;
}
function AccessCard({ kind, message, retry }: { kind: 'unconfigured' | 'error'; message?: string; retry?: () => void }) {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f3eee5] p-5"><div className="w-full max-w-md rounded-[26px] border border-[#e2d7ca] bg-[#fbf8f1] p-8 text-center shadow-xl shadow-[#594431]/5">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#f1e3d7] text-[#bd583a]"><CircleAlert /></span>
    <p className="mt-5 text-[9px] font-bold uppercase tracking-[.22em] text-[#c45d40]">Haylaz Cafe · Yönetim</p>
    <h1 className="mt-2 font-display text-3xl font-bold">{kind === 'unconfigured' ? 'Panel henüz kurulmadı' : 'Yetki bilgisi alınamadı'}</h1>
    <p className="mt-3 text-sm leading-6 text-[#766b61]">{kind === 'unconfigured'
      ? 'Sunucuda ADMIN_PASSWORD ve ADMIN_SESSION_SECRET ortam değişkenleri tanımlanmalı. Vercel panelinde Settings › Environment Variables bölümünden ekleyip projeyi yeniden dağıtın.'
      : message || 'Bağlantıyı kontrol edip tekrar deneyebilirsiniz.'}</p>
    {kind === 'error'
      ? <button onClick={retry} className="mt-6 rounded-full bg-[#292623] px-6 py-3 text-xs font-bold text-white" data-testid="button-access-retry">Yeniden dene</button>
      : <Link href="/" className="mt-6 inline-flex rounded-full bg-[#292623] px-6 py-3 text-xs font-bold text-white" data-testid="link-access-home">Ana sayfaya dön</Link>}
  </div></div>;
}

export function AdminNav({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const signOut = async () => {
    try { await adminLogout(); } catch { /* çerez yine de sunucuda temizlenir */ }
    client.clear();
    window.location.href = import.meta.env.BASE_URL || '/';
  };
  const pathname = window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/';
  const links = [{ href: '/admin/pricing', title: 'Fiyat & menü', icon: Tag }, { href: '/admin/orders', title: 'Siparişler', icon: PackagePlus }, { href: '/kitchen', title: 'Mutfak', icon: ChefHat }];
  return <div className="admin-shell flex flex-col text-[#292623] md:flex-row">
    <aside className="admin-sidebar z-20 flex shrink-0 flex-col text-[#f9f4ec] md:sticky md:top-0 md:h-[100dvh] md:w-[246px]">
      <div className="flex items-center justify-between px-5 py-4 md:block md:px-6 md:py-7"><Link href="/" className="flex items-center gap-3" data-testid="link-admin-brand"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e76b4b] font-display text-xl font-bold">h</span><span><b className="block font-display text-lg">haylaz</b><small className="text-[8px] uppercase tracking-[.25em] text-[#bfb3a6]">kafe yönetimi</small></span></Link><button className="grid h-9 w-9 place-items-center rounded-full border border-white/10 md:hidden" onClick={signOut} aria-label="Oturumu kapat" data-testid="button-sign-out-mobile"><LogOut size={16} /></button></div>
      <div className="hidden px-6 pb-5 md:block"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a99e92]">Çalışma alanı</p><p className="mt-2 truncate text-xs text-[#eee4d8]">{'Yönetici'}</p></div>
      <nav className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3 md:flex-col md:border-0 md:px-3" aria-label="Yönetim gezinme">{links.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold transition-colors ${active ? 'bg-[#e76b4b] text-white' : 'text-[#d2c6ba] hover:bg-white/8 hover:text-white'}`} data-testid={`link-admin-${item.href.slice(1).replace('/', '-')}`}><Icon size={16} />{item.title}{item.href === '/kitchen' && <span className="ml-auto hidden text-[9px] uppercase tracking-widest text-[#f1a07f] md:inline">Canlı</span>}</Link>; })}</nav>
      <div className="mt-auto hidden border-t border-white/10 p-4 md:block"><button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold text-[#d2c6ba] hover:bg-white/8" data-testid="button-sign-out"><LogOut size={16} />Oturumu kapat</button><Link href="/" className="mt-2 flex items-center gap-3 px-3 py-3 text-[10px] font-semibold text-[#a99e92]" data-testid="link-back-public"><ArrowLeft size={14} />Müşteri sitesine dön</Link></div>
    </aside>
    <div className="min-w-0 flex-1"><header className="flex h-[59px] items-center justify-between border-b border-[#e1d7cb] bg-[#f8f4ed] px-5 sm:px-8"><span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#86796d]">Haylaz Cafe <span className="mx-2 text-[#d2c4b4]">/</span> Yönetim</span><span className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#5e6b4d]"><span className="h-2 w-2 rounded-full bg-[#70875b]" />Oturum güvenli</span></header>{children}</div>
  </div>;
}

function PageHeading({ kicker, title, detail, action }: { kicker: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-[9px] font-bold uppercase tracking-[.23em] text-[#bd583a]">{kicker}</p><h1 className="mt-2 font-display text-[clamp(2rem,4vw,3.2rem)] font-bold leading-tight tracking-[-.035em]">{title}</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-[#766b61]">{detail}</p></div>{action}</div>;
}
function QueryState({ loading, error, onRetry, children }: { loading: boolean; error: boolean; onRetry: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-3" aria-label="Yükleniyor"><div className="skeleton h-16 rounded-2xl" /><div className="skeleton h-16 rounded-2xl" /><div className="skeleton h-36 rounded-2xl" /></div>;
  if (error) return <div className="rounded-2xl border border-[#e4c8bb] bg-[#fbf8f1] p-8 text-center"><CircleAlert className="mx-auto text-[#bd583a]" /><h2 className="mt-3 font-display text-xl font-bold">Veriler alınamadı</h2><p className="mt-2 text-xs text-[#766b61]">İstek yetki veya bağlantı nedeniyle tamamlanamadı.</p><button onClick={onRetry} className="mt-4 rounded-full bg-[#292623] px-5 py-3 text-xs font-bold text-white" data-testid="button-query-retry">Yeniden dene</button></div>;
  return <>{children}</>;
}

type EditTarget = { type: 'product'; item: AdminProduct } | { type: 'option'; item: AdminOption };

export function PricingPage() {
  const client = useQueryClient();
  const pricing = useListAdminPricing();
  const history = useListPriceHistory({ limit: 12 });
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'product' | 'option'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [create, setCreate] = useState<'product' | 'option' | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [percent, setPercent] = useState('5');
  const [changeNote, setChangeNote] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const createProduct = useCreateAdminProduct(); const updateProduct = useUpdateAdminProduct();
  const createOption = useCreateAdminOption(); const updateOption = useUpdateAdminOption();
  const preview = usePreviewBulkPricing(); const apply = useApplyBulkPricing();
  const data = pricing.data;
  const products = data?.products ?? []; const options = data?.options ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr-TR');
    const rows: (EditTarget & { label: string; category: string; active: boolean; price: number | null; updatedAt: string })[] = [
      ...products.map((item) => ({ type: 'product' as const, item, label: item.name, category: item.category, active: item.isActive, price: item.campaignPriceCents ?? item.basePriceCents, updatedAt: item.updatedAt })),
      ...options.map((item) => ({ type: 'option' as const, item, label: item.name, category: `${item.productName} · ${item.group}`, active: item.isActive, price: item.priceCents, updatedAt: item.updatedAt })),
    ];
    return rows.filter((row) => (kind === 'all' || row.type === kind) && (showArchived || row.active) && (!needle || `${row.label} ${row.category}`.toLocaleLowerCase('tr-TR').includes(needle)));
  }, [products, options, search, kind, showArchived]);
  const invalidatePricing = () => { client.invalidateQueries({ queryKey: getListAdminPricingQueryKey() }); client.invalidateQueries({ queryKey: getGetPublicMenuQueryKey() }); client.invalidateQueries({ queryKey: getListPriceHistoryQueryKey({ limit: 12 }) }); };
  const resetMessages = () => { setError(''); setNotice(''); };
  const archive = (target: EditTarget) => {
    const name = target.type === 'product' ? target.item.name : target.item.name;
    if (!window.confirm(`“${name}” ürününü satıştan kaldırmak istediğinize emin misiniz?`)) return;
    resetMessages();
    if (target.type === 'product') {
      const p = target.item;
      const body: ProductUpdate = { slug: p.slug, name: p.name, category: p.category, description: p.description, imageUrl: p.imageUrl, basePriceCents: p.basePriceCents, campaignPriceCents: p.campaignPriceCents, campaignStartsAt: p.campaignStartsAt, campaignEndsAt: p.campaignEndsAt, isActive: false, sortOrder: p.sortOrder, expectedUpdatedAt: p.updatedAt, changeNote: 'Yönetim panelinden satıştan kaldırıldı' };
      updateProduct.mutate({ productId: p.id, data: body }, { onSuccess: () => { setNotice('Ürün satıştan kaldırıldı.'); invalidatePricing(); }, onError: (e) => setError(errorText(e)) });
    } else {
      const o = target.item;
      const body: OptionUpdate = { group: o.group, name: o.name, priceCents: o.priceCents, pricingModel: o.pricingModel, isActive: false, maxQuantity: o.maxQuantity, sortOrder: o.sortOrder, expectedUpdatedAt: o.updatedAt, changeNote: 'Yönetim panelinden satıştan kaldırıldı' };
      updateOption.mutate({ optionId: o.id, data: body }, { onSuccess: () => { setNotice('Ek seçenek satıştan kaldırıldı.'); invalidatePricing(); }, onError: (e) => setError(errorText(e)) });
    }
  };
  const prepareBulk = () => {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct <= -100 || pct > 1000) { setError('Yüzde değişimi -100 ile 1000 arasında olmalı.'); return; }
    const changes: BulkPriceUpdate['changes'] = selected.map((key) => {
      const [type, id] = key.split(':');
      const product = products.find((p) => p.id === id);
      const option = options.find((o) => o.id === id);
      const item = type === 'product' ? product : option;
      const price = type === 'product' ? (product?.campaignPriceCents ?? product?.basePriceCents) : option?.priceCents;
      if (!item || price == null) return null;
      return { itemType: type as 'product' | 'option', itemId: id, priceCents: Math.max(0, Math.round(price * (1 + pct / 100))), expectedUpdatedAt: item.updatedAt };
    }).filter((change): change is NonNullable<typeof change> => change !== null);
    if (!changes.length) { setError('Fiyatı belirlenmiş en az bir ürün seçin.'); return; }
    const payload: BulkPriceUpdate = { changes, changeNote: changeNote.trim() || null };
    resetMessages();
    preview.mutate({ data: payload }, { onSuccess: (response) => { setPreviewOpen(true); setPreviewPayloadRows(response.changes); setBulkPayload(payload); }, onError: (e) => setError(errorText(e)) });
  };
  const [previewRows, setPreviewPayloadRows] = useState<import('@workspace/api-client-react').BulkPricePreviewRow[]>([]);
  const [bulkPayload, setBulkPayload] = useState<BulkPriceUpdate | null>(null);
  const confirmBulk = () => {
    if (!bulkPayload) return;
    apply.mutate({ data: bulkPayload }, { onSuccess: (res) => { setNotice(`${res.updatedCount} fiyat güncellendi.`); setPreviewOpen(false); setSelected([]); invalidatePricing(); }, onError: (e) => setError(errorText(e)) });
  };
  const editBusy = updateProduct.isPending || updateOption.isPending || createProduct.isPending || createOption.isPending;
  return <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
    <PageHeading kicker="Menü yönetimi / Fiyatlar" title="Fiyatlar hep yerli yerinde." detail="Ürün ve ek seçenek fiyatlarını güncelleyin; toplu değişiklikleri önce gözden geçirin, sonra uygulayın." action={<div className="flex flex-wrap gap-2"><button onClick={() => { resetMessages(); setCreate('option'); }} className="rounded-full border border-[#d8ccbf] bg-[#fbf8f1] px-4 py-3 text-[10px] font-bold" data-testid="button-create-option"><Plus size={14} className="mr-1 inline" />Ek seçenek</button><button onClick={() => { resetMessages(); setCreate('product'); }} className="rounded-full bg-[#c45d40] px-4 py-3 text-[10px] font-bold text-white" data-testid="button-create-product"><Plus size={14} className="mr-1 inline" />Ürün ekle</button></div>} />
    {notice && <div className="mb-4 rounded-xl border border-[#cfdfce] bg-[#edf4ec] px-4 py-3 text-xs text-[#456a4b]" role="status" data-testid="status-pricing-success">{notice}</div>}{error && <div className="mb-4 rounded-xl border border-[#e3c6ba] bg-[#fbede8] px-4 py-3 text-xs text-[#90432f]" role="alert" data-testid="status-pricing-error">{error}</div>}
    <QueryState loading={pricing.isLoading} error={pricing.isError} onRetry={() => pricing.refetch()}>
      <div className="grid gap-5 xl:grid-cols-[1fr_315px]">
        <section className="min-w-0 rounded-[22px] border border-[#e2d7cb] bg-[#fbf8f1] p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="relative w-full md:max-w-[350px]"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86796d]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün, kategori veya grup ara" className="field-control pl-10" aria-label="Menüde ara" data-testid="input-pricing-search" /></div><div className="flex flex-wrap items-center gap-2">{(['all', 'product', 'option'] as const).map((value) => <button key={value} onClick={() => setKind(value)} className={`rounded-full px-3 py-2 text-[10px] font-bold ${kind === value ? 'bg-[#292623] text-white' : 'bg-[#f1e8dc] text-[#695e53]'}`} data-testid={`button-pricing-filter-${value}`}>{value === 'all' ? 'Tümü' : value === 'product' ? 'Ürünler' : 'Ek seçenekler'}</button>)}<label className="ml-1 flex items-center gap-2 text-[10px] font-semibold text-[#766b61]"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="toggle-show-archived" />Arşivdekiler</label></div></div>
          <div className="overflow-x-auto"><table className="admin-table w-full min-w-[690px] text-xs"><thead><tr><th className="w-10"><input type="checkbox" aria-label="Filtrelenenlerin tümünü seç" checked={filtered.length > 0 && filtered.every((row) => selected.includes(`${row.type}:${row.item.id}`))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...filtered.filter((r) => r.price != null).map((r) => `${r.type}:${r.item.id}`)])] : selected.filter((key) => !filtered.some((r) => key === `${r.type}:${r.item.id}`)))} data-testid="toggle-select-all" /></th><th>Ürün / seçenek</th><th>Tür / kategori</th><th>Güncel fiyat</th><th>Durum</th><th className="text-right">İşlem</th></tr></thead><tbody>{filtered.map((row) => { const key = `${row.type}:${row.item.id}`; return <tr key={key} data-testid={`row-pricing-${key.replace(':', '-')}`}><td><input type="checkbox" disabled={row.price == null} checked={selected.includes(key)} onChange={(e) => setSelected(e.target.checked ? [...selected, key] : selected.filter((v) => v !== key))} aria-label={`${row.label} seç`} data-testid={`toggle-select-${key.replace(':', '-')}`} /></td><td><div className="font-bold">{row.label}</div>{row.type === 'option' && <span className="mt-1 block text-[9px] text-[#86796d]">{(row.item as AdminOption).productName}</span>}</td><td><span className="block text-[10px] text-[#695e53]">{row.type === 'product' ? 'Ürün' : 'Ek seçenek'}</span><span className="mt-1 block text-[9px] text-[#998b7d]">{row.category}</span></td><td><span className={`font-mono text-[11px] font-bold ${row.price == null ? 'text-[#9b5948]' : 'text-[#9e4e38]'}`} data-testid={`text-pricing-value-${key.replace(':', '-')}`}>{money(row.price)}</span>{row.type === 'product' && (row.item as AdminProduct).campaignPriceCents != null && <small className="mt-1 block text-[9px] text-[#82776b]">Kampanya fiyatı</small>}</td><td><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${row.active ? 'bg-[#e5eee3] text-[#4b714e]' : 'bg-[#eee7df] text-[#786b60]'}`}>{row.active ? 'Satışta' : 'Arşivde'}</span></td><td><div className="flex justify-end gap-2"><button onClick={() => setEdit(row)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#dfd4c8] hover:bg-[#f2e8dd]" aria-label={`${row.label} düzenle`} data-testid={`button-edit-${key.replace(':', '-')}`}><Pencil size={14} /></button>{row.active && <button onClick={() => archive(row)} className="rounded-lg border border-[#dfd4c8] px-2.5 text-[9px] font-bold text-[#8e4a37] hover:bg-[#f7e5df]" data-testid={`button-archive-${key.replace(':', '-')}`}>Satıştan kaldır</button>}</div></td></tr>; })}</tbody></table>
            {filtered.length === 0 && <div className="py-16 text-center"><span className="font-display text-xl font-bold">Eşleşen kayıt yok</span><p className="mt-2 text-xs text-[#86796d]">Arama veya filtre seçiminizi değiştirin.</p></div>}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-[22px] bg-[#292623] p-5 text-[#fbf8f1] sm:p-6"><span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#f1a07f]">Toplu fiyat düzenleme</span><h2 className="mt-2 font-display text-2xl font-bold">Bir hamlede güncelle.</h2><p className="mt-2 text-[10px] leading-5 text-[#c7baad]">Yalnızca fiyatı belirlenmiş seçili ürünlere uygulanır. Önizlemeden sonra onaylamadan kaydedilmez.</p><label className="mt-5 block text-[10px] font-bold text-[#e7dcd0]">Yüzde değişimi<input className="field-control mt-2 bg-[#fffaf3] text-[#292623]" type="number" min="-99" max="1000" step="0.1" value={percent} onChange={(e) => setPercent(e.target.value)} data-testid="input-bulk-percent" /></label><label className="mt-4 block text-[10px] font-bold text-[#e7dcd0]">Değişiklik notu<input className="field-control mt-2 bg-[#fffaf3] text-[#292623]" maxLength={300} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="Örn. sezon güncellemesi" data-testid="input-bulk-note" /></label><div className="mt-4 flex justify-between text-[10px]"><span className="text-[#c7baad]">Seçili, fiyatlı ürün</span><b>{selected.filter((key) => { const [, id] = key.split(':'); return products.some((p) => p.id === id && (p.basePriceCents != null || p.campaignPriceCents != null)) || options.some((o) => o.id === id && o.priceCents != null); }).length}</b></div><button onClick={prepareBulk} disabled={preview.isPending || selected.length === 0} className="mt-5 w-full rounded-full bg-[#e76b4b] px-4 py-3.5 text-xs font-bold disabled:opacity-45" data-testid="button-preview-bulk">{preview.isPending ? 'Önizleme hazırlanıyor…' : 'Değişiklikleri önizle'}</button></section>
          <section className="rounded-[22px] border border-[#e2d7cb] bg-[#fbf8f1] p-5"><div className="flex items-center justify-between"><div><span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#c45d40]">Fiyat kayıtları</span><h2 className="mt-1 font-display text-xl font-bold">Son değişiklikler</h2></div><Clock3 size={17} className="text-[#bd583a]" /></div><QueryState loading={history.isLoading} error={history.isError} onRetry={() => history.refetch()}><div className="mt-4 space-y-3">{history.data?.entries.map((entry) => <div key={entry.id} className="border-t border-[#ece3d9] pt-3" data-testid={`history-entry-${entry.id}`}><p className="text-[10px] font-bold">{entry.itemName}</p><div className="mt-1 flex items-center gap-2 text-[9px]"><span className="text-[#8b7c70]">{money(entry.previousPriceCents)}</span><ArrowRight size={11} className="text-[#c45d40]" /><span className="font-bold text-[#a34d36]">{money(entry.newPriceCents)}</span></div><p className="mt-1 text-[9px] text-[#93877b]">{entry.changedByEmail} · {shortDate(entry.createdAt)}</p>{entry.changeNote && <p className="mt-1 text-[9px] italic text-[#766b61]">{entry.changeNote}</p>}</div>)}{!history.data?.entries.length && <p className="py-4 text-[10px] text-[#86796d]">Henüz fiyat değişikliği kaydı yok.</p>}</div></QueryState></section>
        </aside>
      </div>
    </QueryState>
    {edit && <EditModal target={edit} error={error} close={() => setEdit(null)} saveProduct={(body) => updateProduct.mutate({ productId: edit.type === 'product' ? edit.item.id : '', data: body }, { onSuccess: () => { setEdit(null); setNotice('Ürün güncellendi.'); invalidatePricing(); }, onError: (e) => setError(errorText(e)) })} saveOption={(body) => updateOption.mutate({ optionId: edit.type === 'option' ? edit.item.id : '', data: body }, { onSuccess: () => { setEdit(null); setNotice('Ek seçenek güncellendi.'); invalidatePricing(); }, onError: (e) => setError(errorText(e)) })} busy={editBusy} />}
    {create && <CreateModal kind={create} error={error} products={products} close={() => setCreate(null)} saveProduct={(body) => createProduct.mutate({ data: body }, { onSuccess: () => { setCreate(null); setNotice('Yeni ürün eklendi.'); invalidatePricing(); }, onError: (e) => setError(errorText(e)) })} saveOption={(body) => createOption.mutate({ data: body }, { onSuccess: () => { setCreate(null); setNotice('Ek seçenek eklendi.'); invalidatePricing(); }, onError: (e) => setError(errorText(e)) })} busy={editBusy} />}
    {previewOpen && <div className="fixed inset-0 z-[85] grid place-items-center bg-[#211f1d]/60 p-4"><div className="max-h-[90dvh] w-full max-w-[720px] overflow-hidden rounded-[24px] bg-[#fbf8f1] shadow-2xl"><div className="flex items-center justify-between border-b border-[#e5dbd0] p-5 sm:px-7"><div><span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#c45d40]">Uygulama öncesi kontrol</span><h2 className="mt-1 font-display text-2xl font-bold">Fiyat değişikliği önizlemesi</h2></div><button onClick={() => setPreviewOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-[#f1e8dc]" aria-label="Önizlemeyi kapat" data-testid="button-close-preview"><X size={16} /></button></div><div className="max-h-[55vh] overflow-y-auto p-5 sm:px-7"><p className="mb-4 text-xs text-[#766b61]">Kaydetmeden önce her satırı kontrol edin. Onay işlemi bu değişiklikleri uygular.</p><div className="overflow-x-auto"><table className="admin-table w-full min-w-[470px] text-xs"><thead><tr><th>Ürün</th><th>Eski fiyat</th><th></th><th>Yeni fiyat</th></tr></thead><tbody>{previewRows.map((row) => <tr key={`${row.itemType}-${row.itemId}`} data-testid={`bulk-preview-${row.itemId}`}><td className="font-bold">{row.itemName}</td><td>{money(row.previousPriceCents)}</td><td><ArrowRight size={13} className="text-[#bd583a]" /></td><td className="font-bold text-[#a34d36]">{money(row.newPriceCents)}</td></tr>)}</tbody></table></div>{error && <p className="mt-4 text-xs text-[#9b402c]" role="alert">{error}</p>}</div><div className="flex flex-col-reverse gap-2 border-t border-[#e5dbd0] bg-[#f7f2e9] p-5 sm:flex-row sm:justify-end sm:px-7"><button onClick={() => setPreviewOpen(false)} className="rounded-full border border-[#d8ccbf] px-5 py-3 text-xs font-bold" data-testid="button-cancel-bulk">Geri dön</button><button onClick={confirmBulk} disabled={apply.isPending || !previewRows.length} className="rounded-full bg-[#c45d40] px-5 py-3 text-xs font-bold text-white disabled:opacity-50" data-testid="button-confirm-bulk">{apply.isPending ? 'Uygulanıyor…' : 'Onayla ve uygula'}</button></div></div></div>}
  </main>;
}

function Modal({ title, subtitle, close, children, error }: { title: string; subtitle: string; close: () => void; children: ReactNode; error: string }) {
  return <div className="fixed inset-0 z-[82] grid place-items-center bg-[#211f1d]/60 p-4"><div className="max-h-[92dvh] w-full max-w-[580px] overflow-y-auto rounded-[24px] bg-[#fbf8f1] p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#c45d40]">{subtitle}</p><h2 className="mt-1 font-display text-2xl font-bold">{title}</h2></div><button onClick={close} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f1e8dc]" aria-label="Pencereyi kapat" data-testid="button-close-admin-modal"><X size={16} /></button></div>{error && <p role="alert" className="mb-4 rounded-xl bg-[#fbede8] p-3 text-xs text-[#90432f]" data-testid="status-modal-error">{error}</p>}{children}</div></div>;
}
function Field({ label, value, onChange, type = 'text', required = false, placeholder, min, max }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; min?: string; max?: string }) {
  return <label className="block text-[10px] font-bold text-[#61564c]">{label}<input required={required} value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} min={min} max={max} className="field-control mt-1.5" /></label>;
}
const toDateField = (value: string | null | undefined) => value ? new Date(value).toISOString().slice(0, 16) : '';
const fromDateField = (value: string) => value ? new Date(value).toISOString() : null;
function ProductFields({ initial, onSave, busy, creating }: { initial?: AdminProduct; onSave: (body: ProductInput | ProductUpdate) => void; busy: boolean; creating: boolean }) {
  const [name, setName] = useState(initial?.name || ''); const [slug, setSlug] = useState(initial?.slug || '');
  const [category, setCategory] = useState(initial?.category || ''); const [price, setPrice] = useState(initial?.basePriceCents == null ? '' : String(initial.basePriceCents / 100));
  const [campaign, setCampaign] = useState(initial?.campaignPriceCents == null ? '' : String(initial.campaignPriceCents / 100));
  const [description, setDescription] = useState(initial?.description || ''); const [imageUrl, setImageUrl] = useState(initial?.imageUrl || '');
  const [campaignStart, setCampaignStart] = useState(toDateField(initial?.campaignStartsAt)); const [campaignEnd, setCampaignEnd] = useState(toDateField(initial?.campaignEndsAt));
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0)); const [active, setActive] = useState(initial?.isActive ?? true); const [note, setNote] = useState('');
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const base: ProductInput = { slug: slug.trim(), name: name.trim(), category: category.trim(), description: description.trim() || null, imageUrl: imageUrl.trim() || null, basePriceCents: price === '' ? null : Math.round(Number(price) * 100), campaignPriceCents: campaign === '' ? null : Math.round(Number(campaign) * 100), campaignStartsAt: fromDateField(campaignStart), campaignEndsAt: fromDateField(campaignEnd), isActive: active, sortOrder: Number(sortOrder) || 0, changeNote: note.trim() || null }; if (!creating && initial) onSave({ ...base, expectedUpdatedAt: initial.updatedAt }); else onSave(base); }}>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Ürün adı" value={name} onChange={setName} required /><Field label="URL kısa adı" value={slug} onChange={setSlug} required /><Field label="Kategori" value={category} onChange={setCategory} required placeholder="Örn. Kumpir" /><Field label="Ana fiyat (TL)" value={price} onChange={setPrice} type="number" min="0" placeholder="Boş bırakılırsa fiyat belirlenmez" /><Field label="Kampanya fiyatı (TL)" value={campaign} onChange={setCampaign} type="number" min="0" placeholder="İsteğe bağlı" /><Field label="Sıralama" value={sortOrder} onChange={setSortOrder} type="number" min="0" /></div>
    <Field label="Görsel adresi" value={imageUrl} onChange={setImageUrl} placeholder="İsteğe bağlı görsel URL'si" />
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Kampanya başlangıcı" value={campaignStart} onChange={setCampaignStart} type="datetime-local" /><Field label="Kampanya bitişi" value={campaignEnd} onChange={setCampaignEnd} type="datetime-local" /></div>
    <label className="block text-[10px] font-bold text-[#61564c]">Açıklama<textarea maxLength={500} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field-control mt-1.5 resize-none" /></label>
    <Field label="Fiyat değişikliği notu" value={note} onChange={setNote} placeholder="İsteğe bağlı, en fazla 300 karakter" />
    <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Satışta</label>
    <button disabled={busy} className="w-full rounded-full bg-[#c45d40] px-5 py-3.5 text-xs font-bold text-white disabled:opacity-50" data-testid="button-save-product">{busy ? 'Kaydediliyor…' : creating ? 'Ürünü ekle' : 'Değişiklikleri kaydet'}</button>
  </form>;
}
function OptionFields({ initial, products, onSave, busy, creating }: { initial?: AdminOption; products: AdminProduct[]; onSave: (body: OptionInput | OptionUpdate) => void; busy: boolean; creating: boolean }) {
  const [productId, setProductId] = useState(initial?.productId || products[0]?.id || '');
  const [group, setGroup] = useState(initial?.group || ''); const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.priceCents == null ? '' : String(initial.priceCents / 100));
  const [model, setModel] = useState<AdminOption['pricingModel']>(initial?.pricingModel || 'per_selection');
  const [maxQty, setMaxQty] = useState(String(initial?.maxQuantity ?? 1)); const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0)); const [active, setActive] = useState(initial?.isActive ?? true); const [note, setNote] = useState('');
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const values = { group: group.trim(), name: name.trim(), priceCents: price === '' ? null : Math.round(Number(price) * 100), pricingModel: model, isActive: active, maxQuantity: Math.min(20, Math.max(1, Number(maxQty))), sortOrder: Number(sortOrder) || 0, changeNote: note.trim() || null }; if (creating) onSave({ ...values, productId }); else if (initial) onSave({ ...values, expectedUpdatedAt: initial.updatedAt }); }}>
    {creating && <label className="block text-[10px] font-bold text-[#61564c]">Ürün<select value={productId} onChange={(e) => setProductId(e.target.value)} required className="field-control mt-1.5" data-testid="select-option-product">{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}</select></label>}
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Seçenek grubu" value={group} onChange={setGroup} required placeholder="Örn. Malzeme" /><Field label="Seçenek adı" value={name} onChange={setName} required /><Field label="Fiyat (TL)" value={price} onChange={setPrice} type="number" min="0" placeholder="Fiyat belirtilmemiş" /><Field label="En fazla adet" value={maxQty} onChange={setMaxQty} type="number" min="1" max="20" required /><Field label="Sıralama" value={sortOrder} onChange={setSortOrder} type="number" min="0" /></div>
    <label className="block text-[10px] font-bold text-[#61564c]">Fiyatlandırma modeli<select value={model} onChange={(e) => setModel(e.target.value as AdminOption['pricingModel'])} className="field-control mt-1.5" data-testid="select-pricing-model"><option value="free">Ücretsiz</option><option value="per_selection">Seçim başına</option><option value="per_unit">Adet başına</option><option value="price_delta">Fiyat farkı</option></select></label>
    <Field label="Fiyat değişikliği notu" value={note} onChange={setNote} placeholder="İsteğe bağlı" />
    <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Satışta</label>
    <button disabled={busy || !productId} className="w-full rounded-full bg-[#c45d40] px-5 py-3.5 text-xs font-bold text-white disabled:opacity-50" data-testid="button-save-option">{busy ? 'Kaydediliyor…' : creating ? 'Ek seçeneği ekle' : 'Değişiklikleri kaydet'}</button>
  </form>;
}
function EditModal({ target, close, saveProduct, saveOption, busy, error }: { target: EditTarget; close: () => void; saveProduct: (body: ProductUpdate) => void; saveOption: (body: OptionUpdate) => void; busy: boolean; error: string }) {
  return <Modal title={target.type === 'product' ? 'Ürünü düzenle' : 'Ek seçeneği düzenle'} subtitle={target.type === 'product' ? target.item.category : `${target.item.productName} · ${target.item.group}`} close={close} error={error}>{target.type === 'product' ? <ProductFields initial={target.item} onSave={(body) => saveProduct(body as ProductUpdate)} busy={busy} creating={false} /> : <OptionFields initial={target.item} products={[]} onSave={(body) => saveOption(body as OptionUpdate)} busy={busy} creating={false} />}</Modal>;
}
function CreateModal({ kind, products, close, saveProduct, saveOption, busy, error }: { kind: 'product' | 'option'; products: AdminProduct[]; close: () => void; saveProduct: (body: ProductInput) => void; saveOption: (body: OptionInput) => void; busy: boolean; error: string }) {
  return <Modal title={kind === 'product' ? 'Menüye ürün ekle' : 'Ek seçenek oluştur'} subtitle="Menü yönetimi" close={close} error={error}>{kind === 'product' ? <ProductFields onSave={(body) => saveProduct(body as ProductInput)} busy={busy} creating /> : products.length ? <OptionFields products={products} onSave={(body) => saveOption(body as OptionInput)} busy={busy} creating /> : <div className="rounded-xl bg-[#f1e8dc] p-5 text-xs text-[#766b61]">Önce menüye bir ürün eklemelisiniz.</div>}</Modal>;
}

export function OrdersPage() {
  const client = useQueryClient();
  const ordersQuery = useListAdminOrders({ limit: 100 }, { query: { queryKey: getListAdminOrdersQueryKey({ limit: 100 }), refetchInterval: 20000 } });
  const update = useUpdateAdminOrderStatus();
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [error, setError] = useState('');
  const orders = ordersQuery.data?.orders ?? [];
  const shown = orders.filter((o) => filter === 'all' || o.status === filter);
  const changeStatus = (order: AdminOrder, status: OrderStatus) => {
    if (status === 'cancelled' && !window.confirm(`Sipariş #${order.orderNumber} iptal edilsin mi?`)) return;
    setError('');
    update.mutate({ orderId: order.id, data: { status } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey({ limit: 100 }) }), onError: (e) => setError(errorText(e)) });
  };
  return <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><PageHeading kicker="Sipariş yönetimi" title="Bugünün masaları." detail="Müşteri siparişlerini izleyin, adım adım güncelleyin. Liste 20 saniyede bir yenilenir." action={<button onClick={() => ordersQuery.refetch()} className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d8ccbf] bg-[#fbf8f1] px-4 py-3 text-[10px] font-bold" data-testid="button-refresh-orders"><RefreshCw size={14} />Yenile</button>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#fbede8] p-3 text-xs text-[#90432f]" data-testid="status-orders-error">{error}</p>}
    <QueryState loading={ordersQuery.isLoading} error={ordersQuery.isError} onRetry={() => ordersQuery.refetch()}>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{(['all', 'received', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'] as const).map((s) => <button key={s} onClick={() => setFilter(s)} className={`shrink-0 rounded-full px-4 py-2.5 text-[10px] font-bold ${filter === s ? 'bg-[#292623] text-white' : 'bg-[#fbf8f1] text-[#766b61] ring-1 ring-[#e2d7cb]'}`} data-testid={`button-orders-filter-${s}`}>{s === 'all' ? `Tümü · ${orders.length}` : `${statusNames[s]} · ${orders.filter((o) => o.status === s).length}`}</button>)}</div>
      {shown.length ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{shown.map((order) => <OrderCard key={order.id} order={order} busy={update.isPending} changeStatus={changeStatus} mode="order" />)}</div> : <div className="rounded-[22px] border border-dashed border-[#d8ccbf] bg-[#fbf8f1] px-6 py-16 text-center"><span className="font-display text-2xl font-bold">Burada sipariş yok</span><p className="mt-2 text-xs text-[#86796d]">Bu durumdaki siparişler geldiğinde burada görünecek.</p></div>}
    </QueryState>
  </main>;
}

function OrderCard({ order, busy, changeStatus, mode }: { order: AdminOrder; busy: boolean; changeStatus: (order: AdminOrder, status: OrderStatus) => void; mode: 'order' | 'kitchen' }) {
  const next: Partial<Record<OrderStatus, OrderStatus>> = { received: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'completed' };
  const actionNames: Partial<Record<OrderStatus, string>> = { received: 'Siparişi onayla', confirmed: 'Hazırlamaya al', preparing: 'Hazır olarak işaretle', ready: 'Tamamlandı' };
  return <article className="overflow-hidden rounded-[20px] border border-[#e2d7cb] bg-[#fbf8f1] shadow-sm shadow-[#593f2d]/5" data-testid={`card-order-${order.id}`}><header className="flex items-start justify-between gap-3 border-b border-[#ece3d9] px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="font-display text-2xl font-bold">#{order.orderNumber}</h2><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${statusTone[order.status]}`} data-testid={`status-order-${order.id}`}>{statusNames[order.status]}</span></div><p className="mt-1 text-[10px] text-[#86796d]">{shortDate(order.createdAt)}</p></div><span className="rounded-full bg-[#f1e8dc] px-3 py-1.5 text-[9px] font-bold text-[#695e53]">{order.fulfillmentType === 'pickup' ? 'Gel-al' : 'Masada'}</span></header>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold">{order.customerName}</p><p className="mt-1 text-[10px] text-[#766b61]">{order.customerPhone}</p></div><b className="font-mono text-sm text-[#a64d36]" data-testid={`text-order-total-${order.id}`}>{money(order.totalCents)}</b></div><div className="mt-4 space-y-2 border-t border-[#ece3d9] pt-4">{order.items.map((item) => <div key={item.id}><div className="flex justify-between gap-3 text-[10px]"><span><b>{item.quantity}×</b> {item.productName}</span><span>{money(item.lineTotalCents)}</span></div>{item.options.map((o) => <p key={o.id} className="ml-4 mt-1 text-[9px] text-[#86796d]">+ {o.name}{o.quantity > 1 ? ` ×${o.quantity}` : ''}</p>)}</div>)}</div>{order.notes && <div className="mt-4 rounded-xl bg-[#f2eadf] px-3 py-2.5 text-[10px] leading-4 text-[#655b50]"><b>Not:</b> {order.notes}</div>}
      <div className="mt-5 flex flex-wrap gap-2">{next[order.status] && <button disabled={busy} onClick={() => changeStatus(order, next[order.status]!)} className="flex-1 rounded-full bg-[#c45d40] px-4 py-3 text-[10px] font-bold text-white disabled:opacity-50" data-testid={`button-advance-order-${order.id}`}>{mode === 'kitchen' ? actionNames[order.status] : actionNames[order.status]} <ArrowRight size={13} className="ml-1 inline" /></button>}{mode === 'order' && !['completed', 'cancelled'].includes(order.status) && <button disabled={busy} onClick={() => changeStatus(order, 'cancelled')} className="rounded-full border border-[#e3c9bd] px-4 py-3 text-[10px] font-bold text-[#9b4935] disabled:opacity-50" data-testid={`button-cancel-order-${order.id}`}>İptal et</button>}</div>
    </div></article>;
}

export function KitchenPage() {
  const client = useQueryClient();
  const query = useListAdminOrders({ limit: 100 }, { query: { queryKey: getListAdminOrdersQueryKey({ limit: 100 }), refetchInterval: 10000 } });
  const update = useUpdateAdminOrderStatus(); const [error, setError] = useState('');
  const active = (query.data?.orders ?? []).filter((order) => ['received', 'confirmed', 'preparing', 'ready'].includes(order.status));
  const columns: { key: OrderStatus; title: string; orders: AdminOrder[] }[] = [
    { key: 'received', title: 'Yeni gelenler', orders: active.filter((o) => o.status === 'received') },
    { key: 'confirmed', title: 'Onaylananlar', orders: active.filter((o) => o.status === 'confirmed') },
    { key: 'preparing', title: 'Hazırlanıyor', orders: active.filter((o) => o.status === 'preparing') },
    { key: 'ready', title: 'Servise hazır', orders: active.filter((o) => o.status === 'ready') },
  ];
  const changeStatus = (order: AdminOrder, status: OrderStatus) => update.mutate({ orderId: order.id, data: { status } }, { onSuccess: () => client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey({ limit: 100 }) }), onError: (e) => setError(errorText(e)) });
  return <main className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><PageHeading kicker="Canlı mutfak akışı" title="Siparişler, sırayla." detail="Yeni siparişlerden servise hazır olana kadar. Pano 10 saniyede bir kendini yeniler." action={<span className="inline-flex items-center gap-2 rounded-full bg-[#e6efe3] px-4 py-2.5 text-[10px] font-bold text-[#4d7049]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#66865b]" />Canlı güncelleniyor</span>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#fbede8] p-3 text-xs text-[#90432f]" data-testid="status-kitchen-error">{error}</p>}
    <QueryState loading={query.isLoading} error={query.isError} onRetry={() => query.refetch()}>
      <div className="grid gap-4 xl:grid-cols-4">{columns.map((column) => <section key={column.key} className="min-h-[260px] rounded-[20px] bg-[#eae2d8] p-3 sm:p-4" data-testid={`column-kitchen-${column.key}`}><header className="mb-3 flex items-center justify-between px-1 py-1"><div><h2 className="font-display text-lg font-bold">{column.title}</h2><p className="text-[9px] text-[#86796d]">{column.orders.length} sipariş sırada</p></div><span className="grid h-8 min-w-8 place-items-center rounded-full bg-[#fbf8f1] px-2 font-mono text-xs font-bold">{column.orders.length}</span></header><div className="space-y-3">{column.orders.map((order) => <OrderCard key={order.id} order={order} busy={update.isPending} changeStatus={changeStatus} mode="kitchen" />)}{!column.orders.length && <div className="rounded-2xl border border-dashed border-[#d1c5b8] px-4 py-9 text-center text-[10px] text-[#918478]">Bu aşamada sipariş yok.</div>}</div></section>)}</div>
      {!active.length && !query.isLoading && <div className="mt-4 rounded-2xl bg-[#fbf8f1] p-8 text-center text-sm text-[#766b61]">Şu anda hazırlanmayı bekleyen sipariş bulunmuyor.</div>}
    </QueryState>
  </main>;
}
