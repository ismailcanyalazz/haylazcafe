import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Clock, Coffee, Instagram, MapPin, Menu as MenuIcon, Phone, Utensils, X } from 'lucide-react';
import { useGetPublicMenu, useCreateOrder } from '@workspace/api-client-react';
import type { MenuProduct, OrderLineInput, OrderReceipt, OrderSubmission, SelectedOption } from '@workspace/api-client-react';
import { PricingPage, OrdersPage, KitchenPage, AdminGuard, AdminNav } from './pages/admin';
import { formatAddress, formatOpeningHours, formatPhone, site } from './data/site';
import { pageTitle } from './lib/seo';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');


const tl = (cents: number | null | undefined) => cents == null ? 'Fiyat sorunuz' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(cents / 100);
type CartLine = { key: string; product: MenuProduct; quantity: number; options: SelectedOption[] };

/** Sekme başlığını ve meta açıklamasını sayfaya göre günceller. */
function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title;
    if (!description) return;
    const tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute('content', description);
  }, [title, description]);
}

const CART_STORAGE_KEY = 'haylaz:cart:v1';

/**
 * Sepeti tarayıcıda saklar; sayfa yenilendiğinde veya müşteri geri
 * döndüğünde seçimleri kaybolmaz. Depolama erişilemezse (gizli sekme,
 * site verisi kapalı) sessizce bellekte çalışmaya devam eder.
 */
function loadCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === 'object' && line !== null &&
        typeof (line as CartLine).key === 'string' &&
        typeof (line as CartLine).quantity === 'number' &&
        Array.isArray((line as CartLine).options) &&
        typeof (line as CartLine).product?.id === 'string',
    );
  } catch {
    return [];
  }
}

function saveCart(lines: CartLine[]) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Depolama kullanılamıyor; sepet yalnızca bu sekmede yaşar.
  }
}
const orderLine = (line: CartLine): OrderLineInput => ({ productId: line.product.id, quantity: line.quantity, options: line.options });
function priceOf(product: MenuProduct, options: SelectedOption[]) {
  if (product.priceCents == null) return null;
  let sum = product.priceCents;
  for (const selected of options) {
    const option = product.options.find((candidate) => candidate.id === selected.optionId);
    if (!option || option.priceCents == null) return null;
    if (option.pricingModel !== 'free') {
      sum += option.priceCents * (option.pricingModel === 'per_unit' ? selected.quantity : 1);
    }
  }
  return sum;
}

function SiteHeader({ cartCount, onCart }: { cartCount: number; onCart: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [{ href: '#hikayemiz', label: 'Hikâyemiz' }, { href: '#menu', label: 'Menümüz' }, { href: '#anlar', label: 'Güzel anlar' }, { href: '#iletisim', label: 'İletişim' }];
  return <header className="site-header fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#211f1d]/95 text-[#fbf8f1]">
    <div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-14">
      <a href="#anasayfa" className="group flex items-center gap-3" data-testid="link-brand-home"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e76b4b] text-xl font-bold">h</span><span><b className="block font-display text-xl">haylaz</b><small className="block text-[9px] font-bold uppercase tracking-[.27em] text-[#d5c9bb]">kafe & mutfak</small></span></a>
      <nav className="hidden items-center gap-7 md:flex" aria-label="Ana menü">{nav.map((item) => <a key={item.href} href={item.href} className="text-xs font-semibold text-[#e1d9d0] hover:text-[#f17a59]" data-testid={`link-nav-${item.href.slice(1)}`}>{item.label}</a>)}
        <a href={`${basePath}/admin`} className="text-xs font-bold text-[#f1a07f]" data-testid="link-admin">Yönetim</a>
        <button type="button" onClick={onCart} className="ml-1 inline-flex items-center gap-2 rounded-full bg-[#e76b4b] px-5 py-3 text-xs font-bold text-white hover:bg-[#f07857]" data-testid="button-open-cart"><span>Sepetim</span><span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#292623] px-1 text-[10px]" data-testid="text-cart-count">{cartCount}</span></button>
      </nav>
      <div className="flex items-center gap-2 md:hidden">
        <button type="button" onClick={onCart} className="relative grid h-10 w-10 place-items-center rounded-full bg-[#e76b4b] text-xs font-bold" aria-label="Sepeti aç" data-testid="button-mobile-open-cart">{cartCount}<span className="sr-only">ürün, sepeti aç</span></button>
        <button type="button" aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'} onClick={() => setMobileOpen(!mobileOpen)} className="grid h-10 w-10 place-items-center rounded-full border border-white/15" data-testid="button-mobile-menu">{mobileOpen ? <X size={19} /> : <MenuIcon size={19} />}</button>
      </div>
    </div>
    {mobileOpen && <nav className="border-t border-white/10 bg-[#211f1d] px-6 pb-5 pt-2 md:hidden" aria-label="Mobil menü">{nav.map((item) => <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="block border-b border-white/10 py-3.5 text-sm font-semibold text-[#f2e9dd]">{item.label}</a>)}<button onClick={() => { setMobileOpen(false); onCart(); }} className="mt-4 w-full rounded-full bg-[#e76b4b] px-5 py-3 text-sm font-bold">Sepeti görüntüle · {cartCount} ürün</button></nav>}
  </header>;
}

function CartPanel({ open, lines, setLines, close, onSubmit, submitting, success, error }: {
  open: boolean; lines: CartLine[]; setLines: (lines: CartLine[]) => void; close: () => void;
  onSubmit: (form: { name: string; phone: string; fulfillment: 'pickup' | 'dine_in'; notes: string }) => void;
  submitting: boolean; success: OrderReceipt | null; error: string;
}) {
  const [checkout, setCheckout] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', fulfillment: 'pickup' as 'pickup' | 'dine_in', notes: '' });
  useEffect(() => { if (!open) { setCheckout(false); } }, [open]);
  if (!open) return null;
  const subtotal = lines.reduce((total, line) => total + (priceOf(line.product, line.options) ?? 0) * line.quantity, 0);
  const hasUnpriced = lines.some((line) => priceOf(line.product, line.options) == null);
  return <div className="fixed inset-0 z-[80] flex justify-end bg-[#211f1d]/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sipariş sepeti" data-testid="dialog-cart">
    <button className="absolute inset-0 cursor-default" onClick={close} aria-label="Sepeti kapat" />
    <aside className="relative flex h-full w-full max-w-[520px] flex-col bg-[#fbf8f1] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#e5dbd0] px-6 py-5"><div><span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#c45d40]">Haylaz Cafe</span><h2 className="mt-1 font-display text-2xl font-bold">{success ? 'Sipariş alındı' : checkout ? 'Sipariş bilgileri' : 'Sepetin'}</h2></div><button onClick={close} aria-label="Kapat" className="grid h-10 w-10 place-items-center rounded-full bg-[#eee5da]" data-testid="button-close-cart"><X size={18} /></button></div>
      {success ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-[#e6efe6] text-[#41704c]"><Check size={28} /></span><h3 className="mt-5 font-display text-3xl font-bold">Afiyet olsun!</h3><p className="mt-2 text-sm text-[#766b61]">Siparişiniz mutfağa iletildi.</p><div className="mt-7 w-full rounded-2xl bg-[#f1e8dc] p-5 text-left"><p className="text-[10px] font-bold uppercase tracking-widest text-[#86796d]">Sipariş numarası</p><strong className="mt-1 block font-mono text-3xl" data-testid="text-order-number">#{success.orderNumber}</strong><p className="mt-4 text-sm">Toplam <b className="float-right">{tl(success.totalCents)}</b></p><p className="mt-2 text-xs text-[#766b61]">Durum: {statusLabel(success.status)}</p></div><button onClick={close} className="mt-7 w-full rounded-full bg-[#292623] px-5 py-4 text-sm font-bold text-white" data-testid="button-close-receipt">Menüye dön</button></div>
        : <>
          <div className="flex-1 overflow-y-auto p-6">
            {!checkout ? <>{lines.length === 0 ? <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-[#f0e4d8] text-[#c45d40]"><Coffee size={25} /></span><h3 className="mt-5 font-display text-2xl font-bold">Sepetin henüz boş</h3><p className="mt-2 max-w-[250px] text-xs leading-5 text-[#766b61]">Menümüzden bir şeyler seç, güzel bir mola hazırlayalım.</p><button onClick={close} className="mt-5 text-xs font-bold text-[#ba5538]">Menüyü keşfet</button></div> : <div className="divide-y divide-[#e9dfd4]">{lines.map((line) => <div key={line.key} className="flex gap-4 py-5" data-testid={`cart-line-${line.key}`}><img src={line.product.imageUrl || '/images/kumpir.jpg'} alt="" className="h-20 w-20 rounded-2xl object-cover" loading="lazy" decoding="async" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><div><h3 className="font-bold">{line.product.name}</h3><p className="mt-1 text-[10px] text-[#86796d]">{line.options.map((opt) => line.product.options.find((o) => o.id === opt.optionId)?.name).filter(Boolean).join(' · ') || 'Sade tercih'}</p></div><b className="whitespace-nowrap text-sm text-[#ba5538]" data-testid={`text-line-price-${line.key}`}>{priceOf(line.product, line.options) == null ? 'Fiyat belirtilmemiş' : tl((priceOf(line.product, line.options) ?? 0) * line.quantity)}</b></div><div className="mt-3 flex items-center gap-3"><button onClick={() => setLines(lines.map((l) => l.key === line.key ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l))} aria-label="Adedi azalt" className="grid h-8 w-8 place-items-center rounded-full border border-[#d8ccbf]" data-testid={`button-decrease-${line.key}`}>−</button><span className="w-5 text-center text-xs font-bold">{line.quantity}</span><button onClick={() => setLines(lines.map((l) => l.key === line.key ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l))} aria-label="Adedi artır" className="grid h-8 w-8 place-items-center rounded-full border border-[#d8ccbf]" data-testid={`button-increase-${line.key}`}>+</button><button onClick={() => setLines(lines.filter((l) => l.key !== line.key))} className="ml-auto text-[10px] font-bold text-[#aa4933]" data-testid={`button-remove-${line.key}`}>Kaldır</button></div></div></div>)}</div>}</>
              : <form id="order-form" className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
                <label className="block text-xs font-bold">Adınız soyadınız<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field-control mt-2" placeholder="Örn. Deniz Yılmaz" data-testid="input-customer-name" /></label>
                <label className="block text-xs font-bold">Telefon numaranız<input required minLength={7} maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="field-control mt-2" placeholder="05xx xxx xx xx" data-testid="input-customer-phone" /></label>
                <fieldset><legend className="mb-2 text-xs font-bold">Sipariş şekli</legend><div className="grid grid-cols-2 gap-2">{(['pickup', 'dine_in'] as const).map((type) => <button type="button" onClick={() => setForm({ ...form, fulfillment: type })} className={`rounded-xl border p-3 text-xs font-bold ${form.fulfillment === type ? 'border-[#c45d40] bg-[#f4e5da] text-[#a4472f]' : 'border-[#ded2c4]'}`} key={type} data-testid={`button-fulfillment-${type}`}>{type === 'pickup' ? 'Gel-al' : 'Masada'}</button>)}</div></fieldset>
                <label className="block text-xs font-bold">Sipariş notu <span className="font-normal text-[#86796d]">(isteğe bağlı)</span><textarea maxLength={500} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="field-control mt-2 resize-none" placeholder="Varsa mutfağa notunuz" data-testid="input-order-notes" /></label>
                <div className="rounded-xl bg-[#f1e8dc] p-4"><div className="flex justify-between text-xs text-[#766b61]"><span>{lines.reduce((n, l) => n + l.quantity, 0)} ürün</span><span>{hasUnpriced ? 'Toplam net değil' : tl(subtotal)}</span></div><p className="mt-2 text-[10px] leading-4 text-[#86796d]">Nihai tutar siparişiniz sunucu tarafından doğrulandıktan sonra kesinleşir.</p></div>
                {error && <p role="alert" className="rounded-xl bg-[#f7e5df] p-3 text-xs text-[#9b402c]" data-testid="status-order-error">{error}</p>}
              </form>}
          </div>
          {!success && <div className="border-t border-[#e5dbd0] p-6"><div className="mb-4 flex justify-between text-sm font-bold"><span>Sepet toplamı</span><span className="text-[#ba5538]" data-testid="text-cart-subtotal">{hasUnpriced ? 'Fiyat teyidi gerekli' : tl(subtotal)}</span></div>
            {hasUnpriced && <p className="mb-4 rounded-xl bg-[#f7e5df] p-3 text-[10px] leading-4 text-[#8c412e]" data-testid="status-unpriced-cart">Sepetinizde fiyatı henüz belirlenmemiş ürün var. Bu ürünle sipariş verilemez.</p>}
            {checkout ? <div className="grid grid-cols-2 gap-3"><button onClick={() => setCheckout(false)} className="rounded-full border border-[#d8ccbf] px-4 py-4 text-xs font-bold" data-testid="button-back-cart">Sepete dön</button><button form="order-form" disabled={submitting || !lines.length || hasUnpriced} className="rounded-full bg-[#c45d40] px-4 py-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-submit-order">{submitting ? 'Gönderiliyor…' : 'Siparişi gönder'}</button></div>
              : <button onClick={() => setCheckout(true)} disabled={!lines.length || hasUnpriced} className="w-full rounded-full bg-[#c45d40] px-5 py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-start-checkout">Siparişi tamamla <ArrowRight className="ml-2 inline" size={16} /></button>}
          </div>}
        </>}
    </aside>
  </div>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { received: 'Yeni alındı', confirmed: 'Onaylandı', preparing: 'Hazırlanıyor', ready: 'Hazır', completed: 'Tamamlandı', cancelled: 'İptal edildi' };
  return labels[status] || status;
}

function LiveMenu({ add }: { add: (product: MenuProduct, options: SelectedOption[]) => void }) {
  const { data, isLoading, isError, refetch } = useGetPublicMenu();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customize, setCustomize] = useState<MenuProduct | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const categories = data?.categories ?? [];
  useEffect(() => { if (categories.length && !activeCategory) setActiveCategory(categories[0].id); }, [categories, activeCategory]);
  const current = categories.find((category) => category.id === activeCategory);
  const changeOption = (optionId: string, quantity: number, max: number) => setSelected((old) => ({ ...old, [optionId]: Math.max(0, Math.min(max, quantity)) }));
  const selectedOptions = (product: MenuProduct) => product.options.filter((option) => (selected[option.id] || 0) > 0).map((option) => ({ optionId: option.id, quantity: selected[option.id] }));
  return <section id="menu" className="bg-[#f3eee5] px-5 py-24 sm:px-8 md:py-32 lg:px-14">
    <div className="mx-auto max-w-[1280px]"><div className="flex flex-col justify-between gap-8 md:flex-row md:items-end"><div><span className="mb-5 block text-[10px] font-bold uppercase tracking-[.25em] text-[#c45d40]">Masaya davetlisiniz</span><h2 className="font-display text-[clamp(3rem,6.5vw,6.2rem)] font-bold leading-[.95] tracking-[-.055em]">Menüden<br /><span className="text-[#c75c3f]">favorini seç.</span></h2></div><p className="max-w-[320px] pb-1 text-[13px] leading-6 text-[#74695f]">Güncel fiyatlar ve sipariş seçenekleri burada. Sepete ekle, gerisini biz hazırlayalım.</p></div>
      {isLoading ? <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-[280px] rounded-[22px]" />)}</div>
        : isError ? <div className="mt-10 rounded-3xl border border-[#e4c8bb] bg-[#fbf8f1] p-8 text-center"><h3 className="font-display text-2xl font-bold">Menü şu an yüklenemedi</h3><p className="mt-2 text-sm text-[#766b61]">Bağlantınızı kontrol edip yeniden deneyin.</p><button onClick={() => refetch()} className="mt-5 rounded-full bg-[#292623] px-5 py-3 text-xs font-bold text-white" data-testid="button-menu-retry">Yeniden dene</button></div>
          : categories.length === 0 ? <div className="mt-10 rounded-3xl bg-[#fbf8f1] p-8 text-center text-sm text-[#766b61]">Menü içeriği yakında burada olacak.</div>
            : <>
              <div className="menu-scroll mt-10 flex gap-2 overflow-x-auto border-b border-[#d6c9bb] pb-4" role="tablist" aria-label="Menü kategorileri">{categories.map((category) => <button type="button" key={category.id} onClick={() => setActiveCategory(category.id)} role="tab" aria-selected={activeCategory === category.id} className={`shrink-0 rounded-full px-5 py-3 text-[11px] font-bold transition-colors ${activeCategory === category.id ? 'bg-[#292623] text-[#fff9ef]' : 'text-[#766b61] hover:bg-[#e7ded2]'}`} data-testid={`button-category-${category.id}`}>{category.title}</button>)}</div>
              {current && <div className="mt-8 grid gap-7 lg:grid-cols-[.82fr_1.18fr]">
                <article className="relative min-h-[340px] overflow-hidden rounded-[26px] bg-[#292623] text-[#fbf8f1] shadow-xl shadow-[#5a4432]/10"><img src={current.products.find((p) => p.imageUrl)?.imageUrl || categoryPhoto(current.title)} alt={`${current.title} lezzetleri`} className="absolute inset-0 h-full w-full object-cover opacity-70" /><div className="absolute inset-0 bg-gradient-to-t from-[#211f1d]/90 via-[#211f1d]/10 to-transparent" /><div className="absolute bottom-0 p-7"><span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#ef9678]">Haylaz mutfağından</span><h3 className="mt-2 font-display text-4xl font-bold">{current.title}</h3><p className="mt-3 max-w-sm text-xs leading-6 text-[#e2d8ce]">{current.products.length} lezzet, güncel fiyatıyla. İçine sineni seç.</p></div></article>
                <div className="rounded-[26px] border border-[#ded2c4] bg-[#fbf8f1] p-5 sm:p-8"><div className="mb-5 flex items-center justify-between"><div><span className="text-[9px] font-bold uppercase tracking-[.22em] text-[#c45d40]">İştah açan seçenekler</span><h3 className="mt-2 font-display text-2xl font-bold text-[#292623]">{current.title} menüsü</h3></div><span className="grid h-11 w-11 place-items-center rounded-full bg-[#f0e3d5] text-[#c45d40]"><Utensils size={18} /></span></div>
                  <div className="divide-y divide-[#e5dbd0]">{current.products.map((product) => {
                    const priced = product.priceCents != null && product.isAvailable;
                    return <div key={product.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`menu-item-${product.id}`}>
                      <div className="flex min-w-0 items-center gap-3">{product.imageUrl && <img src={product.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" loading="lazy" decoding="async" />}<div><p className="text-sm font-bold text-[#342d27]" data-testid={`text-menu-name-${product.id}`}>{product.name}</p>{product.description && <p className="mt-1 line-clamp-2 text-[10px] text-[#86796d]">{product.description}</p>}{!product.isAvailable && <span className="mt-1 block text-[9px] font-bold text-[#a24d39]">Şu an satışta değil</span>}</div></div>
                      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">{product.campaignPriceCents != null && product.basePriceCents != null && <del className="text-[10px] text-[#93877b]" data-testid={`text-old-price-${product.id}`}>{tl(product.basePriceCents)}</del>}<span className={`font-mono text-sm font-bold ${product.priceCents == null ? 'text-[#8b7c70]' : 'text-[#c45d40]'}`} data-testid={`text-menu-price-${product.id}`}>{product.priceCents == null ? 'Fiyat belirlenmemiş' : tl(product.priceCents)}{product.campaignPriceCents != null && product.priceCents != null && <small className="ml-1 font-sans text-[8px] text-[#65734f]">Kampanya</small>}</span><button disabled={!priced} onClick={() => { setSelected({}); setCustomize(product); }} className="rounded-full bg-[#292623] px-4 py-2.5 text-[10px] font-bold text-white transition-colors hover:bg-[#c45d40] disabled:cursor-not-allowed disabled:bg-[#e5dbd0] disabled:text-[#83796e]" data-testid={`button-add-product-${product.id}`}>{product.priceCents == null ? 'Sipariş verilemez' : product.isAvailable ? 'Seç ve ekle' : 'Tükendi'}</button></div>
                    </div>;
                  })}</div>
                  {current.products.length === 0 && <p className="py-10 text-center text-sm text-[#766b61]">Bu kategoride şimdilik ürün yok.</p>}
                </div></div>}
            </>}
      <p className="mt-5 text-right text-[10px] leading-5 text-[#84786d]" data-testid="text-menu-price-note">Fiyatı belirtilmemiş ürünler siparişe kapalıdır. Sipariş tutarı sunucuda doğrulanır.</p>
    </div>
    {customize && <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#211f1d]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="customize-title" data-testid="dialog-product-options"><div className="w-full max-w-[480px] rounded-[25px] bg-[#fbf8f1] p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#c45d40]">{customize.category}</span><h3 id="customize-title" className="mt-1 font-display text-3xl font-bold">{customize.name}</h3><p className="mt-1 font-mono text-sm font-bold text-[#ba5538]">{tl(customize.priceCents)}</p></div><button onClick={() => setCustomize(null)} className="grid h-9 w-9 place-items-center rounded-full bg-[#eee5da]" aria-label="Pencereyi kapat" data-testid="button-close-options"><X size={17} /></button></div>
      {customize.options.length ? <div className="mt-6 max-h-[48vh] space-y-4 overflow-y-auto">{customize.options.map((option) => <div key={option.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5dbd0] p-3" data-testid={`option-row-${option.id}`}><div><p className="text-xs font-bold">{option.name}</p><p className="mt-1 text-[10px] text-[#86796d]">{option.priceCents == null ? 'Fiyat belirlenmemiş' : option.pricingModel === 'free' ? 'Ücretsiz' : tl(option.priceCents)}</p></div>{option.priceCents == null || !option.isAvailable ? <span className="text-[10px] font-bold text-[#9b5948]">{option.priceCents == null ? 'Fiyat bekleniyor' : 'Satışta değil'}</span> : <div className="flex items-center gap-2"><button disabled={!selected[option.id]} onClick={() => changeOption(option.id, (selected[option.id] || 0) - 1, option.maxQuantity)} className="grid h-8 w-8 place-items-center rounded-full border border-[#d8ccbf] disabled:opacity-35" aria-label={`${option.name} azalt`} data-testid={`button-decrease-option-${option.id}`}>−</button><span className="w-4 text-center text-xs font-bold">{selected[option.id] || 0}</span><button disabled={(selected[option.id] || 0) >= Math.min(20, option.maxQuantity)} onClick={() => changeOption(option.id, (selected[option.id] || 0) + 1, option.maxQuantity)} className="grid h-8 w-8 place-items-center rounded-full border border-[#d8ccbf] disabled:opacity-35" aria-label={`${option.name} artır`} data-testid={`button-increase-option-${option.id}`}>+</button></div>}</div>)}</div> : <p className="mt-5 rounded-xl bg-[#f1e8dc] p-4 text-xs text-[#766b61]">Bu ürün için ek seçenek bulunmuyor.</p>}
      <div className="mt-6 flex items-center justify-between border-t border-[#e5dbd0] pt-5"><div><span className="block text-[9px] font-bold uppercase tracking-widest text-[#86796d]">Birim toplam</span><b className="mt-1 block font-mono text-lg text-[#ba5538]">{tl(priceOf(customize, selectedOptions(customize)))}</b></div><button onClick={() => { add(customize, selectedOptions(customize)); setCustomize(null); }} className="rounded-full bg-[#c45d40] px-6 py-3.5 text-xs font-bold text-white" data-testid="button-confirm-add">Sepete ekle <ArrowRight className="ml-2 inline" size={14} /></button></div>
    </div></div>}
  </section>;
}
function categoryPhoto(title: string) {
  const t = title.toLocaleLowerCase('tr-TR');
  if (t.includes('waffle') || t.includes('tatlı')) return '/images/waffle.jpg';
  if (t.includes('kahvalt')) return '/images/breakfast.jpg';
  if (t.includes('makarna')) return '/images/pasta.jpg';
  if (t.includes('içecek') || t.includes('kahve')) return '/images/coffee.jpg';
  if (t.includes('aperitif') || t.includes('atıştır')) return '/images/breakfast.jpg';
  return '/images/kumpir.jpg';
}

function Home() {
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [orderError, setOrderError] = useState('');
  const orderKey = useRef<string | null>(null);
  const createOrder = useCreateOrder();
  useDocumentTitle(pageTitle, site.description);
  useEffect(() => { saveCart(cart); }, [cart]);
  const addToCart = (product: MenuProduct, options: SelectedOption[]) => {
    const key = `${product.id}:${options.map((o) => `${o.optionId}-${o.quantity}`).sort().join(',')}`;
    setCart((old) => {
      const existing = old.find((line) => line.key === key);
      if (existing) return old.map((line) => line.key === key ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line);
      return [...old, { key, product, quantity: 1, options }];
    });
  };
  const submitOrder = (form: { name: string; phone: string; fulfillment: 'pickup' | 'dine_in'; notes: string }) => {
    const quotedTotalCents = cart.reduce((sum, line) => sum + (priceOf(line.product, line.options) ?? 0) * line.quantity, 0);
    orderKey.current ||= crypto.randomUUID();
    const payload: OrderSubmission = { customerName: form.name.trim(), customerPhone: form.phone.trim(), fulfillmentType: form.fulfillment, notes: form.notes.trim() || null, quotedTotalCents, idempotencyKey: orderKey.current, items: cart.map(orderLine) };
    setOrderError('');
    createOrder.mutate({ data: payload }, { onSuccess: (result) => { orderKey.current = null; setReceipt(result); setCart([]); }, onError: (err) => setOrderError(errorMessage(err)) });
  };
  const cartCount = cart.reduce((n, line) => n + line.quantity, 0);
  return <main className="grain overflow-hidden bg-[#f3eee5] text-[#28221e]">
    <a href="#menu" className="sr-only rounded-full bg-[#292623] px-5 py-3 text-xs font-bold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]" data-testid="link-skip-to-menu">Menüye atla</a>
    <SiteHeader cartCount={cartCount} onCart={() => { setReceipt(null); setCartOpen(true); }} />
    <section id="anasayfa" className="relative min-h-[730px] bg-[#211f1d] pb-16 pt-[74px] text-[#fbf8f1] lg:min-h-[810px]">
      <div className="absolute inset-0"><img src="/images/kumpir.jpg" alt="Rengârenk malzemelerle hazırlanmış fırın kumpir" className="hero-image h-full w-full object-cover object-center opacity-[.54]" fetchPriority="high" decoding="async" /><div className="absolute inset-0 bg-gradient-to-r from-[#211f1d] via-[#211f1d]/80 to-[#211f1d]/15" /><div className="absolute inset-0 bg-gradient-to-t from-[#211f1d] via-transparent to-[#211f1d]/10" /></div>
      <div className="relative mx-auto grid min-h-[650px] max-w-[1440px] items-center px-5 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-14"><div className="max-w-[690px] pb-10 pt-20"><div className="reveal mb-7 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.28em] text-[#f4bd8b]"><span className="h-px w-9 bg-[#e76b4b]" />Mahallenin keyifli buluşma noktası</div><h1 className="reveal reveal-delay-1 font-display text-[clamp(3.7rem,8vw,7.6rem)] font-bold leading-[.96] tracking-[-.055em]">Lezzetin En<br /><span className="text-[#f07857]">Keyifli Hali!</span></h1><p className="reveal reveal-delay-2 mt-7 max-w-[420px] text-[15px] leading-7 text-[#e1d9d0] sm:text-[17px]">Bir kumpirle başlayan, kahveyle uzayan güzel anlar. Haylaz Cafe’de her bahaneye yer var.</p><div className="reveal reveal-delay-3 mt-9 flex flex-wrap items-center gap-4"><a href="#menu" className="inline-flex items-center gap-3 rounded-full bg-[#e76b4b] px-6 py-4 text-xs font-bold text-white shadow-lg transition-all hover:-translate-y-1" data-testid="link-hero-menu">Menüye göz at <ArrowRight size={16} /></a><a href="#hikayemiz" className="inline-flex items-center gap-2 px-2 py-3 text-xs font-semibold text-[#f5ece1]" data-testid="link-hero-story">Haylaz’ı tanı <ArrowDown size={14} /></a></div><div className="mt-14 flex items-center gap-4 border-t border-white/15 pt-5 text-[10px] uppercase tracking-[.2em] text-[#c8bdb1]"><Utensils size={16} className="text-[#ec7958]" />Kumpir · kahvaltı · tatlı · kahve</div></div>
        <div className="relative hidden min-h-[550px] items-center justify-center lg:flex"><div className="absolute right-[8%] top-[15%] h-[410px] w-[410px] rounded-full border border-white/15" /><div className="absolute right-[14%] top-[21%] h-[350px] w-[350px] rounded-full border border-white/10" /><div className="absolute right-[15%] top-[19%] h-[390px] w-[390px] rotate-[-9deg] overflow-hidden rounded-[48%_52%_45%_55%] border-[7px] border-[#f3eee5]/80 shadow-2xl"><img src="/images/kumpir.jpg" alt="Bol malzemeli Haylaz kumpiri" className="h-full w-full object-cover" loading="lazy" decoding="async" /></div><div className="absolute bottom-[9%] left-[4%] max-w-[230px] rounded-[22px] border border-white/10 bg-[#302c28]/90 p-5 shadow-xl backdrop-blur"><span className="text-[9px] font-bold uppercase tracking-[.24em] text-[#f1a07f]">Haylaz klasiği</span><p className="mt-2 font-display text-[21px] font-bold leading-tight">Kumpir keyfi,<br />tam kararında.</p><button onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })} className="mt-4 inline-flex items-center gap-2 text-[10px] font-bold text-[#f1a07f]" data-testid="button-hero-kumpir">Kumpiri gör <ArrowRight size={13} /></button></div></div>
      </div><div className="relative mx-auto flex max-w-[1440px] justify-between px-5 text-[10px] uppercase tracking-[.22em] text-[#aca197] sm:px-8 lg:px-14"><span>Güzel şeyler aceleye gelmez.</span><span className="hidden sm:inline">Bir masa, biraz sohbet, bolca lezzet.</span></div>
    </section>
    <section id="hikayemiz" className="relative overflow-hidden bg-[#f3eee5] px-5 py-24 sm:px-8 md:py-32 lg:px-14"><div className="mx-auto grid max-w-[1280px] gap-12 md:grid-cols-[.8fr_1.2fr] md:items-center md:gap-20"><div><span className="mb-5 block text-[10px] font-bold uppercase tracking-[.25em] text-[#cb6546]">Bizim küçük dünyamız</span><h2 className="font-display text-[clamp(2.8rem,5.6vw,5.1rem)] font-bold leading-[1.02] tracking-[-.045em]">Bir tabak<br />daha <em className="text-[#cc6245]">sohbet.</em></h2><div className="mt-8 h-1 w-16 rounded-full bg-[#e76b4b]" /></div><div className="max-w-[620px]"><p className="text-[17px] leading-8 text-[#544c44] sm:text-[19px]">Haylaz Cafe, mahallenin içinden bir mola. Fırından çıkan kumpirin kokusu, paylaşılan bir waffle ve masada uzayan sohbetler… Burada günün en güzel anı, birlikte geçirilen an.</p><p className="mt-5 text-sm leading-7 text-[#766b61]">Kahvaltıdan akşamüstü kahvesine; canınız ne zaman güzel bir şey çekerse, masamızda size de yer var. Sıcacık karşılamamız ve tanıdık lezzetlerimizle kendinizi evinizde hissedin.</p><a href="#anlar" className="mt-8 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[.14em] text-[#ba5538]" data-testid="link-story-moments">Haylaz anlarına bak <ArrowRight size={16} /></a></div></div></section>
    <section className="bg-[#292623] px-5 py-12 text-[#fbf8f1] sm:px-8 lg:px-14"><div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-6 md:grid-cols-4">{[{ title: 'Fırından', detail: 'Sıcak kumpir' }, { title: 'Paylaşmalı', detail: 'Serpme kahvaltı' }, { title: 'Tatlı kaçamak', detail: 'Meyveli waffle' }, { title: 'Uzayan mola', detail: 'Kahve & sohbet' }].map((item, i) => <div key={item.title} className="border-white/15 md:border-r"><span className="font-mono text-[10px] tracking-[.2em] text-[#e98667]">0{i + 1}</span><p className="mt-3 font-display text-xl font-bold">{item.title}</p><p className="mt-1 text-[11px] text-[#c5b9ad]">{item.detail}</p></div>)}</div></section>
    <LiveMenu add={addToCart} />
    <section className="relative overflow-hidden bg-[#e76b4b] px-5 py-16 text-[#fff8ed] sm:px-8 md:py-20 lg:px-14"><div className="relative mx-auto flex max-w-[1280px] flex-col gap-8 md:flex-row md:items-center md:justify-between"><div><span className="text-[10px] font-bold uppercase tracking-[.25em] text-[#ffe0c9]">Günün bahanesi hazır</span><h2 className="mt-3 max-w-[700px] font-display text-[clamp(2.7rem,5vw,4.7rem)] font-bold leading-[1.04]">Birlikte yenince daha güzel.</h2></div><button onClick={() => setCartOpen(true)} className="inline-flex w-fit items-center gap-4 rounded-full bg-[#292623] px-6 py-4 text-xs font-bold text-[#fff8ed]" data-testid="button-order-cta">Siparişini oluştur <ArrowRight size={16} /></button></div></section>
    <section id="anlar" className="bg-[#292623] px-5 py-24 text-[#fbf8f1] sm:px-8 md:py-32 lg:px-14"><div className="mx-auto max-w-[1280px]"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><span className="mb-5 block text-[10px] font-bold uppercase tracking-[.25em] text-[#ec8a69]">Günün her güzel anına</span><h2 className="font-display text-[clamp(2.8rem,5.5vw,5rem)] font-bold leading-none tracking-[-.04em]">Her gelişte başka<br />bir <em className="text-[#f07857]">favori.</em></h2></div><p className="max-w-[280px] text-[13px] leading-6 text-[#c3b8ac]">Sabah kahvaltısı, tatlı bir ara ya da akşamüstü kahvesi… Haylaz’da sana göre bir köşe var.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{ title: 'Kahvaltı uzasın', subtitle: 'Güne birlikte güzel başlayın.', image: '/images/breakfast.jpg', tag: 'Yavaş sabahlar', category: 'Kahvaltı' }, { title: 'Tatlı bir kaçamak', subtitle: 'Bir waffle, iki çatal, bol sohbet.', image: '/images/waffle.jpg', tag: 'Tatlı saatleri', category: 'Waffle' }, { title: 'Doyurucu mola', subtitle: 'Kendine iyi bakmanın lezzetli hâli.', image: '/images/pasta.jpg', tag: 'Öğle arası', category: 'Makarna' }, { title: 'Kahveye eşlik et', subtitle: 'Bir fincan daha kalmak için.', image: '/images/coffee.jpg', tag: 'Kahve sohbeti', category: 'İçecekler' }].map((moment, index) => <a key={moment.title} href="#menu" className={`group relative min-h-[330px] overflow-hidden rounded-[22px] ${index === 0 ? 'lg:translate-y-8' : ''} ${index === 3 ? 'lg:-translate-y-8' : ''}`} data-testid={`card-moment-${index}`}><img src={moment.image} alt={moment.title + ' için sunum'} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" decoding="async" /><div className="absolute inset-0 bg-gradient-to-t from-[#191715]/90 via-[#191715]/10 to-[#191715]/5" /><div className="absolute inset-x-0 bottom-0 p-5"><span className="text-[9px] font-bold uppercase tracking-[.22em] text-[#f4a384]">{moment.tag}</span><p className="mt-2 font-display text-[23px] font-bold">{moment.title}</p><p className="mt-1 text-[11px] text-[#e4d8cb]">{moment.subtitle}</p><span className="mt-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 group-hover:bg-[#e76b4b]"><ArrowUpRight size={15} /></span></div></a>)}</div></div></section>
    <section className="bg-[#f3eee5] px-5 py-20 sm:px-8 md:py-28 lg:px-14"><div className="mx-auto grid max-w-[1280px] gap-9 rounded-[28px] bg-[#e8ded1] p-7 sm:p-10 md:grid-cols-[1fr_.7fr] md:items-center md:p-14"><div><span className="text-[10px] font-bold uppercase tracking-[.25em] text-[#c45d40]">Sofraya buyur</span><h2 className="mt-4 font-display text-[clamp(2.6rem,5vw,4.3rem)] font-bold leading-[1.03] tracking-[-.045em]">Canın ne çektiyse,<br />tam zamanı.</h2><p className="mt-5 max-w-[490px] text-[13px] leading-6 text-[#71655a]">Kumpir, waffle, makarna, kahvaltı ve sevdiğin içecekler… Haylaz Cafe’de seni tanıdık bir lezzet ve içten bir karşılama bekliyor.</p><a href="#menu" className="mt-7 inline-flex items-center gap-3 rounded-full bg-[#292623] px-6 py-4 text-[11px] font-bold text-[#fff8ed]" data-testid="link-invitation-menu">Lezzetleri keşfet <ArrowRight size={15} /></a></div><div className="relative mx-auto w-full max-w-[390px]"><img src="/images/coffee.jpg" alt="Türk kahvesi ve çay ile kahve molası" className="aspect-[1.15] w-full rounded-[22px] object-cover shadow-xl" loading="lazy" decoding="async" /><div className="absolute -bottom-5 -right-3 rounded-[15px] bg-[#e76b4b] px-5 py-4 text-[#fff8ed] shadow-lg"><span className="block font-display text-[19px] font-bold">Kendine bir mola ver.</span><span className="mt-1 block text-[9px] uppercase tracking-[.15em] text-white/80">Lezzetin en keyifli hali</span></div></div></div></section>
    <ContactSection />
    <footer className="bg-[#211f1d] px-5 py-10 text-[#e9dfd4] sm:px-8 lg:px-14"><div className="mx-auto max-w-[1280px]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <a href="#anasayfa" className="flex items-center gap-3" data-testid="link-footer-home"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e76b4b] font-display text-xl font-bold text-white">h</span><span><b className="font-display text-[17px]">haylaz</b><small className="ml-2 text-[9px] uppercase tracking-[.2em] text-[#a99c8f]">cafe</small></span></a>
        <span className="text-[10px] text-[#aa9f94]">{site.slogan}</span>
        <a href="#anasayfa" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#e98b6d]" data-testid="link-back-to-top">Yukarı dön <ArrowUpRight size={14} /></a>
      </div>
      <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-6 text-[10px] text-[#a99c8f] sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
        <span>© {new Date().getFullYear()} {site.name}</span>
        {formatAddress() && <span data-testid="text-footer-address">{formatAddress()}</span>}
        {site.phone && <a href={`tel:${site.phone}`} className="font-semibold text-[#d9cdc1]" data-testid="link-footer-phone">{formatPhone()}</a>}
        {site.social.instagram && <a href={site.social.instagram} target="_blank" rel="noreferrer noopener" className="font-semibold text-[#e98b6d]" data-testid="link-footer-instagram">Instagram</a>}
      </div>
    </div></footer>
    <CartPanel open={cartOpen} lines={cart} setLines={setCart} close={() => setCartOpen(false)} onSubmit={submitOrder} submitting={createOrder.isPending} success={receipt} error={orderError} />
  </main>;
}
/**
 * İletişim bölümü. Tüm içerik `src/data/site.ts` dosyasından gelir;
 * doldurulmamış alanlar hiç çizilmez, böylece sitede boş kutu görünmez.
 */
function ContactSection() {
  const address = formatAddress();
  const hours = formatOpeningHours();
  const phone = site.phone ? formatPhone() : '';
  const { instagram, whatsapp } = site.social;
  const hasAnything = Boolean(address || phone || hours.length || instagram || whatsapp);

  return <section id="iletisim" className="bg-[#f3eee5] px-5 pb-20 sm:px-8 lg:px-14">
    <div className="mx-auto max-w-[1280px] border-t border-[#d8ccbf] pt-16 md:pt-20">
      <div className="grid gap-12 md:grid-cols-[1fr_.78fr]">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.25em] text-[#c45d40]">Yolun düşerse</span>
          <h2 className="mt-4 font-display text-[clamp(3rem,6vw,5.5rem)] font-bold leading-[.97] tracking-[-.055em]">Masamızda<br /><span className="text-[#c45d40]">yerin hazır.</span></h2>
          <p className="mt-6 max-w-[430px] text-sm leading-7 text-[#74695f]">Kumpirin fırından çıktığı, kahvenin yavaş içildiği bir köşe. Uğrarken haber ver, masanı hazırlayalım.</p>
          {site.mapsUrl && <a href={site.mapsUrl} target="_blank" rel="noreferrer noopener" className="mt-7 inline-flex items-center gap-3 rounded-full bg-[#292623] px-6 py-4 text-[11px] font-bold text-[#fff8ed]" data-testid="link-maps">Yol tarifi al <ArrowUpRight size={15} /></a>}
        </div>
        <div className="rounded-[23px] bg-[#292623] p-6 text-[#fbf8f1] sm:p-8">
          <h3 className="font-display text-2xl font-bold">Ziyaret bilgileri</h3>
          {hasAnything ? <div className="mt-6 divide-y divide-white/10">
            {address && <Info icon={<MapPin size={16} />} title="Adres">
              {site.mapsUrl
                ? <a href={site.mapsUrl} target="_blank" rel="noreferrer noopener" className="underline decoration-[#f1a07f] underline-offset-4" data-testid="link-address">{address}</a>
                : address}
            </Info>}
            {phone && <Info icon={<Phone size={16} />} title="Telefon">
              <a href={`tel:${site.phone}`} className="font-semibold" data-testid="link-phone">{phone}</a>
              {whatsapp && <> · <a href={whatsapp} target="_blank" rel="noreferrer noopener" className="font-semibold text-[#f1a07f]" data-testid="link-whatsapp">WhatsApp</a></>}
            </Info>}
            {hours.length > 0 && <Info icon={<Clock size={16} />} title="Çalışma saatleri">
              {hours.map((line) => <span key={line} className="block">{line}</span>)}
            </Info>}
            {instagram && <Info icon={<Instagram size={16} />} title="Sosyal medya">
              <a href={instagram} target="_blank" rel="noreferrer noopener" className="font-semibold text-[#f1a07f]" data-testid="link-instagram">Instagram'da takip et</a>
            </Info>}
          </div> : <>
            <p className="mt-2 text-[11px] text-[#c9beb2]">Adres, telefon ve çalışma saatleri yakında burada.</p>
            <span className="mt-5 block rounded-xl border border-dashed border-white/20 px-4 py-3 text-[10px] leading-5 text-[#bdb1a5]">Kurulum notu: bu alanı doldurmak için <code className="text-[#f1a07f]">src/data/site.ts</code> dosyasındaki işletme bilgilerini girin.</span>
          </>}
        </div>
      </div>
    </div>
  </section>;
}

function Info({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) { return <div className="flex gap-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-[#f28b69]">{icon}</span><div className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[.2em] text-[#f1a07f]">{title}</span><div className="mt-1 text-xs leading-5 text-[#eee5da]">{children}</div></div></div>; }
function errorMessage(err: unknown) {
  const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || 'Sipariş gönderilemedi. Lütfen yeniden deneyin.';
}
function NotFound() {
  useDocumentTitle(`Sayfa bulunamadı | ${site.name}`);
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f3eee5] p-6 text-center"><div><span className="font-mono text-xs text-[#c45d40]">404 · SAYFA BULUNAMADI</span><h1 className="mt-4 font-display text-4xl font-bold">Aradığınız sayfa burada değil.</h1><p className="mt-3 text-sm text-[#766b61]">Bağlantı eski olabilir. Menüye göz atmak ister misiniz?</p><a href={basePath || '/'} className="mt-6 inline-block rounded-full bg-[#292623] px-6 py-3 text-xs font-bold text-white" data-testid="link-notfound-home">Ana sayfaya dön</a></div></div>;
}
function RouteTree() {
  const [location] = useLocation();
  // Yönetim ve giriş ekranları arama motorlarına kapatılır (robots.txt'e ek güvence).
  useEffect(() => {
    const isPrivate = /^\/(admin|kitchen)/.test(location);
    let tag = document.head.querySelector('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', isPrivate ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  }, [location]);
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/admin" component={() => <AdminGuard><AdminNav><PricingPage /></AdminNav></AdminGuard>} />
    <Route path="/admin/pricing" component={() => <AdminGuard><AdminNav><PricingPage /></AdminNav></AdminGuard>} />
    <Route path="/admin/orders" component={() => <AdminGuard><AdminNav><OrdersPage /></AdminNav></AdminGuard>} />
    <Route path="/kitchen" component={() => <AdminGuard><AdminNav><KitchenPage /></AdminNav></AdminGuard>} />
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <WouterRouter base={basePath}>
    <QueryClientProvider client={queryClient}><RouteTree /></QueryClientProvider>
  </WouterRouter>;
}
export default App;
