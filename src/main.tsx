import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Flex gap 行为检测：Android 8.1 出场 Chrome / WebView 61 不支持 flexbox 的 gap，
// 需启用 margin 基线回退（见 index.css 末尾 `html:not(.supports-flex-gap)` 规则块）。
// 只做一次真实布局测量，不能仅凭 CSS.supports('gap') 判断（语法支持 ≠ flex gap 生效）。
function detectFlexGap() {
  // 防御：若脚本在 <head> 内被提前执行，document.body 尚为 null，直接跳过测量
  //（真正的布局兼容性由 postbuild 将 script 移到 </body> 之前来保证）
  if (!document.body) return
  const flex = document.createElement('div')
  flex.style.position = 'absolute'
  flex.style.visibility = 'hidden'
  flex.style.display = 'flex'
  flex.style.flexDirection = 'column'
  flex.style.rowGap = '1px'
  flex.appendChild(document.createElement('div'))
  flex.appendChild(document.createElement('div'))
  document.body.appendChild(flex)
  const supported = flex.scrollHeight === 1
  if (flex.parentNode) flex.parentNode.removeChild(flex)
  if (supported) document.documentElement.classList.add('supports-flex-gap')
}
detectFlexGap()

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
