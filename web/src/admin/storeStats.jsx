import { createContext, useContext, useMemo } from 'react'

import { useLoad } from './useLoad.js'

// What every admin page shares from /admin/stats: how many conversations
// need attention (the sidebar badge) and the store's time zone, which the
// API sets (STORE_TIMEZONE). refresh() after something changes them, such
// as resolving a conversation.
const StoreStatsContext = createContext(null)

export function StoreStatsProvider({ children }) {
  const stats = useLoad('/admin/stats')
  const { data, refresh } = stats
  const value = useMemo(
    () => ({ attention: data?.needs_attention.total ?? null, timeZone: data?.time_zone ?? null, refresh }),
    [data, refresh],
  )
  return <StoreStatsContext.Provider value={value}>{children}</StoreStatsContext.Provider>
}

export function useStoreStats() {
  const stats = useContext(StoreStatsContext)
  if (!stats) throw new Error('useStoreStats must be used inside StoreStatsProvider')
  return stats
}
