/**
 * Yönetim paneli oturumu — şifre ile giriş.
 *
 * Oturum, sunucunun kurduğu HttpOnly çerezde tutulur; JavaScript çerezi
 * okuyamaz, dolayısıyla burada jeton saklanmaz. Giriş durumu her zaman
 * `/api/admin/access` uç noktasına sorularak öğrenilir.
 */

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

async function post(path: string, body?: unknown): Promise<void> {
  const response = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Aynı kaynaktan çalıştığı için çerez otomatik gider; açıkça belirtmek
    // farklı alan adından sunulma ihtimaline karşı güvenlidir.
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
    try {
      const data: unknown = await response.json();
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const error = (data as { error?: unknown }).error;
        if (typeof error === 'string' && error.length > 0) message = error;
      }
    } catch {
      // Gövde JSON değilse varsayılan mesaj kullanılır.
    }
    throw new Error(message);
  }
}

export const adminLogin = (password: string) => post('/admin/login', { password });
export const adminLogout = () => post('/admin/logout');
