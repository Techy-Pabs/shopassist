import { useEffect, useState } from 'react'

import { loadConversationId } from '../lib/conversationStore.js'
import { useSession } from './SessionContext.jsx'

// Whether opening the chat will really show a greeting, so the chat button's
// "1" badge is honest:
// - a conversation from earlier in the tab: no, the chat resumes it
// - signed in, or a guest already: yes, the welcome greets them
// - nobody yet: only once the API says guest chat is on (GET /auth/guest),
//   and not after starting a guest has failed. Off, asleep or unreachable:
//   no badge (the note still shows; signing in is always possible).
export function useGreetingWaiting() {
  const { api, token, guest } = useSession()
  const [guestChatOn, setGuestChatOn] = useState(null)
  const resuming = Boolean(loadConversationId())

  useEffect(() => {
    if (token || resuming) return undefined
    let cancelled = false
    api.guestChatStatus().then((result) => {
      if (!cancelled) setGuestChatOn(result.ok && result.data?.enabled === true)
    })
    return () => {
      cancelled = true
    }
  }, [api, token, resuming])

  if (resuming) return false
  if (token) return true
  return guestChatOn === true && !guest.unavailable
}
