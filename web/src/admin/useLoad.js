import { useCallback, useEffect, useState } from 'react'

import { useAdminSession } from './session.jsx'

// The plain words for "the server didn't answer"
export const NO_ANSWER = "ShopAssist didn't answer. It may be waking up after a quiet spell, so try again in a moment."

// Loads a path from the API, again whenever it changes. Moving on cancels the
// request before, and a reply that still arrives for it is ignored, so an
// older reply never replaces a newer one. With no path, nothing loads.
//
// status: "idle", "loading", "ready" (with data) or "error" (with message,
// and the HTTP status: 404 is "not found"). retry() loads again from the
// loading state; refresh() loads again quietly, keeping what's showing.
export function useLoad(path) {
  const { api } = useAdminSession()
  const [state, setState] = useState({ status: path ? 'loading' : 'idle', path })
  const [attempt, setAttempt] = useState({ n: 0, quiet: false })

  useEffect(() => {
    if (!path) {
      setState({ status: 'idle', path })
      return undefined
    }
    const controller = new AbortController()
    // A quiet refresh of the same path keeps what's showing
    setState((current) => (attempt.quiet && current.path === path && current.status === 'ready' ? current : { status: 'loading', path }))
    api.request('GET', path, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setState({ status: 'ready', path, data: result.data })
      // A 401 already returns to sign in
      else if (result.kind !== 'session-ended') {
        setState({ status: 'error', path, httpStatus: result.status, message: result.kind === 'network' ? NO_ANSWER : result.message })
      }
    })
    return () => controller.abort()
  }, [api, path, attempt])

  const retry = useCallback(() => setAttempt((a) => ({ n: a.n + 1, quiet: false })), [])
  const refresh = useCallback(() => setAttempt((a) => ({ n: a.n + 1, quiet: true })), [])
  // Show data the page already fetched itself (for the same path)
  const replace = useCallback((data) => setState((current) => ({ ...current, status: 'ready', data })), [])
  return { ...state, retry, refresh, replace }
}
