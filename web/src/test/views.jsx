// The views the interface can show, and how to reach each one in a test:
// the homepage (and its open mobile menu) and every chat panel view. Used by
// the accessibility checks and the generated CSS check.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MemoryRouter } from 'react-router'

import { ADMIN_TOKEN_KEY } from '../admin/session.jsx'
import App from '../App.jsx'
import { AppRoutes } from '../Root.jsx'
import { ATTENTION, DETAIL, STATS, conversation, conversationsBody, detailBody, statsBody } from './adminFixtures.js'
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
// The admin dashboard at /admin, with a fake API answering as this account
const ADMIN_ME = { status: 200, body: { id: 1, email: 'abraham@example.com', role: 'admin', created_at: '2026-10-02T09:00:00Z' } }
const CUSTOMER_ME = { status: 200, body: { id: 2, email: 'chioma@example.com', role: 'customer', created_at: '2026-10-12T09:00:00Z' } }

function admin(me, path = '/admin', routes = {}) {
  return {
    routes: () => {
      if (me) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token')
      return { 'GET /auth/me': me, 'GET /admin/stats': STATS, 'GET /admin/conversations': ATTENTION, 'GET /admin/conversations/7': DETAIL, ...routes }
    },
    render: (fetchImpl) => (
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes fetchImpl={fetchImpl} />
      </MemoryRouter>
    ),
  }
}

export const VIEWS = {
  'admin sign in': {
    ...admin(null),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: 'Sign in to the dashboard' }),
  },
  'admin not allowed': {
    ...admin(CUSTOMER_ME),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: 'This area is for store admins' }),
  },
  'admin unreachable': {
    ...admin(null),
    routes: () => {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token')
      return { 'GET /auth/me': () => new TypeError('Failed to fetch') }
    },
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: "We couldn't reach ShopAssist" }),
  },
  'admin shell': {
    ...admin(ADMIN_ME, '/admin/knowledge'),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { level: 1, name: 'Knowledge' }),
  },
  overview: {
    ...admin(ADMIN_ME),
    reach: async () => {},
    ready: () => screen.findByRole('link', { name: /Do you sell silk evening gowns/ }),
  },
  'overview, last 30 days': {
    ...admin(ADMIN_ME, '/admin', {
      'GET /admin/stats': {
        status: 200,
        body: statsBody({
          range: '30d', since: '2026-09-29T00:00:00+01:00',
          per_day: Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10), conversations: i % 4 })),
        }),
      },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('img', { name: /^Bar chart/ }),
  },
  'overview loading': {
    ...admin(ADMIN_ME, '/admin', { 'GET /admin/stats': () => deferred().promise, 'GET /admin/conversations': () => deferred().promise }),
    reach: async () => {},
    ready: () => screen.findByText('Loading the overview…'),
  },
  'overview error': {
    ...admin(ADMIN_ME, '/admin', {
      'GET /admin/stats': { status: 500, body: { detail: 'Something went wrong.' } },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: "We couldn't load the overview" }),
  },
  'overview, new store': {
    ...admin(ADMIN_ME, '/admin', {
      'GET /admin/stats': {
        status: 200,
        body: statsBody({
          conversations: 0, previous_conversations: 0, questions: 0, answered: 0, customers: 0,
          needs_attention: { total: 0, couldnt_answer: 0, unanswered: 0 },
          per_day: statsBody().per_day.map((d) => ({ ...d, conversations: 0 })),
        }),
      },
      'GET /admin/conversations': { status: 200, body: conversationsBody([]) },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: 'No conversations yet' }),
  },
  'overview, nothing needs attention': {
    ...admin(ADMIN_ME, '/admin', { 'GET /admin/conversations': { status: 200, body: conversationsBody([]) } }),
    reach: async () => {},
    ready: () => screen.findByText('No conversations need your attention'),
  },
  conversations: {
    ...admin(ADMIN_ME, '/admin/conversations?filter=attention', {
      'GET /admin/conversations': { status: 200, body: { ...ATTENTION.body, total: 45 } },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('navigation', { name: 'Pages' }),
  },
  'conversation open': {
    ...admin(ADMIN_ME, '/admin/conversations/7'),
    reach: async () => {},
    ready: () => screen.findByRole('link', { name: 'Add to knowledge' }),
  },
  'conversation resolved': {
    ...admin(ADMIN_ME, '/admin/conversations/7', {
      'GET /admin/conversations/7': {
        status: 200,
        body: detailBody({ conversation: conversation({ status: 'resolved', attention_reason: null, resolved_at: '2026-10-29T09:00:00Z' }) }),
      },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('button', { name: 'Reopen' }),
  },
  'conversation resolve failed': {
    ...admin(ADMIN_ME, '/admin/conversations/7', {
      'POST /admin/conversations/7/resolve': { status: 500, body: { detail: 'Something went wrong.' } },
    }),
    reach: async (user) => {
      await user.click(await screen.findByRole('button', { name: 'Mark as resolved' }))
    },
    ready: () => screen.findByText(/We couldn't mark this conversation as resolved/),
  },
  'conversations loading': {
    ...admin(ADMIN_ME, '/admin/conversations/7', {
      'GET /admin/conversations': () => deferred().promise, 'GET /admin/conversations/7': () => deferred().promise,
    }),
    reach: async () => {},
    ready: () => screen.findByText('Loading the conversation…'),
  },
  'conversations errors': {
    ...admin(ADMIN_ME, '/admin/conversations/7', {
      'GET /admin/conversations': { status: 500, body: { detail: 'Something went wrong.' } },
      'GET /admin/conversations/7': { status: 500, body: { detail: 'Something went wrong.' } },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: "We couldn't load this conversation" }),
  },
  'conversation not found': {
    ...admin(ADMIN_ME, '/admin/conversations/99', {
      'GET /admin/conversations/99': { status: 404, body: { detail: 'Conversation not found' } },
      'GET /admin/conversations': { status: 200, body: conversationsBody([]) },
    }),
    reach: async () => {},
    ready: () => screen.findByRole('heading', { name: 'Conversation not found' }),
  },
  'conversations, no search results': {
    ...admin(ADMIN_ME, '/admin/conversations?q=kaftan', { 'GET /admin/conversations': { status: 200, body: conversationsBody([]) } }),
    reach: async () => {},
    ready: () => screen.findByRole('button', { name: 'Clear search' }),
  },
  'admin menu open': {
    ...admin(ADMIN_ME),
    reach: async (user) => {
      await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    },
    mobileOnly: true,
    ready: () => screen.findByRole('navigation', { name: 'Admin' }),
  },
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
  const fetchImpl = fakeFetch(view.routes())
  render(view.render ? view.render(fetchImpl) : <App fetchImpl={fetchImpl} />)

  await view.reach(user)
  await view.ready()
  if (view.fakeTimers) vi.useRealTimers()
}
