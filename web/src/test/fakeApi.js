import { vi } from 'vitest'

// Guest chat turned off: what POST /auth/guest answers unless a test says
// otherwise, so opening the chat signed out shows sign in, as before guests
export const GUEST_CHAT_OFF = {
  status: 403, body: { detail: 'Guest chat is turned off. Sign in or create an account to chat.', code: 'guest_chat_disabled' },
}

// A fake fetch for the API: routes map "METHOD /path" to a reply
// { status, body, headers }, or a function (init, url) => reply. Throwing
// simulates a network failure. Every call is recorded in fetch.mock.calls.
export function fakeFetch(routes) {
  // The API is awake, and guest chat is off, unless a test says otherwise
  const all = {
    'GET /health': { status: 200, body: { status: 'ok', service: 'shopassist' } },
    'GET /auth/guest': { status: 200, body: { enabled: false } },
    'POST /auth/guest': GUEST_CHAT_OFF,
    ...routes,
  }
  return vi.fn(async (url, init = {}) => {
    const path = new URL(url).pathname
    const handler = all[`${init.method ?? 'GET'} ${path}`]
    if (!handler) throw new Error(`No fake reply for ${init.method} ${path}`)
    // A reply can be a promise, to hold a response open (see deferred())
    const reply = await (typeof handler === 'function' ? handler(init, new URL(url)) : handler)
    if (reply instanceof Error) throw reply
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      headers: { get: (name) => Object.entries(reply.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null },
      json: async () => reply.body,
    }
  })
}

export const callsTo = (fetch, method, path) =>
  fetch.mock.calls.filter(([url, init]) => new URL(url).pathname === path && init.method === method)

export const authHeader = (call) => call[1].headers.Authorization

// A reply the test resolves when it chooses: d.resolve({ status, body })
export function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
