import { countGenuiNodes, processGenuiSpec } from '../guard.ts'
import { mergePanelSpecs, PANEL_LIMITS } from '../panel-store.ts'
import type { BlockInteractionState } from '../interaction-store.ts'
import type { GenuiSpec } from '../spec.ts'

/** Host-owned identity and state. No host credentials or executable content. */
export interface MobileFrame {
  version: 1
  id: string
  token: string
  spec: GenuiSpec
  state?: BlockInteractionState
  theme: 'light' | 'dark'
  locale: 'zh' | 'en'
  canAct: boolean
  canOpenFiles: boolean
  textScale: number
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reuse the renderer guard for every source, including merged panel deltas. */
export function parseMobileFrame(raw: unknown): MobileFrame {
  if (!record(raw) || raw.version !== 1 || typeof raw.id !== 'string' || raw.id.length > 256
    || typeof raw.token !== 'string' || raw.token.length < 16 || raw.token.length > 128
    || !['light', 'dark'].includes(String(raw.theme)) || !['zh', 'en'].includes(String(raw.locale))
    || typeof raw.canAct !== 'boolean' || JSON.stringify(raw).length > 2_000_000) throw new Error('invalid mobile frame')
  let spec: GenuiSpec | null = null
  const sources = Array.isArray(raw.panels) ? raw.panels : [raw.spec]
  if (sources.length === 0 || sources.length > PANEL_LIMITS.maxAppends + 1) throw new Error('invalid panel history')
  for (const source of sources) {
    if (!record(source)) throw new Error('invalid GenUI document')
    const candidate = Array.isArray(raw.panels) && source.append === true
      ? mergePanelSpecs(spec, source as unknown as GenuiSpec) : source
    const result = processGenuiSpec(candidate)
    if (result.spec === null || result.errors.length > 0) throw new Error(result.errors.join('; ') || 'invalid GenUI document')
    if (Array.isArray(raw.panels) && countGenuiNodes(candidate as GenuiSpec) > PANEL_LIMITS.maxNodes) throw new Error('panel node budget exceeded')
    spec = result.spec
  }
  if (spec === null) throw new Error('empty GenUI document')
  const state = raw.state
  if (state !== undefined && (!record(state)
    || (state.locked !== undefined && typeof state.locked !== 'boolean')
    || ['answers', 'fields'].some(key => state[key] !== undefined && (!record(state[key]) || !Object.values(state[key]).every(v => typeof v === 'string')))
    || (state.multiAnswers !== undefined && (!record(state.multiAnswers) || !Object.values(state.multiAnswers).every(v => Array.isArray(v) && v.every(s => typeof s === 'string')))))) throw new Error('invalid interaction state')
  return {
    version: 1, id: raw.id, token: raw.token, spec,
    ...(state === undefined ? {} : { state: state as BlockInteractionState }),
    theme: raw.theme as MobileFrame['theme'], locale: raw.locale as MobileFrame['locale'], canAct: raw.canAct, canOpenFiles: raw.canOpenFiles === true,
    textScale: typeof raw.textScale === 'number' && Number.isFinite(raw.textScale) ? Math.max(0.8, Math.min(2, raw.textScale)) : 1,
  }
}
