import { defineConfig } from 'vite'
import type { Plugin, Connect } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { ServerResponse } from 'node:http'

function yahooFinanceProxy(): Plugin {
  let cookie = '';
  let crumb = '';
  let lastAuth = 0;
  let authPromise: Promise<void> | null = null;
  const AUTH_TTL = 60 * 60 * 1000;
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  async function authenticate() {
    const cookieRes = await fetch('https://fc.yahoo.com/', {
      redirect: 'manual',
      headers: { 'User-Agent': UA },
    });
    const setCookies = cookieRes.headers.getSetCookie();
    cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { Cookie: cookie, 'User-Agent': UA },
    });
    if (!crumbRes.ok) throw new Error(`Crumb fetch failed: ${crumbRes.status}`);
    crumb = await crumbRes.text();
    lastAuth = Date.now();
  }

  async function ensureAuth() {
    if (crumb && Date.now() - lastAuth < AUTH_TTL) return;
    if (!authPromise) {
      authPromise = authenticate().finally(() => { authPromise = null; });
    }
    return authPromise;
  }

  async function proxyRequest(url: string): Promise<{ status: number; contentType: string; body: string }> {
    const sep = url.includes('?') ? '&' : '?';
    const target = `https://query2.finance.yahoo.com${url}${sep}crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(target, {
      headers: { Cookie: cookie, 'User-Agent': UA },
    });
    return {
      status: res.status,
      contentType: res.headers.get('Content-Type') ?? 'application/json',
      body: await res.text(),
    };
  }

  function sendJson(res: ServerResponse, status: number, contentType: string, body: string) {
    res.statusCode = status;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(body);
  }

  return {
    name: 'yahoo-finance-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yahoo', (async (
        req: Connect.IncomingMessage,
        res: ServerResponse,
      ) => {
        try {
          await ensureAuth();
          let result = await proxyRequest(req.url ?? '/');

          if (result.status === 401 || result.status === 403 || result.status === 429) {
            lastAuth = 0;
            await ensureAuth();
            result = await proxyRequest(req.url ?? '/');
          }

          sendJson(res, result.status, result.contentType, result.body);
        } catch (err) {
          console.error('Yahoo Finance proxy error:', err);
          sendJson(res, 502, 'application/json', JSON.stringify({ error: 'Proxy failed' }));
        }
      }) as Connect.NextHandleFunction);
    },
  };
}

const isTauriBuild = process.env.TAURI_ENV_PLATFORM != null || process.env.TAURI_BUILD === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    yahooFinanceProxy(),
    ...(isTauriBuild
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'Portfolio Tracker',
              short_name: 'Portfolio',
              description: 'Track your stock & ETF portfolio and research',
              theme_color: '#0f172a',
              background_color: '#0f172a',
              display: 'standalone',
              scope: '/',
              start_url: '/',
              icons: [
                {
                  src: '/favicon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
            },
          }),
        ]),
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: isTauriBuild ? 'localhost' : true,
  },
})
