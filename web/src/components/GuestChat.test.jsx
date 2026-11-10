import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { authHeader, callsTo, deferred, fakeFetch } from '../test/fakeApi.js'
import { launcherButton } from '../test/launcher.js'

const TOKEN_KEY = 'loomlane.token'
const GUEST_KEY = 'loomlane.guest'
const CONVERSATION_KEY = 'loomlane.conversationId'

const GUEST_CREATED = { status: 201, body: { access_token: 'guest-token', token_type: 'bearer' } }
const guestMe = (questionsLeft = 10) => ({
  status: 200,
  body: { id: 5, email: null, role: 'customer', is_guest: true, questions_left: questionsLeft, question_limit: 10, created_at: '2026-11-09T09:00:00Z' },
})
const ACCOUNT_ME = { status: 200, body: { id: 6, email: 'ada@example.com', role: 'customer', is_guest: false, questions_left: null, question_limit: null } }
const REPLY = { status: 201, body: { id: 2, role: 'assistant', content: 'Pickup in Lekki is free.', created_at: new Date().toISOString() } }
const refused = (code, detail, headers = {}) => ({ status: 429, body: { detail, code }, headers })
const LIMIT = refused('guest_limit_reached', "You've used your 10 guest questions. Create a free account or sign in to keep chatting.")
const DAILY = refused('guest_daily_limit_reached', 'Guest chat is busy today. Sign in or create a free account to keep going, or try again tomorrow.', { 'Retry-After': '7200' })

// A guest chat that starts and answers, unless a test changes a reply
function guestRoutes(overrides = {}) {
  return {
    'POST /auth/guest': GUEST_CREATED,
    'GET /auth/me': guestMe(),
    'POST /conversations': { status: 201, body: { id: 1, title: null } },
    'POST /conversations/1/messages': REPLY,
    ...overrides,
  }
}

function setup(routes = guestRoutes()) {
  const fetch = fakeFetch(routes)
  const user = userEvent.setup()
  render(<App fetchImpl={fetch} />)
  return { fetch, user }
}

const panel = () => screen.getByRole('dialog', { name: 'Loom & Lane' })
const input = () => screen.getByRole('textbox', { name: 'Your question' })

async function openAsGuest(user) {
  await user.click(launcherButton())
  return screen.findByRole('heading', { name: 'Hello, how can we help?' })
}

async function ask(user, text = 'Is pickup free in Lekki?') {
  await user.type(input(), text)
  await user.click(screen.getByRole('button', { name: 'Send' }))
}

describe('starting as a guest', () => {
  it('opening the chat starts a guest straight away, with no sign in', async () => {
    const { fetch, user } = setup()

    await openAsGuest(user)

    expect(callsTo(fetch, 'POST', '/auth/guest')).toHaveLength(1)
    expect(authHeader(callsTo(fetch, 'POST', '/auth/guest')[0])).toBeUndefined() // no token to send yet
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('guest-token')
    expect(window.sessionStorage.getItem(GUEST_KEY)).toBe('1') // stored like a customer's, marked as a guest's
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    await waitFor(() => expect(input()).toHaveFocus())
  })

  it('shows the guest welcome: the demo note, the greeting and the chips', async () => {
    const { user } = setup()
    await openAsGuest(user)
    const dialog = panel()

    expect(within(dialog).getByText(/This is a demo with a limited knowledge base/)).toBeInTheDocument()
    expect(within(dialog).getByText('Hi! Ask me anything about delivery, returns or sizing. No account needed.')).toBeInTheDocument()
    const chips = within(within(dialog).getByRole('group', { name: 'Popular questions' })).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(['Delivery to my state', 'How do returns work?', 'Help me find my size', 'Can I pay on delivery?'])
  })

  it('the footer shows the questions left and a way to sign in; guests have no history or sign out', async () => {
    const { user } = setup()
    await openAsGuest(user)

    await waitFor(() => expect(panel()).toHaveTextContent('Guest chat · 10 questions left'))
    expect(within(panel()).getByRole('button', { name: 'Sign in to save your chats' })).toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Conversation history' })).not.toBeInTheDocument()
  })

  it('a guest token from earlier in the tab is used again, not a new guest', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'guest-token')
    window.sessionStorage.setItem(GUEST_KEY, '1')
    const { fetch, user } = setup(guestRoutes({ 'GET /auth/me': guestMe(4) }))

    await openAsGuest(user)

    expect(callsTo(fetch, 'POST', '/auth/guest')).toHaveLength(0)
    await waitFor(() => expect(panel()).toHaveTextContent('Guest chat · 4 questions left'))
  })
})

describe('questions left', () => {
  it('counts down after each question', async () => {
    let left = 10
    const { user } = setup(guestRoutes({ 'GET /auth/me': () => guestMe(left) }))
    await openAsGuest(user)
    await waitFor(() => expect(panel()).toHaveTextContent('10 questions left'))

    left = 9
    await ask(user)

    expect(await screen.findByText('Pickup in Lekki is free.')).toBeInTheDocument()
    await waitFor(() => expect(panel()).toHaveTextContent('Guest chat · 9 questions left'))
  })

  it('says "1 question left"', async () => {
    const { user } = setup(guestRoutes({ 'GET /auth/me': guestMe(1) }))
    await openAsGuest(user)

    await waitFor(() => expect(panel()).toHaveTextContent('Guest chat · 1 question left'))
  })

  it("a reply that failed still used the question (it was saved)", async () => {
    let left = 10
    const { user } = setup(guestRoutes({
      'GET /auth/me': () => guestMe(left),
      'POST /conversations/1/messages': { status: 502, body: { detail: 'The assistant is unavailable right now.' } },
    }))
    await openAsGuest(user)

    left = 9
    await ask(user)

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await waitFor(() => expect(panel()).toHaveTextContent('9 questions left'))
  })
})

describe('the limits', () => {
  it("the 11th question: \"You've used your 10 guest questions\", the box disabled, an account offered", async () => {
    const { user } = setup(guestRoutes({ 'POST /conversations/1/messages': LIMIT }))
    await openAsGuest(user)

    await ask(user, 'One more?')

    const limit = await screen.findByText("You've used your 10 guest questions")
    expect(limit.closest('[role="status"]')).toHaveTextContent('Create a free account to keep chatting and save your conversations')
    expect(screen.queryByText('One more?')).not.toBeInTheDocument() // not saved, so no bubble
    expect(input()).toBeDisabled()
    expect(input()).toHaveAttribute('placeholder', 'Sign in to ask more questions')
    expect(screen.getByRole('button', { name: 'Send, unavailable' })).toBeDisabled()
    // Focus was in the box, now disabled: it moves to the card
    expect(screen.getByRole('button', { name: 'Create a free account' })).toHaveFocus()
    expect(panel()).toHaveTextContent('Guest chat · 0 questions left')
    expect(panel()).toHaveTextContent('Or email support@loomandlane.example')
  })

  it('when the last question is answered, the card appears and takes focus from the disabled box', async () => {
    let left = 1
    const { user } = setup(guestRoutes({ 'GET /auth/me': () => guestMe(left) }))
    await openAsGuest(user)
    await waitFor(() => expect(panel()).toHaveTextContent('1 question left'))

    left = 0
    await ask(user)

    expect(await screen.findByText('Pickup in Lekki is free.')).toBeInTheDocument()
    expect(await screen.findByText("You've used your 10 guest questions")).toBeInTheDocument()
    expect(input()).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create a free account' })).toHaveFocus())
  })

  it('a guest who already used every question sees the card when the chat opens', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'guest-token')
    window.sessionStorage.setItem(GUEST_KEY, '1')
    const { user } = setup(guestRoutes({ 'GET /auth/me': guestMe(0) }))

    await user.click(launcherButton())

    expect(await screen.findByText("You've used your 10 guest questions")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hello, how can we help?' })).not.toBeInTheDocument()
    expect(input()).toBeDisabled()
  })

  it('the daily guest limit: "Guest chat is busy today", with the questions the guest still has', async () => {
    const { user } = setup(guestRoutes({ 'POST /conversations/1/messages': DAILY, 'GET /auth/me': guestMe(7) }))
    await openAsGuest(user)

    await ask(user)

    const title = await screen.findByText('Guest chat is busy today')
    expect(title.closest('[role="status"]')).toHaveTextContent('Sign in or create a free account to keep going, or try again tomorrow.')
    expect(input()).toBeDisabled()
    expect(panel()).toHaveTextContent('Guest chat · 7 questions left')
  })

  it('sending too fast: a message under the box, and the question goes back into it', async () => {
    const { user } = setup(guestRoutes({
      'POST /conversations/1/messages': refused('guest_too_fast', "You're sending messages very quickly. Please wait a moment and try again.", { 'Retry-After': '20' }),
    }))
    await openAsGuest(user)

    await ask(user, 'Quick one')

    expect(await screen.findByText("You're sending messages very quickly. Please wait a moment and try again.")).toBeInTheDocument()
    expect(input()).toHaveValue('Quick one')
    expect(input()).toBeEnabled()
  })

  it("the card's buttons open create account and sign in", async () => {
    const { user } = setup(guestRoutes({ 'POST /conversations/1/messages': LIMIT }))
    await openAsGuest(user)
    await ask(user)

    await user.click(await screen.findByRole('button', { name: 'Create a free account' }))
    expect(screen.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Email')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Back to the chat' }))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('signing in instead of a guest', () => {
  it('"Sign in to save your chats" opens sign in, and Back returns to the chat as it was', async () => {
    const { user } = setup()
    await openAsGuest(user)
    await ask(user)
    await screen.findByText('Pickup in Lekki is free.')

    await user.click(screen.getByRole('button', { name: 'Sign in to save your chats' }))
    expect(screen.getByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Back to the chat' }))
    expect(screen.getByText('Pickup in Lekki is free.')).toBeVisible()
    expect(input()).toHaveFocus()
  })

  it('signing in replaces the guest and starts a fresh chat, keeping the refused question', async () => {
    let me = guestMe()
    const { user } = setup(guestRoutes({
      'POST /conversations/1/messages': LIMIT,
      'GET /auth/me': () => me,
      'POST /auth/login': { status: 200, body: { access_token: 'account-token', token_type: 'bearer' } },
    }))
    await openAsGuest(user)
    await ask(user, 'Do you sell gift cards?')
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))

    me = ACCOUNT_ME
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    // The account's welcome, with its history, sign out and every chip
    expect(await screen.findByRole('button', { name: "Where's my order?" })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('account-token')
    expect(window.sessionStorage.getItem(GUEST_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBeNull() // the guest's chat isn't moved over
    expect(screen.getByRole('button', { name: 'Conversation history' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByText(/Guest chat/)).not.toBeInTheDocument()
    expect(screen.queryByText("You've used your 10 guest questions")).not.toBeInTheDocument()
    expect(input()).toBeEnabled()
    expect(input()).toHaveValue('Do you sell gift cards?')
  })
})

describe('an expired guest token', () => {
  it('quietly starts a new guest when the chat opens, saying the earlier chat ended', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'old-guest-token')
    window.sessionStorage.setItem(GUEST_KEY, '1')
    window.sessionStorage.setItem(CONVERSATION_KEY, '3')
    const { fetch, user } = setup(guestRoutes({
      'GET /auth/me': (init) => (init.headers.Authorization === 'Bearer old-guest-token' ? { status: 401, body: { detail: 'Could not validate credentials' } } : guestMe()),
      'GET /conversations/3/messages': { status: 401, body: { detail: 'Could not validate credentials' } },
    }))

    await user.click(launcherButton())

    expect(await screen.findByText('Your earlier chat has ended, so this is a new one.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/auth/guest')).toHaveLength(1)
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('guest-token')
    expect(screen.queryByText('Your session ended. Please sign in again.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('two requests refused with the expired token, one after the other, still start one new guest', async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'old-guest-token')
    window.sessionStorage.setItem(GUEST_KEY, '1')
    window.sessionStorage.setItem(CONVERSATION_KEY, '3')
    const late = deferred()
    const expired = { status: 401, body: { detail: 'Could not validate credentials' } }
    const { fetch, user } = setup(guestRoutes({
      'GET /auth/me': (init) => (init.headers.Authorization === 'Bearer old-guest-token' ? expired : guestMe()),
      // The old conversation's messages answer only after the guest has been replaced
      'GET /conversations/3/messages': () => late.promise,
    }))

    await user.click(launcherButton())
    expect(await screen.findByText('Your earlier chat has ended, so this is a new one.')).toBeInTheDocument()
    await act(async () => late.resolve(expired))

    expect(screen.queryByText('Your session ended. Please sign in again.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/auth/guest')).toHaveLength(1)
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('guest-token')
  })

  it('a question sent with an expired token comes back in the new chat', async () => {
    let expired = false
    const { user } = setup(guestRoutes({
      'POST /conversations': () => (expired ? { status: 401, body: { detail: 'Could not validate credentials' } } : { status: 201, body: { id: 1 } }),
      'POST /auth/guest': () => ({ status: 201, body: { access_token: expired ? 'new-guest-token' : 'guest-token', token_type: 'bearer' } }),
    }))
    await openAsGuest(user)

    expired = true
    await ask(user, 'Still there?')

    expect(await screen.findByText('Your earlier chat has ended, so this is a new one.')).toBeInTheDocument()
    expect(input()).toHaveValue('Still there?')
  })
})

describe('when guest chat is off or fails', () => {
  it('guest chat off: the sign in screen, as before guests', async () => {
    const { fetch, user } = setup({}) // the fake API's default: guest chat is off

    await user.click(launcherButton())

    expect(await screen.findByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Back to the chat' })).not.toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/auth/guest')).toHaveLength(1)
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it.each([
    ['the request fails', new TypeError('Failed to fetch')],
    ['too many guests from this address', refused('guest_create_limit_reached', 'Too many guest chats were started from your connection.', { 'Retry-After': '3600' })],
    ['a server error', { status: 500, body: { detail: 'Something went wrong.' } }],
  ])('%s: the sign in screen', async (_, reply) => {
    const { user } = setup(guestRoutes({ 'POST /auth/guest': reply }))

    await user.click(launcherButton())

    expect(await screen.findByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
  })

  it('guest chat turned off mid chat: sign in, with the question kept', async () => {
    const { user } = setup(guestRoutes({
      'POST /conversations/1/messages': { status: 403, body: { detail: 'Guest chat is turned off.', code: 'guest_chat_disabled' } },
    }))
    await openAsGuest(user)

    await ask(user, 'Hello?')

    expect(await screen.findByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it("an account's session ending still asks it to sign in again (no guest)", async () => {
    window.sessionStorage.setItem(TOKEN_KEY, 'account-token')
    const { fetch, user } = setup(guestRoutes({ 'GET /auth/me': { status: 401, body: { detail: 'Could not validate credentials' } } }))

    await user.click(launcherButton())

    expect(await screen.findByText('Your session ended. Please sign in again.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/auth/guest')).toHaveLength(0)
  })
})

it("a guest's messages and the replies are plain text", async () => {
  const { user } = setup(guestRoutes({
    'POST /conversations/1/messages': { status: 201, body: { id: 2, role: 'assistant', content: '<img src=x onerror="window.hacked = true">', created_at: new Date().toISOString() } },
  }))
  await openAsGuest(user)

  await ask(user, '<script>window.hacked = true</script>')

  expect(await screen.findByText('<img src=x onerror="window.hacked = true">')).toBeInTheDocument()
  expect(screen.getByText('<script>window.hacked = true</script>')).toBeInTheDocument()
  expect(panel().querySelector('script, img')).toBeNull()
  expect(window.hacked).toBeUndefined()
})
