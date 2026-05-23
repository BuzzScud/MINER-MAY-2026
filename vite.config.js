import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : '/trading/dist/',  // root in dev, subdirectory in production
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    modulePreload: false,
    rollupOptions: {
      output: {
        // Bundle all vendor code together to avoid React hooks loading issues
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Keep preline separate (it's loaded dynamically)
            if (id.includes('preline')) {
              return 'preline';
            }
            // Bundle all other dependencies together
            return 'vendor';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://s3.tradingview.com https://www.tradingview.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: blob: https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://finnhub.io https://api.massive.com https://corsproxy.io https://thingproxy.freeboard.io https://cors-anywhere.herokuapp.com https://*.tradingview.com https://cdn.jsdelivr.net; frame-src https://www.tradingview.com https://s.tradingview.com https://s3.tradingview.com https://www.tradingview-widget.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self';",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    },
    proxy: {
      '/api/predict': { target: 'http://localhost:4000', changeOrigin: true },
      '/api/market-data': { target: 'http://localhost:4000', changeOrigin: true },
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        secure: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      '/api/quote': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => {
          const match = path.match(/^\/api\/quote\/([^?]+)(\?.*)?$/);
          if (match) {
            const rawSymbol = match[1];
            const decodedSymbol = decodeURIComponent(rawSymbol);
            // Normalize exchange-form symbols (e.g. NQH27:CME) to Yahoo format (NQH27.CME)
            const normalizedSymbol = decodedSymbol.replace(/:/g, '.');
            const queryParams = new URLSearchParams(match[2]?.substring(1) || '');
            const period = queryParams.get('period') || '1d';
            const periodMap = {
              'ytd': { range: 'ytd', interval: '1d' },
              '1d': { range: '1d', interval: '5m' },
              '5d': { range: '5d', interval: '15m' },
              '1mo': { range: '1mo', interval: '1d' },
              '3mo': { range: '3mo', interval: '1d' },
              '6mo': { range: '6mo', interval: '1d' },
              '1y': { range: '1y', interval: '1wk' },
            };
            const { range, interval } = periodMap[period] || periodMap['1d'];
            return `/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?interval=${interval}&range=${range}`;
          }
          return path;
        },
        secure: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      },
      '/api/auth': { target: 'http://localhost:4000', changeOrigin: true },
      '/api/data': { target: 'http://localhost:4000', changeOrigin: true },
      '/api/admin': { target: 'http://localhost:4000', changeOrigin: true },
      '/api/settings': { target: 'http://localhost:4000', changeOrigin: true },
      '/api/miner': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: false,
      },
      // QuantBot trading bot backend (Flask-SocketIO on port 8080)
      '/socket.io': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
        ws: true,
      },
      '/api/state': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/prices': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/mode': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/bot': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/symbols': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/timeframe': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/feed': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/strategies': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/strategy': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/broker': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/backtest': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    exclude: ['**/node_modules/**', '**/backend/**'],
  },
}))
