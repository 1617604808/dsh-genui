import type { GenuiNode, GenuiSpec } from '../client/spec.ts'

/** A read-only native projection. The original GenUI spec remains authoritative. */
type View = { type: string; [key: string]: unknown }

const text = (value: string): View => ({ type: 'text', text: value })
const tone = (value: string | undefined): string | undefined =>
  ({ success: 'good', warning: 'warn', error: 'bad', danger: 'bad' } as Record<string, string>)[value ?? ''] ?? value

function children(items: GenuiNode[]): View[] | null {
  const views: View[] = []
  for (const item of items) {
    const view = node(item)
    if (view === null) return null
    views.push(view)
  }
  return views
}

function node(item: GenuiNode): View | null {
  switch (item.type) {
    case 'row': case 'col': case 'grid': case 'card': {
      const views = children(item.items)
      if (views === null) return null
      if (item.type === 'card') {
        if (item.title) views.unshift(text(item.title))
        if (item.eyebrow) views.unshift(text(item.eyebrow))
      }
      return { type: item.type === 'row' || item.type === 'grid' ? 'row' : 'stack', children: views }
    }
    case 'text': return { ...text(item.content), ...(item.size === 'muted' || item.size === 'caption' ? { tone: 'muted' } : {}) }
    case 'stat':
      // Sparklines carry data: do not silently drop them in the native projection.
      if (item.spark) return null
      return { type: 'metric', label: item.label, value: item.value, ...(item.delta ? { caption: item.delta } : {}) }
    case 'hero': {
      if (item.spark) return null
      const parts = [text(item.title)]
      if (item.value) parts.push({ type: 'metric', label: item.label ?? item.title, value: item.value, ...(item.delta ? { caption: item.delta } : {}) })
      else if (item.delta || item.label) parts.push(text([item.label, item.delta].filter(Boolean).join(' · ')))
      if (item.subtitle) parts.push(text(item.subtitle))
      return { type: 'stack', children: parts }
    }
    case 'badge': return text(item.label)
    case 'divider': return text(item.label ?? '—')
    case 'spacer': return text('')
    case 'callout': return {
      type: 'callout', text: [item.title, item.content].filter(Boolean).join('\n'),
      tone: tone(item.tone) ?? 'info',
    }
    case 'progress':
      if (item.target !== undefined) return null
      return { type: 'progress', value: item.value, ...(item.label ? { label: item.label } : {}), ...(item.valueLabel ? { caption: item.valueLabel } : {}) }
    case 'steps': return { type: 'steps', items: item.steps.map((step, index) => ({
      label: step.title, status: index < (item.current ?? item.steps.length) ? 'done' : index === (item.current ?? item.steps.length) ? 'current' : 'todo',
      ...(step.desc ? { detail: step.desc } : {}),
    })) }
    case 'keyvalue': return { type: 'keyValue', items: item.pairs.map(pair => [pair.key, pair.value]) }
    case 'table':
      if (item.filter || item.sortField || item.details || item.total || item.types?.some(type => !['text', 'num'].includes(type))) return null
      if (item.rows.some(row => row.some(cell => typeof cell !== 'string' && typeof cell !== 'number'))) return null
      return { type: 'table', columns: item.columns, rows: item.rows }
    case 'chart': {
      if (item.filter || item.stacked) return null
      const series = item.series?.length ? item.series : [{ label: '', data: item.data }]
      const categories = [...new Set(series.flatMap(series => series.data.map(point => point.label)))]
      // Duplicate labels cannot be aligned unambiguously across series.
      if (series.some(series => new Set(series.data.map(point => point.label)).size !== series.data.length)) return null
      if (series.some(series => series.data.some(point => point.value !== null && typeof point.value !== 'number'))) return null
      if (item.kind === 'donut' && series.length > 1) return null
      return {
        type: 'chart', kind: item.kind === 'line' || item.kind === 'donut' ? item.kind : item.horizontal ? 'hbar' : 'bar',
        categories, series: series.map(series => ({ name: series.label, values: categories.map(label => series.data.find(point => point.label === label)?.value ?? null) })),
      }
    }
    // No fake controls, flattened tabs, static quizzes or partial advanced charts.
    default: return null
  }
}

/** Check native limits before emitting a card, rather than letting the host truncate it. */
function fits(view: View): boolean {
  let count = 0
  const visit = (value: View, depth: number): boolean => {
    if (++count > 40 || depth > 6) return false
    for (const [key, field] of Object.entries(value)) {
      if (typeof field === 'string' && field.length > (key === 'text' ? 2000 : key === 'title' ? 80 : 200)) return false
    }
    if (value.type === 'stack' || value.type === 'row') {
      const parts = value.children as View[]
      if (!parts.length || parts.length > 16 || !parts.every(part => visit(part, depth + 1))) return false
    }
    if (value.type === 'chart') {
      const categories = value.categories as string[]
      const series = value.series as { name: string; values: unknown[] }[]
      if (categories.length > 60 || categories.some(label => label.length > 200) || series.length > 6 || series.some(row => row.name.length > 200)) return false
    }
    if (value.type === 'table') {
      const columns = value.columns as string[]
      const rows = value.rows as unknown[][]
      if (columns.length > 8 || columns.some(label => label.length > 200) || rows.length > 50 || rows.some(row => row.length !== columns.length || row.some(cell => String(cell).length > 200))) return false
    }
    if (value.type === 'steps') {
      const items = value.items as { label: string; detail?: string }[]
      if (items.length > 12 || items.some(item => item.label.length > 200 || (item.detail?.length ?? 0) > 200)) return false
    }
    if (value.type === 'keyValue') {
      const items = value.items as string[][]
      if (items.length > 24 || items.some(pair => pair.some(field => field.length > 200))) return false
    }
    return true
  }
  return visit(view, 1) && new TextEncoder().encode(JSON.stringify(view)).length <= 8 * 1024
}

/** Null means the complete card needs the web renderer; never emit a partial native card. */
export function toDshGoView(spec: GenuiSpec): View | null {
  try {
    if (spec.computed?.length || spec.panel || spec.append) return null
    const views = children(spec.items)
    if (views === null || views.length === 0) return null
    const view: View = { type: 'stack', ...(spec.title ? { title: spec.title } : {}), children: views }
    return fits(view) ? view : null
  } catch {
    // Presentation metadata must never turn a successful tool call into a failure.
    return null
  }
}
