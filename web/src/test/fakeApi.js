import { vi } from 'vitest'

// A fake fetch for the API: routes map "METHOD /path" to a reply
// { status, body }, or a function (init) => reply. Throwing simulates a
// network failure. Every call is recorded in fetch.mock.calls.
export function fakeFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const path = new URL(url).pathname
    const handler = routes[`${init.method ?? 'GET'} ${path}`]
    if (!handler) throw new Error(`No fake reply for ${init.method} ${path}`)
    const reply = typeof handler === 'function' ? handler(init) : handler
    if (reply instanceof Error) throw reply
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    }
  })
}

export const callsTo = (fetch, method, path) =>
  fetch.mock.calls.filter(([url, init]) => new URL(url).pathname === path && init.method === method)

export const authHeader = (call) => call[1].headers.Authorization
