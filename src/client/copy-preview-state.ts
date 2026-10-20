import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import type { GenuiCopy, GenuiSpec } from './spec.ts'
import { walkGenuiNodes } from './walk-spec.ts'

interface CopyPreviewState {
  readonly paths: ReadonlyMap<GenuiCopy, string>
  readonly expanded: ReadonlySet<string>
  readonly toggle: (path: string) => void
}

export const CopyPreviewContext = createContext<CopyPreviewState | undefined>(undefined)

/** Reply-local state, including temporarily unmounted tab/accordion children.
 * GenuiBlock's existing identity owns its lifetime; nothing is persisted. */
export function useCopyPreviewState(spec: GenuiSpec): CopyPreviewState {
  const paths = useMemo(() => {
    const result = new Map<GenuiCopy, string>()
    walkGenuiNodes(spec, (node, path) => {
      if (node.type === 'copy' && node.expandable === true) result.set(node, path)
    })
    return result
  }, [spec])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  // A removed/disabled node must not leave state for a later replacement.
  useEffect(() => {
    const available = new Set(paths.values())
    setExpanded(previous => {
      const next = new Set([...previous].filter(path => available.has(path)))
      return next.size === previous.size ? previous : next
    })
  }, [paths])
  const toggle = useCallback((path: string) => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])
  return useMemo(() => ({ paths, expanded, toggle }), [paths, expanded, toggle])
}
