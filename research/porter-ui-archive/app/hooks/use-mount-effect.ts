import { useEffect } from "react"

/**
 * Run an effect exactly once on mount, with optional cleanup on unmount.
 * This is the ONLY place useEffect is allowed in the Porter codebase.
 * All other patterns use derived state, event handlers, or React Query.
 */
// eslint-disable-next-line react-hooks/exhaustive-deps
export function useMountEffect(effect: () => void | (() => void)) {
  useEffect(effect, [])
}
