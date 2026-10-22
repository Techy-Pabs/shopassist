import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { callsTo, deferred, fakeFetch } from '../test/fakeApi.js'
import { GREETING, SUGGESTIONS } from './WelcomeScreen.jsx'

const TOKEN_KEY = 'loomlane.token'
const CONVERSATION_KEY = 'loomlane.conversationId'
const now = () => new Date().toISOString()
const ME = { status: 200, body: { id: 1, email: 'ada@example.com', role: 'customer' } }
const CREATED = { status: 201, body: { id: 42, title: null, created_at: now() } }

let nextId = 100
const reply = (content) => ({ status: 201, body: { id: nextId++, role: 'assistant', content, created_at: now() } })
const sentContent = (call) => JSON.parse(call[1].body).content

function setup(routes = {}, { userOptions } = {}) {
  window.sessionStorage.setItem(TOKEN_KEY, 'token-123')
  const fetch = fakeFetch({ 'GET /auth/me': ME, 'POST /conversations': CREATED, ...routes })
  const user = userEvent.setup(userOptions)
  render(<App fetchImpl={fetch} />)
  return { fetch, user }
}

async function openChat(user) {
  await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))
  return screen.getByRole('dialog', { name: 'Loom & Lane' })
}

const input = () => screen.getByRole('textbox', { name: 'Your question' })

async function ask(user, text) {
  await user.type(input(), text)
  await user.click(screen.getByRole('button', { name: 'Send' }))
}

describe('the welcome screen', () => {
  it('greets, offers five suggestions, and focuses the input', async () => {
    const { user } = setup()
    await openChat(user)

    expect(await screen.findByRole('heading', { name: 'Hello, how can we help?' })).toBeInTheDocument()
    expect(screen.getByText(GREETING)).toBeInTheDocument()
    const chips = within(screen.getByRole('group', { name: 'Popular questions' })).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(SUGGESTIONS)
    expect(input()).toHaveFocus()
  })

  it('a suggestion chip sends exactly its label', async () => {
    const { user, fetch } = setup({ 'POST /conversations/42/messages': reply('You can pay by card, bank transfer or on delivery.') })
    await openChat(user)

    await user.click(await screen.findByRole('button', { name: 'Can I pay on delivery?' }))

    expect(await screen.findByText('You can pay by card, bank transfer or on delivery.')).toBeInTheDocument()
    expect(sentContent(callsTo(fetch, 'POST', '/conversations/42/messages')[0])).toBe('Can I pay on delivery?')
    expect(screen.getByText('Can I pay on delivery?', { selector: 'p' })).toBeInTheDocument() // the customer bubble
  })
})

describe('sending a message', () => {
  it('shows the bubble at once, the typing indicator, then the reply', async () => {
    const pending = deferred()
    const { user } = setup({ 'POST /conversations/42/messages': () => pending.promise })
    await openChat(user)

    await ask(user, 'How long does delivery to Abuja take?')

    expect(screen.getByText('How long does delivery to Abuja take?')).toBeInTheDocument()
    expect(await screen.findByTestId('typing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send, available once the reply arrives' })).toBeDisabled()
    expect(input()).toHaveAttribute('placeholder', 'Wait for the reply, or type your next question')
    expect(input()).toBeEnabled() // the customer can type the next question
    expect(screen.getByRole('status')).toHaveTextContent('Loom & Lane is typing')

    await act(async () => pending.resolve(reply('Delivery to Abuja takes 3 to 5 business days.')))

    expect(await screen.findByText('Delivery to Abuja takes 3 to 5 business days.')).toBeInTheDocument()
    expect(screen.queryByTestId('typing')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('Loom & Lane replied: Delivery to Abuja takes 3 to 5 business days.')
  })

  it('shows replies as literal text, never as HTML, and keeps line breaks', async () => {
    const evil = 'Here are <b>tags</b> and <script>alert("x")</script>\nSecond line <img src=x onerror=alert(1)>'
    const { user } = setup({ 'POST /conversations/42/messages': reply(evil) })
    const panel = await openChat(user)

    await ask(user, 'Hello')

    const bubble = await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === evil)
    expect(bubble).toHaveClass('whitespace-pre-wrap')
    expect(panel.querySelector('b')).toBeNull()
    expect(panel.querySelector('script')).toBeNull()
    expect(panel.querySelector('img')).toBeNull()
  })

  it('creates the conversation once, on the first message, and remembers it', async () => {
    const { user, fetch } = setup({ 'POST /conversations/42/messages': () => reply('Noted.') })
    await openChat(user)
    expect(callsTo(fetch, 'POST', '/conversations')).toHaveLength(0) // opening creates nothing

    await ask(user, 'First question')
    await screen.findAllByText('Noted.')
    await ask(user, 'Second question')
    await waitFor(() => expect(screen.getAllByText('Noted.')).toHaveLength(2))

    expect(callsTo(fetch, 'POST', '/conversations')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/conversations/42/messages').map(sentContent)).toEqual(['First question', 'Second question'])
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBe('42')
  })

  it('reopening the panel in the same tab resumes the conversation', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const { user, fetch } = setup({
      'GET /conversations/42/messages': { status: 200, body: [
        { id: 1, role: 'user', content: 'Can I return earrings?', created_at: now() },
        { id: 2, role: 'assistant', content: 'Earrings cannot be returned for hygiene reasons.', created_at: now() },
      ] },
    })

    await openChat(user)

    expect(await screen.findByText('Earrings cannot be returned for hygiene reasons.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hello, how can we help?' })).not.toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations')).toHaveLength(0)
  })

  it('a stored conversation that is gone starts fresh', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '99')
    const { user } = setup({ 'GET /conversations/99/messages': { status: 404, body: { detail: 'Conversation not found' } } })

    await openChat(user)

    expect(await screen.findByRole('heading', { name: 'Hello, how can we help?' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBeNull()
  })

  it('separates the day with a divider', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const lastWeek = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const { user } = setup({
      'GET /conversations/42/messages': { status: 200, body: [
        { id: 1, role: 'user', content: 'Old question', created_at: lastWeek.toISOString() },
        { id: 2, role: 'user', content: 'New question', created_at: now() },
      ] },
    })

    await openChat(user)

    await screen.findByText('New question')
    expect(screen.getByText(/^Today, \d{1,2}:\d{2} (am|pm)$/)).toBeInTheDocument()
    expect(screen.getByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d{1,2}:\d{2} (am|pm)$/)).toBeInTheDocument()
  })
})

describe('when something goes wrong', () => {
  it('a 502 shows the unavailable card, and Try again asks for the reply without saving the question twice', async () => {
    const { user, fetch } = setup({
      'POST /conversations/42/messages': { status: 502, body: { detail: 'The assistant is unavailable right now. Please try again in a moment.' } },
      'POST /conversations/42/retry': reply('Delivery in Lagos takes 1 to 2 business days.'),
    })
    await openChat(user)
    await ask(user, 'Delivery in Lagos?')

    const card = await screen.findByRole('alert')
    expect(card).toHaveTextContent('The assistant is unavailable right now')
    expect(card).toHaveTextContent('Your question is saved.')
    expect(within(card).getByText('WhatsApp +234 800 000 0000')).toBeInTheDocument()
    expect(within(card).queryByRole('link')).not.toBeInTheDocument() // a placeholder number: not a link

    await user.click(within(card).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Delivery in Lagos takes 1 to 2 business days.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(1) // the question was sent once
    expect(callsTo(fetch, 'POST', '/conversations/42/retry')).toHaveLength(1)
    expect(screen.getAllByText('Delivery in Lagos?')).toHaveLength(1) // no second bubble
  })

  it('Try again sends the question in full if it never reached the server (409)', async () => {
    let sends = 0
    const { user, fetch } = setup({
      'POST /conversations/42/messages': () => (++sends === 1 ? new TypeError('Failed to fetch') : reply('Hello there.')),
      'POST /conversations/42/retry': { status: 409, body: { detail: 'There is no unanswered question to retry.' } },
    })
    await openChat(user)
    await ask(user, 'Hello?')
    const card = await screen.findByRole('alert')

    await user.click(within(card).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/retry')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/conversations/42/messages').map(sentContent)).toEqual(['Hello?', 'Hello?'])
    expect(screen.getAllByText('Hello?')).toHaveLength(1)
  })

  it('a retry that fails again shows the card again', async () => {
    const { user } = setup({
      'POST /conversations/42/messages': { status: 502, body: {} },
      'POST /conversations/42/retry': { status: 502, body: {} },
    })
    await openChat(user)
    await ask(user, 'Hello?')
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The assistant is unavailable right now')
  })

  it('no response at all also shows the unavailable card', async () => {
    const { user } = setup({ 'POST /conversations/42/messages': () => new TypeError('Failed to fetch') })
    await openChat(user)

    await ask(user, 'Hello?')

    expect(await screen.findByRole('alert')).toHaveTextContent('The assistant is unavailable right now')
  })

  it('a 422 shows the message under the input and gives the text back', async () => {
    const { user } = setup({
      'POST /conversations/42/messages': { status: 422, body: { detail: [{ loc: ['body', 'content'], msg: 'String should have at most 2000 characters' }] } },
    })
    await openChat(user)

    await ask(user, 'A very long question')

    await waitFor(() => expect(input()).toHaveAccessibleDescription('String should have at most 2000 characters'))
    expect(input()).toHaveValue('A very long question')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('A very long question', { selector: 'p' })).not.toBeInTheDocument() // bubble taken back
  })

  it('a session that ends while sending keeps the text and restores it after signing in', async () => {
    let signedIn = true
    const { user } = setup({
      'POST /conversations/42/messages': () => (signedIn ? { status: 401, body: { detail: 'Could not validate credentials' } } : reply('Hi')),
      'POST /auth/login': () => {
        signedIn = false
        return { status: 200, body: { access_token: 'new-token', token_type: 'bearer' } }
      },
    })
    await openChat(user)

    await ask(user, 'Where is my parcel?')

    expect(await screen.findByRole('status')).toHaveTextContent('Your session ended. Please sign in again.')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in and start chatting' }))

    expect(await screen.findByRole('textbox', { name: 'Your question' })).toHaveValue('Where is my parcel?')
  })
})

describe('waking the API', () => {
  afterEach(() => vi.useRealTimers())

  function setupWaking(health) {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    return setup({ 'GET /health': health }, { userOptions: { advanceTimers: vi.advanceTimersByTime } })
  }

  it('shows the waking screen after 3 seconds, with time elapsed, until the API answers', async () => {
    const pending = deferred()
    const { user } = setupWaking(() => pending.promise)
    await openChat(user)
    expect(screen.queryByText('Getting the assistant ready')).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(3_000))
    expect(screen.getByRole('heading', { name: 'Getting the assistant ready' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Time waited' })).toHaveAttribute('aria-valuenow', '1')

    await act(async () => vi.advanceTimersByTime(37_000)) // 40 of 90 seconds
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')

    await act(async () => pending.resolve({ status: 200, body: { status: 'ok' } }))
    expect(await screen.findByRole('heading', { name: 'Hello, how can we help?' })).toBeInTheDocument()
  })

  it('retries 5 seconds after a failed check', async () => {
    let checks = 0
    const { user, fetch } = setupWaking(() => (++checks < 3 ? new TypeError('Failed to fetch') : { status: 200, body: { status: 'ok' } }))
    await openChat(user)
    expect(callsTo(fetch, 'GET', '/health')).toHaveLength(1)

    await act(async () => vi.advanceTimersByTime(5_000))
    expect(callsTo(fetch, 'GET', '/health')).toHaveLength(2)
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(callsTo(fetch, 'GET', '/health')).toHaveLength(3)

    expect(await screen.findByRole('heading', { name: 'Hello, how can we help?' })).toBeInTheDocument()
  })

  it('gives up after 90 seconds with the unavailable card, and Try again checks again', async () => {
    const { user, fetch } = setupWaking(() => new Promise(() => {})) // never answers
    await openChat(user)

    await act(async () => vi.advanceTimersByTime(90_000))

    const card = screen.getByRole('alert')
    expect(card).toHaveTextContent('The assistant is unavailable right now')
    expect(card).not.toHaveTextContent('Your question is saved') // nothing was asked yet
    await user.click(within(card).getByRole('button', { name: 'Try again' }))
    expect(callsTo(fetch, 'GET', '/health')).toHaveLength(2)
  })
})

describe('scrolling', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  function scrolledUp(element) {
    // Far from the bottom: 2000 tall, showing 400, scrolled to 100
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 100, writable: true },
    })
    fireEvent.scroll(element)
  }

  it('follows the reply when the customer is at the bottom', async () => {
    const pending = deferred()
    const { user } = setup({ 'POST /conversations/42/messages': () => pending.promise })
    await openChat(user)
    await ask(user, 'First')
    scrollIntoView.mockClear()

    await act(async () => pending.resolve(reply('A reply.')))

    await screen.findByText('A reply.')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('does not move a customer who scrolled up while the reply was on its way', async () => {
    const pending = deferred()
    const { user } = setup({ 'POST /conversations/42/messages': () => pending.promise })
    await openChat(user)
    await ask(user, 'First')
    await screen.findByTestId('typing')

    scrolledUp(screen.getByText('First').closest('.overflow-y-auto'))
    scrollIntoView.mockClear()
    await act(async () => pending.resolve(reply('A reply.')))

    await screen.findByText('A reply.')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('sending a new question scrolls down again', async () => {
    const { user } = setup({ 'POST /conversations/42/messages': () => reply('A reply.') })
    await openChat(user)
    await ask(user, 'First')
    await screen.findByText('A reply.')
    scrolledUp(screen.getByText('First').closest('.overflow-y-auto'))
    scrollIntoView.mockClear()

    await ask(user, 'Second')

    expect(scrollIntoView).toHaveBeenCalled()
  })
})

describe('signing out', () => {
  it('the footer link signs out and forgets the conversation', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const { user } = setup({ 'GET /conversations/42/messages': { status: 200, body: [] } })
    await openChat(user)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBeNull()
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
  })
})
