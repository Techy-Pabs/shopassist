import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'

import { AppRoutes } from '../../Root.jsx'
import {
  ADMIN_ME, DETAIL, STATS, conversation, conversationsBody, detailBody, message, statsBody,
} from '../../test/adminFixtures.js'
import { callsTo, deferred, fakeFetch } from '../../test/fakeApi.js'
import { setMobile } from '../../test/setup.js'
import { ADMIN_TOKEN_KEY } from '../session.jsx'

// Where the app is, and a way to press Back
let location
let navigate
function Where() {
  location = useLocation()
  navigate = useNavigate()
  return null
}
const here = () => location.pathname + location.search

const SECOND = conversation({ id: 8, title: 'Can I change my delivery address?', owner_email: 'tunde.a@example.com', attention_reason: 'unanswered', message_count: 1 })
const LIST = { status: 200, body: { ...conversationsBody([conversation({ message_count: 4 }), SECOND]), counts: { all: 48, attention: 2, resolved: 0 } } }
const DETAIL_8 = {
  status: 200,
  body: detailBody({ conversation: SECOND, messages: [message({ id: 9, content: 'Can I change my delivery address?' })] }),
}

function open(path, routes = {}) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token')
  const fetch = fakeFetch({
    'GET /auth/me': ADMIN_ME,
    'GET /admin/stats': STATS,
    'GET /admin/conversations': LIST,
    'GET /admin/conversations/7': DETAIL,
    'GET /admin/conversations/8': DETAIL_8,
    ...routes,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes fetchImpl={fetch} />
      <Where />
    </MemoryRouter>,
  )
  return { fetch, user }
}

const listRegion = () => screen.findByRole('region', { name: 'Conversation list' })
const row = (name) => screen.findByRole('link', { name: new RegExp(name) })
const threadHeading = (name) => screen.findByRole('heading', { level: 2, name })
// The query the page last asked the list for
const listQuery = (fetch) => new URL(callsTo(fetch, 'GET', '/admin/conversations').at(-1)[0]).searchParams

describe('the address holds the selection', () => {
  it('/admin/conversations/7 opens that conversation, marked in the list', async () => {
    open('/admin/conversations/7')

    expect(await threadHeading('Do you sell silk evening gowns?')).toBeInTheDocument()
    expect(await row('chioma.o@example.com')).toHaveAttribute('aria-current', 'true')
    expect(await row('tunde.a@example.com')).not.toHaveAttribute('aria-current')
    expect(document.title).toBe('Conversations · ShopAssist admin')
  })

  it('without an id, asks to choose one', async () => {
    open('/admin/conversations')
    expect(await screen.findByText('Choose a conversation to read it.')).toBeInTheDocument()
  })

  it('choosing a row opens it, and Back returns to the one before', async () => {
    const { user } = open('/admin/conversations/7?filter=attention')
    await threadHeading('Do you sell silk evening gowns?')

    await user.click(await row('tunde.a@example.com'))
    expect(await threadHeading('Can I change my delivery address?')).toBeInTheDocument()
    expect(here()).toBe('/admin/conversations/8?filter=attention') // the filter is kept

    act(() => navigate(-1))
    expect(await threadHeading('Do you sell silk evening gowns?')).toBeInTheDocument()
    expect(here()).toBe('/admin/conversations/7?filter=attention')
  })

  it('an unknown or deleted id says "Conversation not found"', async () => {
    open('/admin/conversations/99', { 'GET /admin/conversations/99': { status: 404, body: { detail: 'Conversation not found' } } })

    expect(await threadHeading('Conversation not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to all conversations' })).toHaveAttribute('href', '/admin/conversations')
    expect(await row('chioma.o@example.com')).toBeInTheDocument() // the list still shows
  })

  it('an address that is not an id is not found, without asking the server', async () => {
    const { fetch } = open('/admin/conversations/latest')

    expect(await threadHeading('Conversation not found')).toBeInTheDocument()
    expect(fetch.mock.calls.filter(([url]) => new URL(url).pathname.startsWith('/admin/conversations/'))).toHaveLength(0)
  })
})

describe('the filter tabs', () => {
  it('show the counts from the API', async () => {
    open('/admin/conversations')
    const tabs = within(await screen.findByRole('tablist', { name: 'Filter conversations' }))

    await waitFor(() => expect(tabs.getByRole('tab', { name: 'All 48' })).toHaveAttribute('aria-selected', 'true'))
    expect(tabs.getByRole('tab', { name: 'Needs attention 2' })).toHaveAttribute('aria-selected', 'false')
    expect(tabs.getByRole('tab', { name: 'Resolved 0' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('All 48')
  })

  it('choosing one asks for it and keeps it in the address', async () => {
    const { fetch, user } = open('/admin/conversations/7')
    await user.click(await screen.findByRole('tab', { name: /Needs attention/ }))

    expect(here()).toBe('/admin/conversations/7?filter=attention')
    await waitFor(() => expect(listQuery(fetch).get('filter')).toBe('attention'))
    expect(screen.getByRole('tab', { name: /Needs attention/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('opening an address with a filter selects that tab', async () => {
    const { fetch } = open('/admin/conversations?filter=resolved')

    expect(await screen.findByRole('tab', { name: /Resolved/ })).toHaveAttribute('aria-selected', 'true')
    expect(listQuery(fetch).get('filter')).toBe('resolved')
  })

  it('arrow keys, Home and End move between them; only the chosen one is in the Tab order', async () => {
    const { user } = open('/admin/conversations')
    const all = await screen.findByRole('tab', { name: /All/ })
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1])

    all.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Needs attention/ })).toHaveFocus()
    expect(screen.getByRole('tab', { name: /Needs attention/ })).toHaveAttribute('aria-selected', 'true')
    expect(here()).toBe('/admin/conversations?filter=attention')

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /Resolved/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}') // wraps round
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: /Resolved/ })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus()
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
  })
})

describe('search', () => {
  it('waits for typing to pause, then searches and keeps it in the address', async () => {
    const { fetch, user } = open('/admin/conversations?filter=attention')
    await row('chioma.o@example.com')
    const before = callsTo(fetch, 'GET', '/admin/conversations').length

    await user.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'silk')
    expect(callsTo(fetch, 'GET', '/admin/conversations')).toHaveLength(before) // not yet: still typing

    await waitFor(() => expect(listQuery(fetch).get('q')).toBe('silk'))
    expect(callsTo(fetch, 'GET', '/admin/conversations')).toHaveLength(before + 1) // one search, not four
    expect(listQuery(fetch).get('filter')).toBe('attention')
    expect(here()).toBe('/admin/conversations?filter=attention&q=silk')
  })

  it('an older reply that arrives last never replaces the newer one', async () => {
    const replies = {}
    const { user } = open('/admin/conversations', {
      'GET /admin/conversations': (_, url) => {
        const q = url.searchParams.get('q')
        if (!q) return LIST
        replies[q] = deferred()
        return replies[q].promise
      },
    })
    await row('chioma.o@example.com')
    const box = screen.getByRole('searchbox', { name: 'Search conversations' })

    await user.type(box, 'silk')
    await waitFor(() => expect(replies.silk).toBeDefined())
    await user.type(box, ' gown')
    await waitFor(() => expect(replies['silk gown']).toBeDefined())

    await act(async () => replies['silk gown'].resolve({ status: 200, body: conversationsBody([conversation({ id: 30, owner_email: 'newer@example.com' })]) }))
    expect(await row('newer@example.com')).toBeInTheDocument()
    await act(async () => replies.silk.resolve({ status: 200, body: conversationsBody([conversation({ id: 31, owner_email: 'older@example.com' })]) }))

    expect(screen.getByRole('link', { name: /newer@example.com/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /older@example.com/ })).not.toBeInTheDocument()
  })

  it('a search in the address fills the box', async () => {
    const { fetch } = open('/admin/conversations?q=lagos')
    expect(await screen.findByRole('searchbox', { name: 'Search conversations' })).toHaveValue('lagos')
    expect(listQuery(fetch).get('q')).toBe('lagos')
  })

  it('no results says so, and offers to clear the search', async () => {
    const { user } = open('/admin/conversations?q=kaftan', { 'GET /admin/conversations': { status: 200, body: conversationsBody([]) } })

    expect(await screen.findByText('No conversations match “kaftan”')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(here()).toBe('/admin/conversations')
    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toHaveValue('')
  })
})

describe('paging', () => {
  it('long lists come a page at a time, kept in the address', async () => {
    const { fetch, user } = open('/admin/conversations', {
      'GET /admin/conversations': { status: 200, body: { ...LIST.body, total: 45 } },
    })
    const pages = await screen.findByRole('navigation', { name: 'Pages' })
    expect(pages).toHaveTextContent('1–20 of 45')
    expect(within(pages).getByRole('button', { name: 'Previous' })).toHaveAttribute('aria-disabled', 'true')
    expect(listQuery(fetch).get('offset')).toBe('0')

    await user.click(within(pages).getByRole('button', { name: 'Next' }))

    expect(here()).toBe('/admin/conversations?page=2')
    await waitFor(() => expect(listQuery(fetch).get('offset')).toBe('20'))
    expect(await screen.findByRole('navigation', { name: 'Pages' })).toHaveTextContent('21–40 of 45')
  })

  it('changing the tab goes back to the first page', async () => {
    const { user } = open('/admin/conversations?page=3', { 'GET /admin/conversations': { status: 200, body: { ...LIST.body, total: 45 } } })
    await user.click(await screen.findByRole('tab', { name: /Resolved/ }))
    expect(here()).toBe('/admin/conversations?filter=resolved')
  })
})

describe('the list', () => {
  it('each row shows the email, time, question, why it needs attention and its length', async () => {
    open('/admin/conversations')
    const first = await row('chioma.o@example.com')

    await waitFor(() => expect(first.querySelector('time')).not.toBeNull()) // once the time zone is known
    expect(first).toHaveTextContent("Do you sell silk evening gowns?Couldn't answer4 messages")
    expect(await row('tunde.a@example.com')).toHaveTextContent('Unanswered1 message')
    expect(first).toHaveAttribute('href', '/admin/conversations/7')
  })

  it('up and down arrows move between rows', async () => {
    const { user } = open('/admin/conversations')
    const first = await row('chioma.o@example.com')
    first.focus()

    await user.keyboard('{ArrowDown}')
    expect(await row('tunde.a@example.com')).toHaveFocus()
    await user.keyboard('{ArrowDown}') // the last row stays
    expect(await row('tunde.a@example.com')).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(first).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(here()).toBe('/admin/conversations/7')
  })

  it('loading, then an error with Try again, on its own', async () => {
    let calls = 0
    const reply = deferred()
    const { user } = open('/admin/conversations/7', {
      'GET /admin/conversations': () => (++calls === 1 ? reply.promise : LIST),
    })
    expect(await screen.findByText('Loading conversations…')).toHaveAttribute('role', 'status')
    await act(async () => reply.resolve({ status: 500, body: { detail: 'Something went wrong.' } }))

    const alert = await within(await listRegion()).findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the conversations")
    expect(await threadHeading('Do you sell silk evening gowns?')).toBeInTheDocument() // the thread still shows
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await row('chioma.o@example.com')).toBeInTheDocument()
  })

  it.each([
    ['/admin/conversations?filter=attention', 'No conversations need your attention'],
    ['/admin/conversations?filter=resolved', 'No resolved conversations yet'],
    ['/admin/conversations', 'No conversations yet'],
  ])('%s with nothing in it says "%s"', async (path, text) => {
    open(path, { 'GET /admin/conversations': { status: 200, body: conversationsBody([]) } })
    expect(await screen.findByText(text)).toBeInTheDocument()
  })
})

describe('the thread', () => {
  describe('on a fixed day', () => {
    // Only the date is fixed (to Friday 30 October), so timers run as usual
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-30T08:00:00Z'), toFake: ['Date'] }))
    afterEach(() => vi.useRealTimers())

    it('shows who said what, and when, in the store time zone', async () => {
      open('/admin/conversations/7')
      const thread = await screen.findByRole('region', { name: 'Conversation with chioma.o@example.com' })

      expect(within(thread).getAllByText('Customer')).toHaveLength(2)
      expect(within(thread).getAllByText('Assistant')).toHaveLength(2)
      expect(within(thread).getByText('Okay. How much is the green lace dress?')).toBeInTheDocument()
      // Started 13:20 UTC, first message 13:22 UTC: an hour later in Lagos
      await waitFor(() => expect(thread).toHaveTextContent('Started on Wed 28 Oct at 14:20 · 4 messages'))
      expect(within(thread).getByText('Wed 28 Oct, 14:22')).toBeInTheDocument() // once, above the first message of the day
    })
  })

  it('"Couldn\'t answer" on a no_info reply only', async () => {
    open('/admin/conversations/7')
    const thread = await screen.findByRole('region', { name: /Conversation with/ })
    const labels = within(thread).getAllByText('Assistant').map((label) => label.textContent)
    expect(labels).toEqual(["AssistantCouldn't answer", 'Assistant'])
  })

  it('"Answered from" links each document still in the knowledge, once, and names deleted ones', async () => {
    open('/admin/conversations/7')
    const answered = await screen.findByText(/^Answered from/)

    expect(within(answered).getAllByRole('link')).toHaveLength(1)
    expect(within(answered).getByRole('link', { name: 'products-and-fabrics.md' })).toHaveAttribute('href', '/admin/knowledge?document=12')
    expect(answered).toHaveTextContent('old-price-list.md (removed from the knowledge)')
  })

  it("the attention banner offers to add what it couldn't answer to the knowledge", async () => {
    open('/admin/conversations/7')
    expect(await screen.findByText(/The assistant couldn't answer a question here/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add to knowledge' })).toHaveAttribute('href', '/admin/knowledge')
  })

  it('an unanswered question gets its own banner, without "Add to knowledge"', async () => {
    open('/admin/conversations/8')
    expect(await screen.findByText(/The customer's latest question has no reply yet/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add to knowledge' })).not.toBeInTheDocument()
  })

  it('loading, then an error with Try again, on its own', async () => {
    let calls = 0
    const { user } = open('/admin/conversations/7', {
      'GET /admin/conversations/7': () => (++calls === 1 ? new TypeError('Failed to fetch') : DETAIL),
    })
    expect(await threadHeading("We couldn't load this conversation")).toBeInTheDocument()
    expect(screen.getByText(/ShopAssist didn't answer/)).toBeInTheDocument()
    expect(await row('chioma.o@example.com')).toBeInTheDocument() // the list still shows

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await threadHeading('Do you sell silk evening gowns?')).toBeInTheDocument()
  })

  it('shows "Loading the conversation…" while it loads', async () => {
    open('/admin/conversations/7', { 'GET /admin/conversations/7': () => deferred().promise })
    expect(await screen.findByText('Loading the conversation…')).toHaveAttribute('role', 'status')
  })
})

describe('resolving', () => {
  // The server's state, changed only by its replies
  function server({ fail = false } = {}) {
    let resolved = false
    const reply = deferred()
    const detail = () => detailBody({
      conversation: conversation({ message_count: 4, status: resolved ? 'resolved' : 'needs_attention', attention_reason: resolved ? null : 'couldnt_answer', resolved_at: resolved ? '2026-10-29T09:00:00Z' : null }),
    })
    return {
      reply,
      routes: {
        'GET /admin/conversations/7': () => ({ status: 200, body: detail() }),
        'GET /admin/stats': () => ({ status: 200, body: statsBody({ needs_attention: resolved ? { total: 4, couldnt_answer: 2, unanswered: 2 } : { total: 5, couldnt_answer: 3, unanswered: 2 } }) }),
        'GET /admin/conversations': () => ({ status: 200, body: { ...LIST.body, counts: { all: 48, attention: resolved ? 1 : 2, resolved: resolved ? 1 : 0 } } }),
        'POST /admin/conversations/7/resolve': async () => {
          const r = await reply.promise
          if (!fail) resolved = true
          return r
        },
        'POST /admin/conversations/7/reopen': () => {
          resolved = false
          return { status: 200, body: { id: 7, resolved_at: null, resolved_by: null } }
        },
      },
    }
  }

  it('shows a pending state, changes only once the server confirms, then updates the list, counts and badge', async () => {
    const { reply, routes } = server()
    const { fetch, user } = open('/admin/conversations/7', routes)
    const badge = await screen.findByRole('link', { name: /Conversations.*need attention/ })
    await waitFor(() => expect(badge).toHaveTextContent('5 need attention'))
    const button = await screen.findByRole('button', { name: 'Mark as resolved' })

    await user.click(button)

    expect(button).toHaveTextContent('Marking as resolved…')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/The assistant couldn't answer a question here/)).toBeInTheDocument() // nothing changed yet
    await user.click(button) // a second press does nothing
    expect(callsTo(fetch, 'POST', '/admin/conversations/7/resolve')).toHaveLength(1)

    await act(async () => reply.resolve({ status: 200, body: { id: 7, resolved_at: '2026-10-29T09:00:00Z', resolved_by: 1 } }))

    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.queryByText(/The assistant couldn't answer a question here/)).not.toBeInTheDocument()
    expect(screen.getByText('Marked as resolved.')).toHaveAttribute('role', 'status')
    await waitFor(() => expect(screen.getByRole('tab', { name: /Resolved/ })).toHaveTextContent('Resolved1'))
    expect(screen.getByRole('tab', { name: /Needs attention/ })).toHaveTextContent('Needs attention1')
    await waitFor(() => expect(badge).toHaveTextContent('4 need attention'))
  })

  it('a failure says so clearly, and changes nothing', async () => {
    const { reply, routes } = server({ fail: true })
    const { user } = open('/admin/conversations/7', routes)
    await user.click(await screen.findByRole('button', { name: 'Mark as resolved' }))

    await act(async () => reply.resolve({ status: 500, body: { detail: 'Something went wrong.' } }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't mark this conversation as resolved. Something went wrong.")
    expect(screen.getByRole('button', { name: 'Mark as resolved' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/The assistant couldn't answer a question here/)).toBeInTheDocument()
  })

  it('Reopen puts it back', async () => {
    const { reply, routes } = server()
    const { user } = open('/admin/conversations/7', routes)
    await user.click(await screen.findByRole('button', { name: 'Mark as resolved' }))
    await act(async () => reply.resolve({ status: 200, body: { id: 7, resolved_at: '2026-10-29T09:00:00Z', resolved_by: 1 } }))

    await user.click(await screen.findByRole('button', { name: 'Reopen' }))

    expect(await screen.findByRole('button', { name: 'Mark as resolved' })).toBeInTheDocument()
    expect(screen.getByText('Reopened.')).toBeInTheDocument()
  })
})

describe('the customer panel', () => {
  it("shows the customer's summary and links to their earlier conversations", async () => {
    open('/admin/conversations/7?filter=attention')
    const panel = await screen.findByRole('complementary', { name: 'Customer details' })

    expect(panel).toHaveTextContent('chioma.o@example.com')
    await waitFor(() => expect(panel).toHaveTextContent('Account since 12 Oct 2026'))
    expect(panel).toHaveTextContent("Conversations3Questions asked7Couldn't answer1")
    expect(within(panel).getByRole('link', { name: /Delivery to Lekki/ })).toHaveAttribute('href', '/admin/conversations/5?filter=attention')
    expect(within(panel).getByRole('link', { name: /Untitled conversation/ })).toHaveAttribute('href', '/admin/conversations/4?filter=attention')
  })
})

describe('customer text is plain text', () => {
  it('a <script> or <img onerror> in a message, a title or an email shows as text', async () => {
    const script = '<script>window.hacked = true</script>'
    const img = '<img src=x onerror="window.hacked = true">'
    const evil = conversation({ title: `${script} title`, owner_email: `${img}@example.com` })
    open('/admin/conversations/7', {
      'GET /admin/conversations': { status: 200, body: conversationsBody([evil]) },
      'GET /admin/conversations/7': {
        status: 200,
        body: detailBody({
          conversation: evil,
          messages: [message({ content: `${script} message` }), message({ id: 2, role: 'assistant', content: `${img} reply` })],
          customer: { ...detailBody().customer, email: `${img}@example.com`, earlier_conversations: [{ id: 5, title: `${img} earlier`, last_activity: '2026-10-21T10:00:00Z', status: 'open' }] },
        }),
      },
    })

    expect(await screen.findByText(`${script} message`)).toBeInTheDocument()
    expect(screen.getByText(`${img} reply`)).toBeInTheDocument()
    expect(screen.getAllByText(`${script} title`).length).toBeGreaterThanOrEqual(2) // the row and the thread
    expect(screen.getAllByText(`${img}@example.com`).length).toBeGreaterThanOrEqual(2) // the row and the panel
    expect(screen.getByText(`${img} earlier`)).toBeInTheDocument()
    expect(document.querySelector('main script, main img')).toBeNull()
    expect(window.hacked).toBeUndefined()
  })
})

describe('on a phone', () => {
  beforeEach(() => setMobile(true))

  it('the list is its own screen', async () => {
    open('/admin/conversations?filter=attention')
    expect(await row('chioma.o@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Conversation with/ })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search conversations' })).toBeInTheDocument()
  })

  it('the thread is its own screen, with a way back that keeps the list as it was', async () => {
    const { user } = open('/admin/conversations?filter=attention')
    await user.click(await row('chioma.o@example.com'))

    const heading = await threadHeading('Do you sell silk evening gowns?')
    expect(here()).toBe('/admin/conversations/7?filter=attention')
    expect(screen.queryByRole('region', { name: 'Conversation list' })).not.toBeInTheDocument()
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByRole('complementary', { name: 'Customer details' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'All conversations' }))

    expect(here()).toBe('/admin/conversations?filter=attention')
    await waitFor(() => expect(screen.getByRole('link', { name: /chioma.o@example.com/ })).toHaveFocus())
  })

  it('Back from the thread returns to the list', async () => {
    const { user } = open('/admin/conversations')
    await user.click(await row('tunde.a@example.com'))
    await threadHeading('Can I change my delivery address?')

    act(() => navigate(-1))

    expect(await row('tunde.a@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Conversation with/ })).not.toBeInTheDocument()
  })

  it('a shared link opens the thread screen directly', async () => {
    open('/admin/conversations/8')
    expect(await threadHeading('Can I change my delivery address?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All conversations' })).toHaveAttribute('href', '/admin/conversations')
  })

  it('tabs and the resolve button are at least 44px (h-sa-touch)', async () => {
    open('/admin/conversations/7')
    expect(await screen.findByRole('button', { name: 'Mark as resolved' })).toHaveClass('h-sa-touch')
    expect(screen.getByRole('link', { name: 'Add to knowledge' })).toHaveClass('h-sa-touch')
    expect(screen.getByRole('link', { name: 'All conversations' })).toHaveClass('h-sa-touch')
  })
})
