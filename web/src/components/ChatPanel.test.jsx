import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { authHeader, callsTo, fakeFetch } from '../test/fakeApi.js'
import { setMobile } from '../test/setup.js'

const TOKEN_KEY = 'loomlane.token'
const LOGIN_OK = { status: 200, body: { access_token: 'token-123', token_type: 'bearer' } }

function setup(routes = {}) {
  const fetch = fakeFetch(routes)
  const user = userEvent.setup()
  render(<App fetchImpl={fetch} />)
  return { fetch, user, launcher: () => screen.getByRole('button', { name: 'Ask Loom & Lane' }) }
}

async function openPanel(user) {
  await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))
  return screen.getByRole('dialog', { name: 'Loom & Lane' })
}

async function fillIn(user, email, password) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
}

describe('opening and closing the panel', () => {
  it('opens from the launcher with the header, band and sign in form', async () => {
    const { user } = setup()

    const panel = await openPanel(user)

    expect(within(panel).getByRole('heading', { name: 'Loom & Lane' })).toBeInTheDocument()
    expect(within(panel).getByText('AI assistant')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Close chat' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask Loom & Lane' })).not.toBeInTheDocument()
  })

  it('moves focus into the panel', async () => {
    const { user } = setup()

    await openPanel(user)

    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('Escape closes the panel and focus returns to the launcher', async () => {
    const { user, launcher } = setup()
    await openPanel(user)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(launcher()).toHaveFocus()
  })

  it('the close button also returns focus to the launcher', async () => {
    const { user, launcher } = setup()
    await openPanel(user)

    await user.click(screen.getByRole('button', { name: 'Close chat' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(launcher()).toHaveFocus()
  })

  it('fits short windows on desktop, keeping the header and close button reachable', async () => {
    const { user } = setup()

    const panel = await openPanel(user)

    // jsdom has no layout, so check the rules that guarantee it: the panel's
    // height is capped to the window, the header never shrinks, and the
    // content area is the part that shrinks and scrolls
    expect(panel).toHaveClass('sm:h-panel-height', 'sm:max-h-panel-fit', 'overflow-hidden', 'flex-col')
    const header = within(panel).getByRole('heading', { name: 'Loom & Lane' }).closest('div.bg-indigo')
    expect(header).toHaveClass('shrink-0')
    expect(within(header).getByRole('button', { name: 'Close chat' })).toBeInTheDocument()
    const content = within(panel).getByRole('heading', { name: 'Sign in to chat' }).closest('form')
    expect(content).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')
  })

  it('is a non-modal dialog on desktop', async () => {
    const { user } = setup()

    const panel = await openPanel(user)

    expect(panel).not.toHaveAttribute('aria-modal')
  })

  it('is a modal dialog on mobile, and Tab stays inside it', async () => {
    setMobile(true)
    const { user } = setup()
    const panel = await openPanel(user)
    expect(panel).toHaveAttribute('aria-modal', 'true')

    // From the last control, Tab wraps to the first (the close button)
    screen.getByRole('link', { name: 'support@loomandlane.example' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close chat' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole('link', { name: 'support@loomandlane.example' })).toHaveFocus()
  })

  it('hides the invitation once the panel has been opened', async () => {
    const { user } = setup()
    expect(screen.getByText('Questions about delivery or sizing? Ask us here.')).toBeInTheDocument()

    await openPanel(user)
    await user.keyboard('{Escape}')

    expect(screen.queryByText('Questions about delivery or sizing? Ask us here.')).not.toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('stores the token and shows the signed in placeholder', async () => {
    const { user, fetch } = setup({ 'POST /auth/login': LOGIN_OK })
    await openPanel(user)

    await fillIn(user, 'ada@example.com', 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    expect(await screen.findByText('Signed in. Chat arrives in Slice 4.')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('token-123')
    expect(JSON.parse(callsTo(fetch, 'POST', '/auth/login')[0][1].body)).toEqual({ email: 'ada@example.com', password: 'password123' })
    expect(within(screen.getByRole('dialog')).getByText('AI assistant, replies in seconds')).toBeInTheDocument()
  })

  it('a wrong password shows the error and is not a session ending', async () => {
    const { user } = setup({ 'POST /auth/login': { status: 401, body: { detail: 'Incorrect email or password' } } })
    await openPanel(user)

    await fillIn(user, 'ada@example.com', 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('shows the server\'s validation message under the right field', async () => {
    const { user } = setup({
      'POST /auth/login': { status: 422, body: { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address: An email address must have an @-sign.' }] } },
    })
    await openPanel(user)

    await fillIn(user, 'not-an-email', 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    const email = screen.getByLabelText('Email')
    expect(await screen.findByText('Value is not a valid email address: An email address must have an @-sign.')).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Value is not a valid email address: An email address must have an @-sign.')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
  })

  it('shows a clear message when the API can\'t be reached', async () => {
    const { user } = setup({ 'POST /auth/login': () => new TypeError('Failed to fetch') })
    await openPanel(user)

    await fillIn(user, 'ada@example.com', 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the assistant")
  })

  it('signing out forgets the token and shows the form again', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'token-123')
    const { user } = setup({ 'GET /auth/me': { status: 200, body: { id: 1, email: 'ada@example.com' } } })
    await openPanel(user)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
  })
})

describe('a session that has ended', () => {
  it('a 401 on a call made with a token returns to sign in with the session message', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'expired-token')
    const { user, fetch } = setup({ 'GET /auth/me': { status: 401, body: { detail: 'Could not validate credentials' } } })

    await openPanel(user)

    expect(await screen.findByRole('status')).toHaveTextContent('Your session ended. Please sign in again.')
    expect(screen.getByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(authHeader(callsTo(fetch, 'GET', '/auth/me')[0])).toBe('Bearer expired-token')
  })

  it('signing in again clears the session message', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'expired-token')
    const { user } = setup({ 'GET /auth/me': { status: 401, body: {} }, 'POST /auth/login': LOGIN_OK })
    await openPanel(user)
    await screen.findByRole('status')

    await fillIn(user, 'ada@example.com', 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    expect(await screen.findByText('Signed in. Chat arrives in Slice 4.')).toBeInTheDocument()
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
  })
})

describe('creating an account', () => {
  it('registers, then signs in', async () => {
    const { user, fetch } = setup({
      'POST /auth/register': { status: 201, body: { id: 7, email: 'new@example.com', role: 'customer' } },
      'POST /auth/login': LOGIN_OK,
    })
    await openPanel(user)
    await user.click(screen.getByRole('tab', { name: 'Create account' }))

    await fillIn(user, 'new@example.com', 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account and start chatting' }))

    expect(await screen.findByText('Signed in. Chat arrives in Slice 4.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/auth/register')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/auth/login')).toHaveLength(1)
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('token-123')
  })

  it('a short password shows the server message under the password field', async () => {
    const { user, fetch } = setup({
      'POST /auth/register': { status: 422, body: { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }] } },
    })
    await openPanel(user)
    await user.click(screen.getByRole('tab', { name: 'Create account' }))

    await fillIn(user, 'new@example.com', 'short')
    await user.click(screen.getByRole('button', { name: 'Create account and start chatting' }))

    const password = screen.getByLabelText('Password')
    await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'))
    expect(password).toHaveAccessibleDescription('String should have at least 8 characters At least 8 characters.')
    expect(callsTo(fetch, 'POST', '/auth/login')).toHaveLength(0)
  })

  it('an email already in use shows under the email field', async () => {
    const { user } = setup({ 'POST /auth/register': { status: 400, body: { detail: 'Email already registered' } } })
    await openPanel(user)
    await user.click(screen.getByRole('tab', { name: 'Create account' }))

    await fillIn(user, 'ada@example.com', 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account and start chatting' }))

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email already registered'))
  })
})

describe('the account tabs', () => {
  it('arrow keys, Home and End move between tabs', async () => {
    const { user } = setup()
    await openPanel(user)
    const signIn = screen.getByRole('tab', { name: 'Sign in' })
    const create = screen.getByRole('tab', { name: 'Create account' })
    expect(signIn).toHaveAttribute('aria-selected', 'true')
    expect(create).toHaveAttribute('tabindex', '-1') // only the selected tab is in the Tab order

    signIn.focus()
    await user.keyboard('{ArrowRight}')
    expect(create).toHaveFocus()
    expect(create).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Create account and start chatting' })).toBeInTheDocument()

    await user.keyboard('{ArrowRight}') // wraps around
    expect(signIn).toHaveFocus()
    await user.keyboard('{End}')
    expect(create).toHaveFocus()
    await user.keyboard('{Home}')
    expect(signIn).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(create).toHaveFocus()
  })

  it('the tab panel is labelled by the selected tab', async () => {
    const { user } = setup()
    await openPanel(user)

    expect(screen.getByRole('tabpanel', { name: 'Sign in' })).toBeInTheDocument()
  })
})
