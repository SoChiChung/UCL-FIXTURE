import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 诊断期：把任何未捕获错误渲染到 #root，便于排查空白页
function showError(label: string, err: unknown) {
  const root = document.getElementById('root')
  if (!root) return
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  root.innerHTML = `<pre style="color:#d9534f;background:#fff5f5;padding:20px;margin:0;white-space:pre-wrap;font:13px/1.5 monospace;border:2px solid #d9534f;">[${label}] ${msg}</pre>`
}

window.addEventListener('error', (e) => showError('window.error', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => showError('unhandledrejection', e.reason))

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  showError('render', e)
}
