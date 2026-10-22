import { useEffect, useState } from 'react'

import { MOBILE_QUERY } from '../design.js'

// Below the design system's mobile breakpoint the chat panel is full
// screen. The query comes from the same token as Tailwind's `sm:` prefix,
// so CSS and this hook always agree.

function matches() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_QUERY).matches
    : false
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(matches)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])

  return isMobile
}
