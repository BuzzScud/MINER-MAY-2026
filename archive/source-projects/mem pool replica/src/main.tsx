import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<div style="min-height:100vh;background:#0d1117;color:#e5e7eb;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;">Root element missing.</div>'
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorFallback>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ErrorFallback>
      </StrictMode>,
    )
  } catch (err) {
    rootEl.innerHTML = `<div style="min-height:100vh;background:#0d1117;color:#e5e7eb;padding:2rem;font-family:system-ui,sans-serif;"><h1 style="font-size:1.25rem;">Failed to start app</h1><p style="color:#9ca3af;">${err instanceof Error ? err.message : String(err)}</p><p style="font-size:0.875rem;color:#6b7280;">Check the browser console (F12).</p></div>`
  }
}
