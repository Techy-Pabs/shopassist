import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

import { API_URL, SESSION_ENDED_MESSAGE, createApiClient } from '../api/client.js'

// The token lives in sessionStorage, so it's forgotten when the tab closes
const TOKEN_KEY = 'loomlane.token'

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null // storage can be blocked (private modes, strict settings)
  }
}

function storeToken(token) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Without storage the session still works until the page reloads
  }
}

const SessionContext = createContext(null)

export function SessionProvider({ children, apiUrl = API_URL, fetchImpl }) {
  const [token, setToken] = useState(readStoredToken)
  // Shown on the sign in screen after a session ends
  const [notice, setNotice] = useState(null)
  // The client reads the token through a ref, so it never sees a stale one
  const tokenRef = useRef(token)
  tokenRef.current = token

  const signOut = useCallback((reason = null) => {
    storeToken(null)
    tokenRef.current = null
    setToken(null)
    setNotice(reason)
  }, [])

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: () => tokenRef.current,
        onSessionEnded: () => signOut(SESSION_ENDED_MESSAGE),
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
    [apiUrl, fetchImpl, signOut],
  )

  const signIn = useCallback((newToken) => {
    storeToken(newToken)
    tokenRef.current = newToken
    setToken(newToken)
    setNotice(null)
  }, [])

  const value = useMemo(
    () => ({ api, token, isSignedIn: Boolean(token), notice, signIn, signOut: () => signOut(null) }),
    [api, token, notice, signIn, signOut],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside a SessionProvider')
  return session
}
