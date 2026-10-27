import { createRoot, type Root } from 'react-dom/client'
import { GenuiBlock } from '../GenuiBlock.tsx'
import { GenuiActionContext } from '../action-context.ts'
import { ErrorBoundary } from '../ErrorBoundary.tsx'
import { setGenuiAssetBase } from '../asset-loader.ts'
import { STANDALONE_THEME_CSS } from '../artifact/standalone-theme.ts'
import { setLocale } from '../i18n/runtime.ts'
import { parseMobileFrame, type MobileFrame } from './protocol.ts'
import { withNativeFileLinkContext } from '../file-link-context.tsx'
import '../standalone/katex-style.ts'

declare global {
  interface Window {
    GenuiNative?: { postMessage(message: string): void }
    __GenuiMobile__?: { render(raw: unknown): void; dispose(): void; pause(paused: boolean): void; reply(raw: unknown): void }
    __GenuiNativeClipboard__?: (text: string) => Promise<boolean>
  }
}

const style = document.createElement('style')
style.textContent = STANDALONE_THEME_CSS + '\nhtml,body{min-height:0;background:transparent}#genui-root{width:100%;padding:0;margin:0;display:flow-root}*{box-sizing:border-box}body[data-paused]{visibility:hidden}'
document.head.append(style)
setGenuiAssetBase(new URL('.', document.baseURI).href)
const element = document.getElementById('genui-root')!
let root: Root | undefined
let current: MobileFrame | undefined
let observer: ResizeObserver | undefined
let paused = false
let lastHeight = 0
let sequence = 0
const replies = new Map<number, (ok: boolean) => void>()
window.__GenuiNativeClipboard__ = text => new Promise(resolve => {
  const frame = current
  if (frame === undefined || text.length > 100_000) { resolve(false); return }
  const request = ++sequence
  const timeout = window.setTimeout(() => { replies.delete(request); resolve(false) }, 4000)
  replies.set(request, ok => { clearTimeout(timeout); replies.delete(request); resolve(ok) })
  post(frame, 'clipboard', { text, request })
})

function post(frame: MobileFrame, type: string, data: Record<string, unknown> = {}): void {
  if (current?.id !== frame.id || current.token !== frame.token) return
  const message = JSON.stringify({ version: 1, id: frame.id, token: frame.token, type, ...data })
  if (message.length <= 262_144) window.GenuiNative?.postMessage(message)
}

function measure(): void {
  if (current === undefined || paused) return
  const height = Math.ceil(element.getBoundingClientRect().height)
  if (height !== lastHeight && height > 0) {
    lastHeight = height
    post(current, 'height', { height })
  }
}

function render(raw: unknown): void {
  try {
    const frame = parseMobileFrame(raw)
    current = frame
    setLocale(frame.locale)
    document.documentElement.lang = frame.locale
    document.body.toggleAttribute('data-ds-dark-theme', frame.theme === 'dark')
    document.documentElement.style.fontSize = `${16 * frame.textScale}px`
    document.documentElement.style.setProperty('--dsh-content-font-size', `${17 * frame.textScale}px`)
    root ??= createRoot(element)
    observer ??= new ResizeObserver(measure)
    observer.observe(element)
    root.render(<GenuiActionContext.Provider value={frame.canAct && !paused ? (action, payload) => {
      if (current?.canAct && !paused) post(frame, 'action', { action, payload })
    } : undefined}>
      {withNativeFileLinkContext(frame.canOpenFiles ? (path, line) => post(frame, 'file', { path, line }) : undefined, <ErrorBoundary key={frame.id} label="GenUI">
        <GenuiBlock spec={frame.spec} stateKey={frame.id} initialState={frame.state}
          onStateChange={state => post(frame, 'state', { state })} animateEntrance={false} />
      </ErrorBoundary>)}
    </GenuiActionContext.Provider>)
    post(frame, 'ready')
  } catch (error) {
    // Retain the envelope identity solely to report the failed render to its owner.
    const frame = raw as MobileFrame
    if (frame?.version === 1 && typeof frame.id === 'string' && typeof frame.token === 'string') {
      current = frame
      post(frame, 'error', { message: error instanceof Error ? error.message : 'GenUI could not start' })
    }
  }
}

document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  if (link === null) return
  event.preventDefault()
  const href = link.getAttribute('href') ?? ''
  if (href.startsWith('#')) { document.getElementById(href.slice(1))?.scrollIntoView(); return }
  if (event.isTrusted && current !== undefined && /^(https?:\/\/|mailto:)/i.test(href)) post(current, 'link', { url: href })
}, true)

window.__GenuiMobile__ = {
  render,
  reply(raw) {
    if (typeof raw !== 'object' || raw === null) return
    const response = raw as Record<string, unknown>
    if (response.id === current?.id && response.token === current?.token && typeof response.request === 'number') replies.get(response.request)?.(response.ok === true)
  },
  pause(value) {
    paused = value
    document.body.toggleAttribute('data-paused', paused)
    document.querySelectorAll('audio,video').forEach(media => { if (media instanceof HTMLMediaElement && paused) media.pause() })
    if (!paused) measure()
  },
  dispose() {
    root?.unmount()
    root = undefined
    observer?.disconnect()
    observer = undefined
    current = undefined
    for (const resolve of replies.values()) resolve(false)
  },
}
