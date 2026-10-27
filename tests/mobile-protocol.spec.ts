import { describe, expect, it } from 'vitest'
import { parseMobileFrame } from '../src/client/mobile/protocol.ts'

const frame = { version: 1, id: 'host/session/message/fence', token: '0123456789abcdef0123456789abcdef', canAct: true, theme: 'dark', locale: 'zh', spec: { items: [{ type: 'text', text: 'hello' }] } }

describe('mobile renderer protocol', () => {
  it('accepts the full interactive document without native projection limits', () => {
    const result = parseMobileFrame({ ...frame, spec: { items: [
      { type: 'input', id: 'name', label: 'Name' },
      { type: 'button', label: 'Send', action: 'send' },
      { type: 'mermaid', code: 'graph TD; A-->B' },
    ] } })
    expect(result.spec.items.map(item => item.type)).toEqual(['input', 'button', 'mermaid'])
  })
  it('folds tabs by label and preserves the base panel title', () => {
    const tabs = (label: string, text: string) => ({ type: 'tabs', tabs: [{ label, items: [{ type: 'text', text }] }] })
    const result = parseMobileFrame({ ...frame, panels: [
      { panel: true, title: 'Dashboard', items: [tabs('A', 'first')] },
      { panel: true, append: true, items: [tabs('A', 'second')] },
      { panel: true, append: true, items: [tabs('B', 'third')] },
    ] })
    expect(result.spec.title).toBe('Dashboard')
    expect(result.spec.items[0]).toMatchObject({ type: 'tabs', tabs: [
      { label: 'A', items: [{ content: 'first' }, { content: 'second' }] }, { label: 'B', items: [{ content: 'third' }] },
    ] })
  })
  it('resets panel content on replacement', () => {
    expect(parseMobileFrame({ ...frame, panels: [frame.spec, { items: [{ type: 'text', text: 'new' }] }] }).spec.items).toMatchObject([{ content: 'new' }])
  })
  it.each([{ version: 2 }, { token: 'short' }, { canAct: 1 }, { locale: 'xx' }, { theme: 'system' }, { state: { fields: { x: 1 } } }, { state: { locked: 'yes' } }, { state: { multiAnswers: { a: 'one' } } }, { panels: [] }])('rejects invalid envelope %j', patch => {
    expect(() => parseMobileFrame({ ...frame, ...patch })).toThrow()
  })
  it('accepts durable state and bounds font scale', () => {
    const state = { fields: { a: 'draft' }, answers: { b: 'B' }, multiAnswers: { c: [] }, locked: true }
    expect(parseMobileFrame({ ...frame, state, textScale: 100 })).toMatchObject({ state, textScale: 2 })
  })
  it('rejects oversized frames before rendering', () => {
    expect(() => parseMobileFrame({ ...frame, padding: 'x'.repeat(2_000_000) })).toThrow()
  })
})
