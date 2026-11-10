import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

import { API_URL, SESSION_ENDED_MESSAGE, createApiClient } from '../api/client.js'
import { saveConversationId } from '../lib/conversationStore.js'

// The token lives in sessionStorage, so it's forgotten when the tab closes.
// A guest's token is stored the same way, marked as a guest's, so signing in
// replaces it cleanly.
const TOKEN_KEY = 'loomlane.token'
const GUEST_KEY = 'loomlane.guest'

// Shown at the top of a new guest chat when the earlier one's token expired
export const GUEST_ENDED_MESSAGE = 'Your earlier chat has ended, so this is a new one.'

function read(key) {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null // storage can be blocked (private modes, strict settings)
  }
}

function storeToken(token, guest = false) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_KEY)
    if (token && guest) window.sessionStorage.setItem(GUEST_KEY, '1')
    else window.sessionStorage.removeItem(GUEST_KEY)
  } catch {
    // Without storage the session still works until the page reloads
  }
}

// A guest's allowance, from GET /auth/me. limit is set when the API refuses
// a question: "guest_limit_reached" or "guest_daily_limit_reached".
const NO_USAGE = { questionsLeft: null, questionLimit: null, limit: null }

const SessionContext = createContext(null)

export function SessionProvider({ children, apiUrl = API_URL, fetchImpl }) {
  const [token, setToken] = useState(() => read(TOKEN_KEY))
  const [isGuest, setIsGuest] = useState(() => Boolean(read(TOKEN_KEY)) && read(GUEST_KEY) === '1')
  // Shown on the sign in screen after a session ends
  const [notice, setNotice] = useState(null)
  // Shown in a new guest chat after the earlier one's token expired
  const [guestNotice, setGuestNotice] = useState(null)
  const [usage, setUsage] = useState(NO_USAGE)
  // Guest chat is off, or starting a guest failed: the chat asks to sign in
  // instead, as it did before guests (until the page reloads)
  const [guestUnavailable, setGuestUnavailable] = useState(false)
  // A message that couldn't be sent because the session ended: it goes back
  // into the input after signing in again
  const [draft, setDraft] = useState('')
  // The client reads the token through a ref, so it never sees a stale one
  const tokenRef = useRef(token)
  tokenRef.current = token
  const guestRef = useRef(isGuest)
  guestRef.current = isGuest

  const signOut = useCallback((reason = null) => {
    storeToken(null)
    tokenRef.current = null
    guestRef.current = false
    setToken(null)
    setIsGuest(false)
    setUsage(NO_USAGE)
    setNotice(reason)
  }, [])

  // A guest's token has expired: its chat is gone, so start again quietly as
  // a new guest (the panel does that when it has no token), with a note
  const guestEnded = useCallback(() => {
    saveConversationId(null)
    signOut(null)
    setGuestNotice(GUEST_ENDED_MESSAGE)
  }, [signOut])

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: () => tokenRef.current,
        // Only the current token's 401 ends the session. Two requests made
        // with an expired token can both come back 401; the second must not
        // treat the new state (a guest that just ended) as an account's.
        onSessionEnded: (usedToken) => {
          if (usedToken !== tokenRef.current) return
          if (guestRef.current) guestEnded()
          else signOut(SESSION_ENDED_MESSAGE)
        },
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
    [apiUrl, fetchImpl, signOut, guestEnded],
  )

  // What GET /auth/me says about a guest's questions
  const refreshUsage = useCallback(async () => {
    if (!guestRef.current) return
    const result = await api.me()
    if (result.ok && result.data.is_guest) {
      setUsage((current) => ({
        questionsLeft: result.data.questions_left,
        questionLimit: result.data.question_limit,
        // Out of questions is lasting; the daily limit is only known from a refusal
        limit: result.data.questions_left === 0 ? 'guest_limit_reached' : current.limit,
      }))
    }
  }, [api])

  const signIn = useCallback((newToken) => {
    // Signing in replaces a guest: the account starts a fresh chat (the
    // guest's chat isn't moved to the account)
    if (guestRef.current) saveConversationId(null)
    storeToken(newToken)
    tokenRef.current = newToken
    guestRef.current = false
    setToken(newToken)
    setIsGuest(false)
    setUsage(NO_USAGE)
    setNotice(null)
    setGuestNotice(null)
  }, [])

  // POST /auth/guest. true when the guest's chat can start; false means
  // fall back to signing in (guest chat off, or the request failed).
  const startGuest = useCallback(async () => {
    const result = await api.createGuest()
    if (!result.ok) {
      setGuestUnavailable(true)
      return false
    }
    storeToken(result.data.access_token, true)
    tokenRef.current = result.data.access_token
    guestRef.current = true
    saveConversationId(null)
    setToken(result.data.access_token)
    setIsGuest(true)
    await refreshUsage()
    return true
  }, [api, refreshUsage])

  // The API refused a guest's question
  const reachGuestLimit = useCallback((code) => {
    setUsage((current) => ({ ...current, limit: code, questionsLeft: code === 'guest_limit_reached' ? 0 : current.questionsLeft }))
  }, [])

  // Guest chat was turned off while a guest was chatting: sign in instead
  const guestChatOff = useCallback(() => {
    saveConversationId(null)
    setGuestUnavailable(true)
    signOut(null)
  }, [signOut])

  const value = useMemo(
    () => ({
      api, token, isSignedIn: Boolean(token), isGuest, hasAccount: Boolean(token) && !isGuest,
      notice, signIn, draft, setDraft,
      guest: { ...usage, notice: guestNotice, unavailable: guestUnavailable },
      startGuest, refreshUsage, reachGuestLimit, guestChatOff,
      // Signing out on purpose also forgets this tab's conversation and any
      // unsent text, so the next person to sign in starts fresh
      signOut: () => {
        saveConversationId(null)
        setDraft('')
        signOut(null)
      },
    }),
    [api, token, isGuest, notice, signIn, signOut, draft, usage, guestNotice, guestUnavailable, startGuest, refreshUsage,
      reachGuestLimit, guestChatOff],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside a SessionProvider')
  return session
}
