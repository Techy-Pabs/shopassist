import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { API_URL, SESSION_ENDED_MESSAGE, createApiClient } from '../api/client.js'

// The same approach as the chat's token (sessionStorage, forgotten when the
// tab closes), under its own key: signing in to the chat never signs anyone
// in to the dashboard, or the other way round.
export const ADMIN_TOKEN_KEY = 'shopassist.adminToken'

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY)
  } catch {
    return null // storage can be blocked (private modes, strict settings)
  }
}

function storeToken(token) {
  try {
    if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
    else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // Without storage the session still works until the page reloads
  }
}

// status: "signed-out", "checking" (asking /auth/me who this is),
// "admin", "not-admin" (a customer), or "unreachable" (no answer)
const AdminSessionContext = createContext(null)

export function AdminSessionProvider({ children, apiUrl = API_URL, fetchImpl }) {
  const [token, setToken] = useState(readStoredToken)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(token ? 'checking' : 'signed-out')
  // Shown on the sign in screen after a session ends
  const [notice, setNotice] = useState(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const signOut = useCallback((reason = null) => {
    storeToken(null)
    tokenRef.current = null
    setToken(null)
    setUser(null)
    setStatus('signed-out')
    setNotice(reason)
  }, [])

  // This frontend check is only for a good experience. The backend is the
  // real gate: every admin endpoint rejects anyone who isn't an admin.
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: () => tokenRef.current,
        // A 401 anywhere (an expired or revoked token) returns to sign in
        onSessionEnded: () => signOut(SESSION_ENDED_MESSAGE),
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
    [apiUrl, fetchImpl, signOut],
  )

  const checkAccount = useCallback(async () => {
    setStatus('checking')
    const result = await api.me()
    if (result.ok) {
      setUser(result.data)
      setStatus(result.data.role === 'admin' ? 'admin' : 'not-admin')
    } else if (result.kind !== 'session-ended') {
      setStatus('unreachable')
    }
  }, [api])

  useEffect(() => {
    if (token) checkAccount()
  }, [token, checkAccount])

  // Returns the failed result (for the form to show), or null on success
  const signIn = useCallback(
    async (email, password) => {
      const result = await api.login(email, password)
      if (!result.ok) return result
      storeToken(result.data.access_token)
      tokenRef.current = result.data.access_token
      setNotice(null)
      setToken(result.data.access_token)
      return null
    },
    [api],
  )

  const value = useMemo(
    () => ({ api, user, status, notice, signIn, signOut: () => signOut(null), retry: checkAccount }),
    [api, user, status, notice, signIn, signOut, checkAccount],
  )
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
}

export function useAdminSession() {
  const session = useContext(AdminSessionContext)
  if (!session) throw new Error('useAdminSession must be used inside AdminSessionProvider')
  return session
}
