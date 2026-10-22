import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { callsTo, deferred, fakeFetch } from '../test/fakeApi.js'

const TOKEN_KEY = 'loomlane.token'
const CONVERSATION_KEY = 'loomlane.conversationId'
const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(Date.now() - days * DAY).toISOString()

const CONVERSATIONS = [
  { id: 3, title: 'Can I return a sale dress?', last_message_preview: "Sale items can't be refunded, but you can exchange…", updated_at: ago(0), created_at: ago(0) },
  { id: 2, title: 'Delivery to Abuja', last_message_preview: 'Delivery to Abuja takes 3 to 5 business days and…', updated_at: ago(2), created_at: ago(2) },
  { id: 1, title: 'Finding my size', last_message_preview: "We use UK sizes. If you're between sizes, size up…", updated_at: ago(10), created_at: ago(10) },
]
const MESSAGES_2 = [
  { id: 20, role: 'user', content: 'Delivery to Abuja?', created_at: ago(2) },
  { id: 21, role: 'assistant', content: 'Delivery to Abuja takes 3 to 5 business days.', created_at: ago(2) },
]
let nextId = 500
const reply = (content) => ({ status: 201, body: { id: nextId++, role: 'assistant', content, created_at: new Date().toISOString() } })

function setup(routes = {}) {
  window.sessionStorage.setItem(TOKEN_KEY, 'token-123')
  const fetch = fakeFetch({
    'GET /auth/me': { status: 200, body: { id: 1, email: 'ada@example.com' } },
    'GET /conversations': { status: 200, body: CONVERSATIONS },
    'GET /conversations/2/messages': { status: 200, body: MESSAGES_2 },
    ...routes,
  })
  const user = userEvent.setup()
  render(<App fetchImpl={fetch} />)
  return { fetch, user }
}

async function openHistory(user) {
  await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))
  await user.click(await screen.findByRole('button', { name: 'Conversation history' }))
}

const rowFor = (title) => screen.getByText(title).closest('button')

describe('opening the history', () => {
  it('the history button shows the list with a back button, and focus moves to it', async () => {
    const { user, fetch } = setup()

    await openHistory(user)

    expect(screen.getByRole('navigation', { name: 'Past conversations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your conversations' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Your conversations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to chat' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument()
    expect(callsTo(fetch, 'GET', '/conversations')).toHaveLength(1)
    expect(new URL(callsTo(fetch, 'GET', '/conversations')[0][0]).searchParams.get('limit')).toBe('50')
  })

  it('groups conversations into "This week" and "Earlier", with titles, previews and days', async () => {
    const { user } = setup()
    await openHistory(user)

    const thisWeek = await screen.findByRole('region', { name: 'This week' })
    const earlier = screen.getByRole('region', { name: 'Earlier' })
    expect(within(thisWeek).getAllByRole('button').map((b) => b.querySelector('.font-semibold').textContent)).toEqual([
      'Can I return a sale dress?', 'Delivery to Abuja',
    ])
    expect(within(earlier).getByText('Finding my size')).toBeInTheDocument()

    const today = rowFor('Can I return a sale dress?')
    expect(within(today).getByText('Today')).toBeInTheDocument()
    expect(within(today).getByText("Sale items can't be refunded, but you can exchange…")).toBeInTheDocument()
    expect(within(rowFor('Delivery to Abuja')).getByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)).toBeInTheDocument()
    expect(within(rowFor('Finding my size')).getByText(/^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/)).toBeInTheDocument()
  })

  it('clips titles and previews to one line', async () => {
    const { user } = setup()
    await openHistory(user)

    const row = await screen.findByText('Delivery to Abuja')
    expect(row).toHaveClass('truncate')
    expect(screen.getByText('Delivery to Abuja takes 3 to 5 business days and…')).toHaveClass('truncate')
  })

  it('marks the current conversation', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '2')
    const { user } = setup()
    await openHistory(user)

    expect(await screen.findByRole('button', { current: true })).toHaveTextContent('Delivery to Abuja')
    expect(rowFor('Finding my size')).not.toHaveAttribute('aria-current')
  })

  it('names untitled and empty conversations', async () => {
    const { user } = setup({
      'GET /conversations': { status: 200, body: [{ id: 9, title: null, last_message_preview: null, updated_at: ago(0), created_at: ago(0) }] },
    })
    await openHistory(user)

    expect(await screen.findByText('New conversation', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })
})

describe('states of the list', () => {
  it('shows loading, then the list', async () => {
    const pending = deferred()
    const { user } = setup({ 'GET /conversations': () => pending.promise })
    await openHistory(user)

    expect(screen.getByText('Loading your conversations…')).toHaveAttribute('role', 'status')
    pending.resolve({ status: 200, body: CONVERSATIONS })
    expect(await screen.findByText('Finding my size')).toBeInTheDocument()
    expect(screen.queryByText('Loading your conversations…')).not.toBeInTheDocument()
  })

  it('shows an empty state for a customer with no conversations yet', async () => {
    const { user } = setup({ 'GET /conversations': { status: 200, body: [] } })
    await openHistory(user)

    expect(await screen.findByRole('heading', { name: 'No conversations yet' })).toBeInTheDocument()
    expect(screen.getByText('Your conversations will appear here. Ask us anything to start one.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeInTheDocument()
  })

  it('shows an error with Try again, which loads the list again', async () => {
    let calls = 0
    const { user, fetch } = setup({
      'GET /conversations': () => (++calls === 1 ? new TypeError('Failed to fetch') : { status: 200, body: CONVERSATIONS }),
    })
    await openHistory(user)

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent("We couldn't load your conversations.")
    await user.click(within(error).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Finding my size')).toBeInTheDocument()
    expect(callsTo(fetch, 'GET', '/conversations')).toHaveLength(2)
  })

  it('a session that has ended returns to sign in', async () => {
    const { user } = setup({ 'GET /conversations': { status: 401, body: { detail: 'Could not validate credentials' } } })
    await openHistory(user)

    expect(await screen.findByRole('heading', { name: 'Sign in to chat' })).toBeInTheDocument()
    expect(screen.getByText('Your session ended. Please sign in again.')).toBeInTheDocument()
  })
})

describe('moving between conversations', () => {
  it('opening a conversation loads its messages and continues it', async () => {
    const { user, fetch } = setup({ 'POST /conversations/2/messages': reply('It costs ₦6,000.') })
    await openHistory(user)

    await user.click(await screen.findByText('Delivery to Abuja'))

    expect(await screen.findByText('Delivery to Abuja takes 3 to 5 business days.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Past conversations' })).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBe('2')
    const input = screen.getByRole('textbox', { name: 'Your question' })
    expect(input).toHaveFocus()

    await user.type(input, 'How much does it cost?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('It costs ₦6,000.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations/2/messages')).toHaveLength(1)
    expect(callsTo(fetch, 'POST', '/conversations')).toHaveLength(0) // continued, not a new one
  })

  it('New conversation returns to the welcome screen; the next message creates one', async () => {
    window.sessionStorage.setItem(CONVERSATION_KEY, '2')
    const { user, fetch } = setup({
      'POST /conversations': { status: 201, body: { id: 77, title: null, created_at: ago(0) } },
      'POST /conversations/77/messages': reply('Happy to help.'),
    })
    await openHistory(user)

    await user.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(await screen.findByRole('heading', { name: 'Hello, how can we help?' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBeNull()
    expect(callsTo(fetch, 'POST', '/conversations')).toHaveLength(0) // not created yet
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Where\'s my order?' }))

    expect(await screen.findByText('Happy to help.')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/conversations')).toHaveLength(1)
    expect(window.sessionStorage.getItem(CONVERSATION_KEY)).toBe('77')
  })

  it('Back returns to the chat as it was, with a reply still on its way', async () => {
    const pending = deferred()
    const { user } = setup({
      'POST /conversations': { status: 201, body: { id: 5, title: null, created_at: ago(0) } },
      'POST /conversations/5/messages': () => pending.promise,
    })
    await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))
    await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'Is there free delivery?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await user.click(screen.getByRole('button', { name: 'Conversation history' }))
    pending.resolve(reply('Delivery is free on orders over ₦100,000.'))
    await user.click(screen.getByRole('button', { name: 'Back to chat' }))

    expect(await screen.findByText('Delivery is free on orders over ₦100,000.')).toBeInTheDocument()
    expect(screen.getByText('Is there free delivery?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conversation history' })).toHaveFocus()
  })

  it('Escape closes the panel from the history view', async () => {
    const { user } = setup()
    await openHistory(user)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask Loom & Lane' })).toHaveFocus()
  })

  it('there is no history button before signing in', async () => {
    window.sessionStorage.clear()
    const user = userEvent.setup()
    render(<App fetchImpl={fakeFetch({})} />)
    await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))

    expect(screen.queryByRole('button', { name: 'Conversation history' })).not.toBeInTheDocument()
  })
})
