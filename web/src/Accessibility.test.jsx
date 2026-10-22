// Automated accessibility checks (axe) on the storefront and every panel
// view. jsdom has no layout, so colour contrast is checked in real Chrome
// instead (see the README's accessibility notes).
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import App from './App.jsx'
import { deferred, fakeFetch } from './test/fakeApi.js'
import { setMobile } from './test/setup.js'

const now = new Date().toISOString()
const CONVERSATIONS = [
  { id: 1, title: 'Delivery to Abuja', last_message_preview: 'Delivery to Abuja takes 3 to 5 business days.', updated_at: now, created_at: now },
  { id: 2, title: null, last_message_preview: null, updated_at: '2026-01-05T10:00:00Z', created_at: '2026-01-05T10:00:00Z' },
]
const MESSAGES = [
  { id: 1, role: 'user', content: 'How long does delivery take?', created_at: now },
  { id: 2, role: 'assistant', content: 'Delivery to Abuja takes 3 to 5 business days.', created_at: now },
]

async function violations() {
  const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  // Readable on failure: rule, then the offending elements
  return results.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

async function open(user) {
  await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))
}

function signedIn(routes = {}) {
  window.sessionStorage.setItem('loomlane.token', 'token-123')
  return {
    'GET /auth/me': { status: 200, body: { id: 1, email: 'ada@example.com' } },
    'GET /conversations': { status: 200, body: CONVERSATIONS },
    'GET /conversations/1/messages': { status: 200, body: MESSAGES },
    ...routes,
  }
}

// Each view: how to reach it, and a sign that it has rendered
const VIEWS = {
  storefront: {
    routes: () => ({}),
    reach: async () => {},
    ready: () => screen.findByRole('button', { name: 'Ask Loom & Lane' }),
  },
  'sign in': {
    routes: () => ({}),
    reach: open,
    ready: () => screen.findByRole('heading', { name: 'Sign in to chat' }),
  },
  'create account': {
    routes: () => ({}),
    reach: async (user) => {
      await open(user)
      await user.click(screen.getByRole('tab', { name: 'Create account' }))
    },
    ready: () => screen.findByRole('button', { name: 'Create account and start chatting' }),
  },
  welcome: {
    routes: () => signedIn(),
    reach: open,
    ready: () => screen.findByRole('heading', { name: 'Hello, how can we help?' }),
  },
  conversation: {
    routes: () => {
      window.sessionStorage.setItem('loomlane.conversationId', '1')
      return signedIn({ 'POST /conversations/1/messages': () => deferred().promise })
    },
    // Waiting for a reply, so the typing indicator shows too
    reach: async (user) => {
      await open(user)
      await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'And to Lagos?')
      await user.click(screen.getByRole('button', { name: 'Send' }))
    },
    ready: () => screen.findByText('And to Lagos?'),
  },
  error: {
    routes: () => {
      window.sessionStorage.setItem('loomlane.conversationId', '1')
      return signedIn({ 'POST /conversations/1/messages': { status: 502, body: { detail: 'The assistant is unavailable right now.' } } })
    },
    reach: async (user) => {
      await open(user)
      await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'And to Lagos?')
      await user.click(screen.getByRole('button', { name: 'Send' }))
    },
    ready: () => screen.findByRole('button', { name: 'Try again' }),
  },
  waking: {
    routes: () => signedIn({ 'GET /health': () => deferred().promise }),
    reach: async (user) => {
      await open(user)
      act(() => vi.advanceTimersByTime(3_000))
    },
    ready: () => screen.findByRole('heading', { name: 'Getting the assistant ready' }),
    fakeTimers: true,
  },
  history: {
    routes: () => signedIn(),
    reach: async (user) => {
      await open(user)
      await user.click(await screen.findByRole('button', { name: 'Conversation history' }))
    },
    ready: () => screen.findByText('Delivery to Abuja'),
  },
  'empty history': {
    routes: () => signedIn({ 'GET /conversations': { status: 200, body: [] } }),
    reach: async (user) => {
      await open(user)
      await user.click(await screen.findByRole('button', { name: 'Conversation history' }))
    },
    ready: () => screen.findByRole('heading', { name: 'No conversations yet' }),
  },
}

describe.each(['desktop', 'mobile'])('on %s', (device) => {
  it.each(Object.keys(VIEWS))('the %s view has no axe violations', async (name) => {
    const view = VIEWS[name]
    if (device === 'mobile') setMobile(true)
    if (view.fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup(view.fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {})
    render(<App fetchImpl={fakeFetch(view.routes())} />)

    await view.reach(user)
    await view.ready()
    if (view.fakeTimers) vi.useRealTimers()

    expect(await violations()).toEqual([])
  })
})

// prefers-reduced-motion: every animation is behind motion-safe:, so it
// doesn't run for people who ask for less motion
describe('reduced motion', () => {
  const dir = resolve(__dirname, 'components')
  const sources = readdirSync(dir).filter((f) => f.endsWith('.jsx') && !f.includes('.test.'))

  it('animates only when motion is welcome', () => {
    const unguarded = sources.flatMap((file) =>
      [...readFileSync(join(dir, file), 'utf8').matchAll(/(\S*)animate-[a-z-]+/g)]
        .filter(([, prefix]) => !prefix.endsWith('motion-safe:'))
        .map(([match]) => `${file}: ${match}`),
    )
    expect(sources.length).toBeGreaterThan(10)
    expect(unguarded).toEqual([])
  })
})
