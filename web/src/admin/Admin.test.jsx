import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import { AppRoutes } from '../Root.jsx'
import { callsTo, fakeFetch } from '../test/fakeApi.js'
import { setMobile } from '../test/setup.js'
import { PLEX_FONTS_URL } from './look.js'
import { ADMIN_TOKEN_KEY } from './session.jsx'

const ADMIN = { status: 200, body: { id: 1, email: 'abraham@example.com', role: 'admin', created_at: '2026-10-02T09:00:00Z' } }
const CUSTOMER = { status: 200, body: { id: 2, email: 'chioma@example.com', role: 'customer', created_at: '2026-10-12T09:00:00Z' } }
const STATS = { status: 200, body: { needs_attention: { total: 5, couldnt_answer: 3, unanswered: 2 } } }
const ENDED = { status: 401, body: { detail: 'Could not validate credentials' } }

function open(path, routes = {}, { token = 'admin-token' } = {}) {
  if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
  const fetch = fakeFetch({ 'GET /auth/me': ADMIN, 'GET /admin/stats': STATS, ...routes })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes fetchImpl={fetch} />
    </MemoryRouter>,
  )
  return { fetch, user }
}

const heading = (name) => screen.findByRole('heading', { level: 1, name })

// Routing ---------------------------------------------------------------------

describe('routes', () => {
  it('/ is still the store with its chat launcher, and no admin', async () => {
    open('/')

    expect(await screen.findByRole('complementary', { name: 'Chat' })).toBeInTheDocument() // the chat launcher
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it.each([
    ['/admin', 'Overview'],
    ['/admin/conversations', 'Conversations'],
    ['/admin/conversations/42', 'Conversation 42'],
    ['/admin/knowledge', 'Knowledge'],
    ['/admin/customers', 'Customers'],
  ])('%s shows the admin layout with its page', async (path, title) => {
    open(path)

    expect(await heading(title)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
    expect(document.title).toBe(`${title} · ShopAssist admin`)
  })

  it.each([
    ['/admin', 'Overview'],
    ['/admin/conversations/42', 'Conversations'],
    ['/admin/knowledge', 'Knowledge'],
  ])('marks %s as the current page in the nav', async (path, current) => {
    open(path)
    await screen.findByRole('navigation', { name: 'Admin' })

    const nav = screen.getByRole('navigation', { name: 'Admin' })
    const marked = within(nav).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')
    expect(marked.map((link) => link.textContent)).toEqual([expect.stringContaining(current)])
  })

  it('an unknown admin address says so, inside the layout', async () => {
    open('/admin/nowhere')

    expect(await heading('Page not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the overview' })).toHaveAttribute('href', '/admin')
  })

  it('moving between pages focuses the new page heading', async () => {
    const { user } = open('/admin')
    await heading('Overview')

    await user.click(screen.getByRole('link', { name: /Knowledge/ }))

    expect(await heading('Knowledge')).toHaveFocus()
  })
})

// The layout ------------------------------------------------------------------

describe('the layout', () => {
  it('shows ShopAssist, the store, the admin and a link to the store chat', async () => {
    open('/admin')
    await heading('Overview')

    expect(screen.getByText('ShopAssist')).toBeInTheDocument()
    expect(screen.getByText('Loom & Lane')).toBeInTheDocument()
    expect(screen.getByText('abraham@example.com')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Open the store's chat" })).toHaveAttribute('href', '/')
  })

  it('shows how many conversations need attention', async () => {
    open('/admin')

    const conversations = await screen.findByRole('link', { name: /Conversations/ })
    await waitFor(() => expect(conversations).toHaveTextContent('5 need attention'))
  })

  it('sign out forgets the token and returns to sign in', async () => {
    const { user } = open('/admin')
    await heading('Overview')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await heading('Sign in to the dashboard')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull()
  })

  it('loads IBM Plex only on admin pages', async () => {
    open('/admin')
    await heading('Overview')
    expect(document.head.querySelector(`link[href="${PLEX_FONTS_URL}"]`)).not.toBeNull()
    expect(document.body.dataset.app).toBe('admin')
  })

  it('the store never loads IBM Plex', async () => {
    open('/', {}, { token: null })
    await screen.findByRole('complementary', { name: 'Chat' })

    expect(document.head.querySelector(`link[href="${PLEX_FONTS_URL}"]`)).toBeNull()
    expect(document.body.dataset.app).toBeUndefined()
  })
})

describe('on a phone', () => {
  beforeEach(() => setMobile(true))

  it('the sidebar becomes a menu button, with the page name beside it', async () => {
    const { user } = open('/admin/knowledge')
    await heading('Knowledge')
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument() // hidden
    // Hidden by the "hidden" class alone: a display class would beat the
    // hidden attribute in a real browser and keep the menu showing
    expect(document.getElementById(button.getAttribute('aria-controls')).className).toBe('hidden')

    await user.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAccessibleName('Close menu')
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
  })

  it('Escape closes the menu and returns focus to its button', async () => {
    const { user } = open('/admin')
    await heading('Overview')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus()
  })

  it('choosing a page closes the menu', async () => {
    const { user } = open('/admin')
    await heading('Overview')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    await user.click(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: /Customers/ }))

    expect(await heading('Customers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})

// The role gate -----------------------------------------------------------------

describe('who gets in', () => {
  it('an admin sees the dashboard', async () => {
    const { fetch } = open('/admin')

    expect(await heading('Overview')).toBeInTheDocument()
    expect(callsTo(fetch, 'GET', '/auth/me')[0][1].headers.Authorization).toBe('Bearer admin-token')
  })

  it('without a token: the sign in screen, which signs an admin in', async () => {
    const { user, fetch } = open('/admin/knowledge', {
      'POST /auth/login': { status: 200, body: { access_token: 'new-token', token_type: 'bearer' } },
    }, { token: null })
    expect(await heading('Sign in to the dashboard')).toBeInTheDocument()
    expect(callsTo(fetch, 'GET', '/auth/me')).toHaveLength(0)

    await user.type(screen.getByLabelText('Email'), 'abraham@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await heading('Knowledge')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBe('new-token')
  })

  it('a wrong password shows the error', async () => {
    const { user } = open('/admin', {
      'POST /auth/login': { status: 401, body: { detail: 'Incorrect email or password' } },
    }, { token: null })
    await heading('Sign in to the dashboard')

    await user.type(screen.getByLabelText('Email'), 'abraham@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
  })

  it('a customer sees "This area is for store admins" and a way back to the store', async () => {
    open('/admin', { 'GET /auth/me': CUSTOMER }, { token: 'customer-token' })

    expect(await heading('This area is for store admins')).toBeInTheDocument()
    expect(screen.getByText(/chioma@example.com/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the store' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('an expired token returns to sign in with the session message', async () => {
    open('/admin', { 'GET /auth/me': ENDED }, { token: 'old-token' })

    expect(await heading('Sign in to the dashboard')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your session ended. Please sign in again.')
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull()
  })

  it('a 401 on any later call returns to sign in', async () => {
    open('/admin', { 'GET /admin/stats': ENDED })

    expect(await heading('Sign in to the dashboard')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull()
  })

  it('no answer from the server offers to try again', async () => {
    let calls = 0
    const { user } = open('/admin', { 'GET /auth/me': () => (++calls === 1 ? new TypeError('Failed to fetch') : ADMIN) })

    expect(await heading("We couldn't reach ShopAssist")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await heading('Overview')).toBeInTheDocument()
  })

  it("the chat's sign in and the dashboard's are separate", async () => {
    window.sessionStorage.setItem('loomlane.token', 'chat-token')
    const { fetch } = open('/admin', {}, { token: null })

    expect(await heading('Sign in to the dashboard')).toBeInTheDocument()
    expect(callsTo(fetch, 'GET', '/auth/me')).toHaveLength(0)
    await act(async () => {}) // nothing else happens
  })
})
