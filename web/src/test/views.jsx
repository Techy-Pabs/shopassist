// The views the interface can show, and how to reach each one in a test:
// the homepage (and its open mobile menu) and every chat panel view. Used by
// the accessibility checks and the generated CSS check.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { deferred, fakeFetch } from './fakeApi.js'
import { launcherButton } from './launcher.js'
import { setMobile } from './setup.js'

const now = new Date().toISOString()
const CONVERSATIONS = [
  { id: 1, title: 'Delivery to Abuja', last_message_preview: 'Delivery to Abuja takes 3 to 5 business days.', updated_at: now, created_at: now },
  { id: 2, title: null, last_message_preview: null, updated_at: '2026-01-05T10:00:00Z', created_at: '2026-01-05T10:00:00Z' },
]
const MESSAGES = [
  { id: 1, role: 'user', content: 'How long does delivery take?', created_at: now },
  { id: 2, role: 'assistant', content: 'Delivery to Abuja takes 3 to 5 business days.', created_at: now },
]

async function open(user) {
  await user.click(launcherButton())
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
export const VIEWS = {
  homepage: {
    routes: () => ({}),
    reach: async () => {},
    ready: () => screen.findByRole('complementary', { name: 'Chat' }),
  },
  'open mobile menu': {
    routes: () => ({}),
    reach: async (user) => {
      await user.click(screen.getByRole('button', { name: 'Open menu' }))
    },
    mobileOnly: true,
    ready: () => screen.findByRole('navigation', { name: 'Main' }),
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

// The views to check on a device (the open mobile menu only exists on phones)
export const viewNames = (device) => Object.keys(VIEWS).filter((name) => device === 'mobile' || !VIEWS[name].mobileOnly)

// Render the app and bring it to a view, on desktop or mobile
export async function showView(name, device) {
  const view = VIEWS[name]
  if (device === 'mobile') setMobile(true)
  if (view.fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup(view.fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {})
  render(<App fetchImpl={fakeFetch(view.routes())} />)

  await view.reach(user)
  await view.ready()
  if (view.fakeTimers) vi.useRealTimers()
}
