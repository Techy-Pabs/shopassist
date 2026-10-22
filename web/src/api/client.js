// The one place the frontend talks to the ShopAssist API.
//
// Every call returns a result instead of throwing:
//   { ok: true, status, data }
//   { ok: false, kind, status, message, fieldErrors }
// where kind is one of:
//   "session-ended"  a call made with a token got 401: the session is over
//   "unauthorized"   a call made without a token got 401 (e.g. wrong password)
//   "validation"     422: fieldErrors maps each field to the server's message
//   "unavailable"    502: the assistant (or embedding service) didn't answer
//   "network"        no response at all (offline, server asleep, CORS, timeout)
//   "error"          any other failure, with the server's message

export const SESSION_ENDED_MESSAGE = 'Your session ended. Please sign in again.'
const NETWORK_MESSAGE = "We couldn't reach the assistant. Check your connection and try again."
const UNAVAILABLE_MESSAGE = 'The assistant is unavailable right now.'
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

// FastAPI's validation messages, made readable: "Value error, x" -> "X"
function cleanMessage(message) {
  const text = String(message ?? '').replace(/^Value error,\s*/, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// FastAPI 422 detail: [{ loc: ["body", "password"], msg: "..." }, ...]
function fieldErrorsFrom(detail) {
  if (!Array.isArray(detail)) return {}
  const errors = {}
  for (const item of detail) {
    const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : 'form'
    if (!errors[field]) errors[field] = cleanMessage(item.msg)
  }
  return errors
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function createApiClient({ baseUrl, getToken, onSessionEnded, fetchImpl = (...args) => fetch(...args) }) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '')

  async function request(method, path, { body, auth = true, signal } = {}) {
    const token = auth ? getToken() : null
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`

    let response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      return { ok: false, kind: 'network', status: 0, message: NETWORK_MESSAGE, fieldErrors: {}, aborted: error?.name === 'AbortError' }
    }

    const data = response.status === 204 ? null : await readJson(response)
    if (response.ok) return { ok: true, status: response.status, data }

    const detail = data?.detail
    const failure = { ok: false, status: response.status, fieldErrors: {} }

    if (response.status === 401) {
      // Only a call made WITH a token means the session ended. Without one
      // (signing in), 401 just means the email or password was wrong.
      if (token) {
        onSessionEnded?.()
        return { ...failure, kind: 'session-ended', message: SESSION_ENDED_MESSAGE }
      }
      return { ...failure, kind: 'unauthorized', message: typeof detail === 'string' ? detail : FALLBACK_MESSAGE }
    }
    if (response.status === 422) {
      const fieldErrors = fieldErrorsFrom(detail)
      return { ...failure, kind: 'validation', fieldErrors, message: Object.values(fieldErrors)[0] ?? FALLBACK_MESSAGE }
    }
    if (response.status === 502) {
      return { ...failure, kind: 'unavailable', message: typeof detail === 'string' ? detail : UNAVAILABLE_MESSAGE }
    }
    return { ...failure, kind: 'error', message: typeof detail === 'string' ? detail : FALLBACK_MESSAGE }
  }

  return {
    request,
    health: (options) => request('GET', '/health', { auth: false, ...options }),
    login: (email, password) => request('POST', '/auth/login', { auth: false, body: { email, password } }),
    register: (email, password) => request('POST', '/auth/register', { auth: false, body: { email, password } }),
    me: () => request('GET', '/auth/me'),
    // The customer's conversations, most recent activity first
    listConversations: ({ limit = 50 } = {}) => request('GET', `/conversations?limit=${limit}`),
    // The conversation is created lazily, on the customer's first message
    createConversation: () => request('POST', '/conversations', { body: {} }),
    listMessages: (conversationId) => request('GET', `/conversations/${conversationId}/messages`),
    sendMessage: (conversationId, content) =>
      request('POST', `/conversations/${conversationId}/messages`, { body: { content } }),
    // After a failed reply: answer the latest question again without saving
    // it twice. 409 means there was no unanswered question to retry.
    retryReply: (conversationId) => request('POST', `/conversations/${conversationId}/retry`),
  }
}

export const API_URL = import.meta.env.VITE_API_URL
