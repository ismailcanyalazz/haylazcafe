import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

import {
  renderNoscriptMenu,
  renderRobotsTxt,
  renderSeoTags,
  renderSitemapXml,
} from './src/lib/seo';

/*
 * PORT ve BASE_PATH, Replit tarafından otomatik verilir. Vercel'de ve yerel
 * geliştirmede tanımlı olmadıkları için makul varsayılanlara düşülür —
 * aksi halde derleme daha başlamadan hata verirdi.
 */
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';
const isDev = process.env.NODE_ENV !== 'production';

const outDir = path.resolve(import.meta.dirname, 'dist/public');

/**
 * Arama motoru etiketlerini index.html'e gömer ve derleme sonunda
 * robots.txt / sitemap.xml dosyalarını üretir. İçerik src/data/site.ts
 * dosyasından gelir, böylece işletme bilgileri tek yerden yönetilir.
 */
function seoPlugin(): Plugin {
  return {
    name: 'haylaz-seo',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace('<!-- @seo -->', renderSeoTags())
          .replace('<!-- @noscript-menu -->', renderNoscriptMenu());
      },
    },
    async closeBundle() {
      try {
        await mkdir(outDir, { recursive: true });
        await writeFile(path.join(outDir, 'robots.txt'), renderRobotsTxt(), 'utf8');
        const sitemap = renderSitemapXml();
        if (sitemap) {
          await writeFile(path.join(outDir, 'sitemap.xml'), sitemap, 'utf8');
        } else {
          console.warn(
            '[haylaz-seo] sitemap.xml üretilmedi: src/data/site.ts içindeki "url" alanı boş.',
          );
        }
      } catch (error) {
        console.warn('[haylaz-seo] robots.txt / sitemap.xml yazılamadı:', error);
      }
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    ...(isDev ? [runtimeErrorOverlay()] : []),
    seoPlugin(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
