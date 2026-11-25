import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { callsTo, deferred, fakeFetch } from '../test/fakeApi.js'
import { POLL_EVERY } from './ChatView.jsx'
import { DEMO_NOTE, GREETING, SUGGESTIONS } from './WelcomeScreen.jsx'
import { launcherButton } from '../test/launcher.js'

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
  await user.click(launcherButton())
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
    expect(screen.getByText(DEMO_NOTE)).toHaveClass('text-caption', 'text-ink-muted')
    // Above the chips at every size; on desktop the heading is the smaller
    // heading style so the note and all five chips fit in the panel
    const note = screen.getByText(DEMO_NOTE)
    expect(note.compareDocumentPosition(screen.getByRole('group', { name: 'Popular questions' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(note).not.toHaveClass('sm:order-last')
    expect(screen.getByRole('heading', { name: 'Hello, how can we help?' })).toHaveClass('text-heading-welcome', 'sm:text-heading')
    expect(DEMO_NOTE).toBe(
      "This is a demo with a limited knowledge base. I can answer questions about Loom & Lane's delivery, returns, sizing and products.",
    )
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

  it('after a chip, focus moves to the input (the chips are gone)', async () => {
    const { user } = setup({ 'POST /conversations/42/messages': reply('Track it from your confirmation email.') })
    await openChat(user)

    const chip = await screen.findByRole('button', { name: "Where's my order?" })
    chip.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Track it from your confirmation email.')).toBeInTheDocument()
    expect(input()).toHaveFocus()
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
  const FAILED_502 = (messageId) => ({
    status: 502, body: { detail: 'The assistant is unavailable right now. Please try again in a moment.', message_id: messageId },
  })
  const bubbles = (text) => screen.getAllByText(text, { selector: 'p' })
  const notSent = () => screen.queryByText('Not sent')
  const retryButton = () => screen.queryByRole('button', { name: 'Retry' })

  it('a failed reply marks the question "Not sent", with Retry on the bubble itself', async () => {
    const { user } = setup({ 'POST /conversations/42/messages': FAILED_502(7) })
    await openChat(user)

    await ask(user, 'Delivery in Lagos?')

    expect(await screen.findByText('Not sent')).toBeInTheDocument()
    const bubble = bubbles('Delivery in Lagos?')[0]
    // "Not sent" and Retry belong to the question's bubble
    expect(bubble.parentElement).toContainElement(notSent())
    expect(bubble.parentElement).toContainElement(retryButton())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // no separate card
  })

  it('Retry answers that same message, without a second bubble or saving it twice', async () => {
    const { user, fetch } = setup({
      'POST /conversations/42/messages': FAILED_502(7),
      'POST /conversations/42/messages/7/retry': reply('Delivery in Lagos takes 1 to 2 business days.'),
    })
    await openChat(user)
    await ask(user, 'Delivery in Lagos?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Delivery in Lagos takes 1 to 2 business days.')).toBeInTheDocument()
    expect(bubbles('Delivery in Lagos?')).toHaveLength(1) // no second bubble
    expect(notSent()).not.toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(1) // sent once
    expect(callsTo(fetch, 'POST', '/conversations/42/messages/7/retry')).toHaveLength(1)
    expect(input()).toHaveFocus() // the Retry button went with the failed state
  })

  it('a retry that fails again keeps one bubble, "Not sent", and Retry', async () => {
    const { user, fetch } = setup({
      'POST /conversations/42/messages': FAILED_502(7),
      'POST /conversations/42/messages/7/retry': FAILED_502(7),
    })
    await openChat(user)
    await ask(user, 'Hello?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(callsTo(fetch, 'POST', '/conversations/42/messages/7/retry')).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(callsTo(fetch, 'POST', '/conversations/42/messages/7/retry')).toHaveLength(2))
    expect(await screen.findByText('Not sent')).toBeInTheDocument()
    expect(bubbles('Hello?')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(1)
  })

  // A send that got no answer at all: on Retry, the chat looks at the
  // conversation on the server before sending the question again
  const NO_ANSWER = () => new TypeError('Failed to fetch')
  const asked = (id, content, status, extra = {}) => ({ id, role: 'user', content, status, created_at: now(), ...extra })
  const answered = (id, content) => ({ id, role: 'assistant', content, status: 'sent', created_at: now() })

  it('the server answered even though the send got no response: Retry shows its reply, without sending again', async () => {
    const { user, fetch } = setup({
      'POST /conversations/42/messages': NO_ANSWER,
      'GET /conversations/42/messages': { status: 200, body: [asked(7, 'Hello?', 'sent'), answered(8, 'Hello there.')] },
    })
    await openChat(user)
    await ask(user, 'Hello?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(1) // not sent again
    expect(fetch.mock.calls.filter(([url]) => url.includes('/retry'))).toHaveLength(0) // and no AI asked
    expect(bubbles('Hello?')).toHaveLength(1)
    expect(notSent()).not.toBeInTheDocument()
  })

  it("the send never arrived: Retry sends it, once", async () => {
    let sends = 0
    const { user, fetch } = setup({
      'POST /conversations/42/messages': () => (++sends === 1 ? NO_ANSWER() : reply('Hello there.')),
      'GET /conversations/42/messages': { status: 200, body: [] },
    })
    await openChat(user)
    await ask(user, 'Hello?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(1) // looked first
    expect(callsTo(fetch, 'POST', '/conversations/42/messages').map(sentContent)).toEqual(['Hello?', 'Hello?'])
    expect(bubbles('Hello?')).toHaveLength(1)
  })

  it('the send arrived but its reply failed: Retry answers that same message by its id', async () => {
    const { user, fetch } = setup({
      'POST /conversations/42/messages': NO_ANSWER,
      'GET /conversations/42/messages': { status: 200, body: [asked(7, 'Hello?', 'failed')] },
      'POST /conversations/42/messages/7/retry': reply('Hello there.'),
    })
    await openChat(user)
    await ask(user, 'Hello?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/conversations/42/messages/7/retry')).toHaveLength(1)
    expect(bubbles('Hello?')).toHaveLength(1)
  })

  it('a question the chat already knew with the same words is not mistaken for this one', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    let sends = 0
    // The server has only the earlier "Hello?": the new one never arrived
    const earlier = [asked(5, 'Hello?', 'sent'), answered(6, 'Hi! How can I help?')]
    const { user, fetch } = setup({
      'GET /conversations/42/messages': { status: 200, body: earlier },
      'POST /conversations/42/messages': () => (++sends === 1 ? NO_ANSWER() : reply('Hello again.')),
    })
    await openChat(user)
    await screen.findByText('Hi! How can I help?')
    await ask(user, 'Hello?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Hello again.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(2) // the earlier "Hello?" wasn't this one
  })
  it('says so to screen readers', async () => {
    const { user } = setup({ 'POST /conversations/42/messages': FAILED_502(7) })
    await openChat(user)

    await ask(user, 'Hello?')

    await waitFor(() => expect(screen.getByText(/^Not sent: /, { selector: '[role="status"]' })).toHaveTextContent(
      'Not sent: The assistant is unavailable right now. Please try again in a moment. Use Retry to try again.',
    ))
  })

  it('reopening a conversation whose last question failed shows it "Not sent", and Retry answers it', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const { user, fetch } = setup({
      'GET /conversations/42/messages': { status: 200, body: [
        { id: 5, role: 'user', content: 'Is pickup free?', status: 'sent', created_at: now() },
        { id: 6, role: 'assistant', content: 'Yes, pickup is free.', status: 'sent', created_at: now() },
        { id: 7, role: 'user', content: 'And in Abuja?', status: 'failed', created_at: now() },
      ] },
      'POST /conversations/42/messages/7/retry': reply('We have no pickup point in Abuja.'),
    })
    await openChat(user)

    expect(await screen.findByText('Not sent')).toBeInTheDocument()
    expect(bubbles('And in Abuja?')[0].parentElement).toContainElement(retryButton())

    await user.click(retryButton())

    expect(await screen.findByText('We have no pickup point in Abuja.')).toBeInTheDocument()
    expect(bubbles('And in Abuja?')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(0)
  })

  it('an older question that failed stays "Not sent", without Retry (only the latest can be retried)', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const { user } = setup({
      'GET /conversations/42/messages': { status: 200, body: [
        { id: 5, role: 'user', content: 'Is pickup free?', status: 'failed', created_at: now() },
        { id: 6, role: 'user', content: 'Hello?', status: 'sent', created_at: now() },
        { id: 7, role: 'assistant', content: 'Hi! How can I help?', status: 'sent', created_at: now() },
      ] },
    })
    await openChat(user)

    expect(await screen.findByText('Not sent')).toBeInTheDocument()
    expect(retryButton()).not.toBeInTheDocument()
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

describe('a 401 on any call returns to sign in', () => {
  const ENDED = { status: 401, body: { detail: 'Could not validate credentials' } }
  const FAILED = { status: 502, body: { detail: 'The assistant is unavailable right now.' } }

  async function expectSignIn() {
    expect(await screen.findByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(screen.getByText('Your session ended. Please sign in again.')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  }

  it('loading a conversation', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const { user } = setup({ 'GET /conversations/42/messages': ENDED })
    await openChat(user)
    await expectSignIn()
  })

  it('creating a conversation', async () => {
    const { user } = setup({ 'POST /conversations': ENDED })
    await openChat(user)
    await ask(user, 'Hello?')
    await expectSignIn()
  })

  it('Retry', async () => {
    const { user } = setup({
      'POST /conversations/42/messages': { ...FAILED, body: { ...FAILED.body, message_id: 7 } },
      'POST /conversations/42/messages/7/retry': ENDED,
    })
    await openChat(user)
    await ask(user, 'Hello?')
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    await expectSignIn()
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
    // A placeholder number: shown as text, not a link
    expect(within(card).getByText('WhatsApp +234 800 000 0000')).toBeInTheDocument()
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
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

  it('does not scroll the welcome screen, which is read from the top', async () => {
    const { user } = setup()
    await openChat(user)
    await screen.findByRole('heading', { name: 'Hello, how can we help?' })

    expect(scrollIntoView).not.toHaveBeenCalled()
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

    // Signed out, the chat tries to start a guest; guest chat is off here
    expect(await screen.findByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBeNull()
    expect(screen.queryByText(/Your session ended/)).not.toBeInTheDocument()
  })

  it('with guest chat on, signing out goes back to a guest chat, like any visitor', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '42')
    const { user } = setup({
      'GET /conversations/42/messages': { status: 200, body: [] },
      'POST /auth/guest': { status: 201, body: { access_token: 'guest-token', token_type: 'bearer' } },
      'GET /auth/me': { status: 200, body: { id: 5, email: null, role: 'customer', is_guest: true, questions_left: 10, question_limit: 10 } },
    })
    await openChat(user)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Hi! Ask me anything about delivery, returns or sizing. No account needed.')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('guest-token')
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBeNull()
  })
})

describe('the header follows the chat', () => {
  afterEach(() => vi.useRealTimers())
  const subtitle = () => screen.getByRole('heading', { name: 'Loom & Lane' }).nextElementSibling

  it('says "Typing" while a reply is on its way', async () => {
    const pending = deferred()
    const { user } = setup({ 'POST /conversations/42/messages': () => pending.promise })
    await openChat(user)
    expect(subtitle()).toHaveTextContent('AI assistant, replies in seconds')

    await ask(user, 'Do you deliver to Kano?')
    expect(subtitle()).toHaveTextContent(/^Typing$/)

    await act(async () => pending.resolve(reply('Yes, in 3 to 5 business days.')))
    expect(subtitle()).toHaveTextContent('AI assistant, replies in seconds')
  })

  it('says only "AI assistant" when the assistant is unavailable', async () => {
    const { user } = setup({ 'POST /conversations/42/messages': { status: 502, body: { detail: 'The assistant is unavailable right now.' } } })
    await openChat(user)

    await ask(user, 'Do you deliver to Port Harcourt?')

    await screen.findByText('Not sent')
    expect(subtitle()).toHaveTextContent(/^AI assistant$/)
  })

  it('says "Connecting" while waking, without the history button', async () => {
    const pending = deferred()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user } = setup({ 'GET /health': () => pending.promise }, { userOptions: { advanceTimers: vi.advanceTimersByTime } })
    await openChat(user)

    await act(async () => vi.advanceTimersByTime(3_000))
    expect(subtitle()).toHaveTextContent(/^Connecting$/)
    expect(screen.queryByRole('button', { name: 'Conversation history' })).not.toBeInTheDocument()

    await act(async () => pending.resolve({ status: 200, body: { status: 'ok' } }))
    expect(subtitle()).toHaveTextContent('AI assistant, replies in seconds')
    expect(screen.getByRole('button', { name: 'Conversation history' })).toBeInTheDocument()
  })
})

describe('"Still answering…" while another request writes the reply', () => {
  afterEach(() => vi.useRealTimers())
  const FAILED_502 = { status: 502, body: { detail: 'The assistant is unavailable right now. Please try again in a moment.', message_id: 7 } }
  const IN_PROGRESS = { status: 409, body: { detail: 'This question is already being answered.', code: 'reply_in_progress' } }
  const question = (status) => ({ id: 7, role: 'user', content: 'Hello?', status, created_at: now() })
  const replyRow = { id: 8, role: 'assistant', content: 'Hello there.', status: 'sent', created_at: now() }

  // A failed question, then a retry that another request is already answering
  async function startAnswering(server) {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const result = setup({
      'POST /conversations/42/messages': FAILED_502,
      'POST /conversations/42/messages/7/retry': IN_PROGRESS,
      'GET /conversations/42/messages': () => server.reply,
    }, { userOptions: { advanceTimers: vi.advanceTimersByTime } })
    await openChat(result.user)
    await ask(result.user, 'Hello?')
    await result.user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Still answering…')).toBeInTheDocument()
    return result
  }
  const look = () => act(async () => vi.advanceTimersByTime(POLL_EVERY))

  it('shows "Still answering…", with no error and no Retry, until the reply appears', async () => {
    const server = { reply: { status: 200, body: [question('sending')] } }
    const { fetch } = await startAnswering(server)

    expect(screen.queryByText('Not sent')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Still answering. The reply will appear here.')).toBeInTheDocument() // announced

    await look()
    expect(screen.getByText('Still answering…')).toBeInTheDocument() // still sending: looks again
    server.reply = { status: 200, body: [question('sent'), replyRow] }
    await look()

    expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    expect(screen.queryByText('Still answering…')).not.toBeInTheDocument()
    expect(screen.getAllByText('Hello?', { selector: 'p' })).toHaveLength(1)
    expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(2)
    expect(callsTo(fetch, 'POST', '/conversations/42/messages/7/retry')).toHaveLength(1) // never asked the AI itself
  })

  it('if the other request dies, "Not sent" with Retry once the server counts it as failed', async () => {
    const server = { reply: { status: 200, body: [question('sending')] } }
    await startAnswering(server)

    server.reply = { status: 200, body: [question('failed')] } // stuck past the cut-off: the server says failed
    await look()

    expect(await screen.findByText('Not sent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Still answering…')).not.toBeInTheDocument()
  })

  describe('offline, and the cut-off', () => {
    let online = true
    beforeEach(() => {
      online = true
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
    })
    afterEach(() => {
      delete window.navigator.onLine // back to jsdom's own
    })
    const goOffline = () => act(async () => {
      online = false
      window.dispatchEvent(new Event('offline'))
    })
    const goOnline = () => act(async () => {
      online = true
      window.dispatchEvent(new Event('online'))
    })
    // The 409 says how long until the server counts the question as failed
    const inProgressFor = (seconds) => ({ ...IN_PROGRESS, headers: { 'Retry-After': String(seconds) } })

    async function start(server, retryAfter = 120) {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const result = setup({
        'POST /conversations/42/messages': FAILED_502,
        'POST /conversations/42/messages/7/retry': () => server.retry ?? inProgressFor(retryAfter),
        'GET /conversations/42/messages': () => server.reply,
      }, { userOptions: { advanceTimers: vi.advanceTimersByTime } })
      await openChat(result.user)
      await ask(result.user, 'Hello?')
      await result.user.click(await screen.findByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Still answering…')).toBeInTheDocument()
      return result
    }

    it('pauses while the browser is offline, and looks again as soon as it is back', async () => {
      const server = { reply: { status: 200, body: [question('sending')] } }
      const { fetch } = await start(server)
      await goOffline()

      await look()
      await look()
      expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(0) // paused
      expect(screen.getByText('Still answering…')).toBeInTheDocument()

      server.reply = { status: 200, body: [question('sent'), replyRow] }
      await goOnline() // looks straight away, without waiting for the next tick

      expect(await screen.findByText('Hello there.')).toBeInTheDocument()
      expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(1)
    })

    it('already offline when the waiting starts: no looking until the browser is back', async () => {
      const server = { reply: { status: 200, body: [question('sending')] } }
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const { fetch, user } = setup({
        'POST /conversations/42/messages': FAILED_502,
        'POST /conversations/42/messages/7/retry': inProgressFor(120),
        'GET /conversations/42/messages': () => server.reply,
      }, { userOptions: { advanceTimers: vi.advanceTimersByTime } })
      await openChat(user)
      await ask(user, 'Hello?')
      online = false // the retry's answer arrives as the connection drops
      await user.click(await screen.findByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Still answering…')).toBeInTheDocument()

      await look()
      await look()
      expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(0)

      server.reply = { status: 200, body: [question('sent'), replyRow] }
      await goOnline()
      expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    })

    it("stops at the server's cut-off and shows the failed state, with Retry for that same message", async () => {
      const server = { reply: { status: 200, body: [question('sending')] } }
      const { fetch, user } = await start(server, 10)

      await act(async () => vi.advanceTimersByTime(9_000))
      expect(screen.getByText('Still answering…')).toBeInTheDocument()
      await act(async () => vi.advanceTimersByTime(1_000))

      expect(await screen.findByText('Not sent')).toBeInTheDocument()
      expect(screen.queryByText('Still answering…')).not.toBeInTheDocument()
      const looks = callsTo(fetch, 'GET', '/conversations/42/messages').length
      await look()
      expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(looks) // stopped looking

      server.retry = { status: 201, body: replyRow }
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Hello there.')).toBeInTheDocument()
      expect(callsTo(fetch, 'POST', '/conversations/42/messages/7/retry')).toHaveLength(2)
    })

    it('reaches the cut-off even while offline', async () => {
      const server = { reply: { status: 200, body: [question('sending')] } }
      await start(server, 10)
      await goOffline()

      await act(async () => vi.advanceTimersByTime(10_000))

      expect(await screen.findByText('Not sent')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('takes the time left from each look, so the cut-off follows the server', async () => {
      const server = { reply: { status: 200, body: [{ ...question('sending'), retry_in: 4 }] } }
      await start(server, 120)

      await look() // the server now says 4 seconds are left
      await act(async () => vi.advanceTimersByTime(4_000))

      expect(await screen.findByText('Not sent')).toBeInTheDocument()
    })
  })

  it('stops looking when the chat is closed', async () => {
    const server = { reply: { status: 200, body: [question('sending')] } }
    const { fetch, user } = await startAnswering(server)

    await user.click(screen.getByRole('button', { name: 'Close chat' }))
    await look()
    await look()

    expect(callsTo(fetch, 'GET', '/conversations/42/messages')).toHaveLength(0)
  })

  it('a send that got no answer, found still being answered on the server, waits the same way', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = { reply: { status: 200, body: [question('sending')] } }
    const { user, fetch } = setup({
      'POST /conversations/42/messages': () => new TypeError('Failed to fetch'),
      'GET /conversations/42/messages': () => server.reply,
    }, { userOptions: { advanceTimers: vi.advanceTimersByTime } })
    await openChat(user)
    await ask(user, 'Hello?')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Still answering…')).toBeInTheDocument()
    server.reply = { status: 200, body: [question('sent'), replyRow] }
    await look()

    expect(await screen.findByText('Hello there.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/42/messages')).toHaveLength(1)
  })
})
