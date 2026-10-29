import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

import { AppRoutes } from '../../Root.jsx'
import { ADMIN_ME, ATTENTION, STATS, conversation, conversationsBody, statsBody } from '../../test/adminFixtures.js'
import { callsTo, deferred, fakeFetch } from '../../test/fakeApi.js'
import { setMobile } from '../../test/setup.js'
import { ADMIN_TOKEN_KEY } from '../session.jsx'
import { comparison, everyDay } from './OverviewPage.jsx'

function open(routes = {}) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token')
  const fetch = fakeFetch({ 'GET /auth/me': ADMIN_ME, 'GET /admin/stats': STATS, 'GET /admin/conversations': ATTENTION, ...routes })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <AppRoutes fetchImpl={fetch} />
    </MemoryRouter>,
  )
  return { fetch, user }
}

const numbers = () => screen.findByRole('region', { name: 'Key numbers' })
const card = (region, name) => within(region).getByRole('link', { name: new RegExp(name) })
// The page's requests (the sidebar badge asks for the stats too, with no range)
const statsCalls = (fetch) =>
  callsTo(fetch, 'GET', '/admin/stats').map(([url]) => new URL(url).searchParams.get('range')).filter(Boolean)

describe('the key numbers', () => {
  it('shows each number with its note, linking to its page', async () => {
    open({ 'GET /admin/stats': { status: 200, body: statsBody({ knowledge: { documents: 9, last_updated: new Date().toISOString() } }) } })
    const region = await numbers()

    expect(card(region, 'Conversations')).toHaveTextContent('Conversations48up from 39 the week before')
    expect(card(region, 'Conversations')).toHaveAttribute('href', '/admin/conversations')
    expect(card(region, 'Questions answered')).toHaveTextContent('186of 198 customer questions')
    expect(card(region, 'Questions answered')).toHaveAttribute('href', '/admin/conversations')
    expect(card(region, 'Knowledge documents')).toHaveTextContent('9last updated today')
    expect(card(region, 'Knowledge documents')).toHaveAttribute('href', '/admin/knowledge')
  })

  it('"Needs your attention" is the amber card, with its split, linking to those conversations', async () => {
    open()
    const attention = card(await numbers(), 'Needs your attention')

    expect(attention).toHaveTextContent("Needs your attention53 the assistant couldn't answer, 2 unanswered")
    expect(attention).toHaveAttribute('href', '/admin/conversations?filter=attention')
    expect(attention).toHaveClass('bg-sa-attention-wash', 'border-sa-attention-line')
  })

  it.each([
    [{ total: 3, couldnt_answer: 3, unanswered: 0 }, "3 the assistant couldn't answer"],
    [{ total: 2, couldnt_answer: 0, unanswered: 2 }, '2 unanswered'],
    [{ total: 0, couldnt_answer: 0, unanswered: 0 }, 'Nothing is waiting for you'],
  ])('splits %o as "%s"', async (needs, text) => {
    open({ 'GET /admin/stats': { status: 200, body: statsBody({ needs_attention: needs }) } })
    expect(card(await numbers(), 'Needs your attention')).toHaveTextContent(text)
  })

  it.each([
    [48, 39, '7d', 'up from 39 the week before'],
    [30, 39, '7d', 'down from 39 the week before'],
    [39, 39, '7d', 'the same as the week before'],
    [12, 0, '7d', 'none the week before'],
    [4, 6, 'today', 'down from 6 yesterday'],
    [9, 9, '30d', 'the same as the 30 days before'],
  ])('%i now and %i before (%s) reads "%s"', (now, before, range, text) => {
    expect(comparison(now, before, range)).toBe(text)
  })

  it('says when there are no documents yet', async () => {
    open({ 'GET /admin/stats': { status: 200, body: statsBody({ knowledge: { documents: 0, last_updated: null } }) } })
    expect(card(await numbers(), 'Knowledge documents')).toHaveTextContent('0no documents yet')
  })
})

describe('the date range', () => {
  it('starts at the last 7 days, and switching reloads the stats', async () => {
    const { fetch, user } = open({
      'GET /admin/stats': (_, url) => ({
        status: 200,
        body: url.searchParams.get('range') === '30d' ? statsBody({ range: '30d', conversations: 120, previous_conversations: 0, since: '2026-09-30T00:00:00+01:00', per_day: [] }) : statsBody(),
      }),
    })
    const group = await screen.findByRole('group', { name: 'Date range' })
    expect(within(group).getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true')
    await numbers()

    await user.click(within(group).getByRole('button', { name: 'Last 30 days' }))

    expect(within(group).getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'false')
    expect(card(await numbers(), 'Conversations')).toHaveTextContent('120none the 30 days before')
    expect(statsCalls(fetch).slice(-1)).toEqual(['30d'])
  })

  it('an older reply that arrives last never replaces the newer one', async () => {
    const replies = {}
    const { fetch, user } = open({
      'GET /admin/stats': (init, url) => {
        const range = url.searchParams.get('range')
        if (range !== '30d' && range !== 'today') return STATS
        replies[range] = { ...deferred(), signal: init.signal }
        return replies[range].promise
      },
    })
    const group = await screen.findByRole('group', { name: 'Date range' })
    await numbers()

    // Quickly: 30 days, then today
    await user.click(within(group).getByRole('button', { name: 'Last 30 days' }))
    await user.click(within(group).getByRole('button', { name: 'Today' }))
    expect(statsCalls(fetch)).toEqual(['7d', '30d', 'today'])
    expect(replies['30d'].signal.aborted).toBe(true) // the older request is cancelled
    expect(replies.today.signal.aborted).toBe(false)

    // Today's reply comes first, then the cancelled 30-day one arrives anyway
    await act(async () => replies.today.resolve({ status: 200, body: statsBody({ range: 'today', conversations: 4, previous_conversations: 6 }) }))
    expect(card(await numbers(), 'Conversations')).toHaveTextContent('4down from 6 yesterday')
    await act(async () => replies['30d'].resolve({ status: 200, body: statsBody({ range: '30d', conversations: 120 }) }))

    expect(card(screen.getByRole('region', { name: 'Key numbers' }), 'Conversations')).toHaveTextContent('4down from 6 yesterday')
    expect(within(group).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("switching doesn't reload the needs-attention list", async () => {
    const { fetch, user } = open()
    await screen.findByRole('link', { name: /Do you sell silk evening gowns/ })

    await user.click(screen.getByRole('button', { name: 'Today' }))
    await numbers()

    expect(callsTo(fetch, 'GET', '/admin/conversations')).toHaveLength(1)
    const [url] = callsTo(fetch, 'GET', '/admin/conversations')[0]
    expect(new URL(url).searchParams.get('filter')).toBe('attention')
  })
})

describe('the chart', () => {
  it('has a bar per day, named by day in the store, and describes every value in text', async () => {
    open()
    const chart = await screen.findByRole('img', { name: /^Bar chart/ })

    expect(chart).toHaveAccessibleName('Bar chart of conversations per day: Thu: 5, Fri: 8, Sat: 11, Sun: 4, Mon: 6, Tue: 7, Wed: 7')
    const bars = chart.querySelectorAll('svg')
    expect(bars).toHaveLength(7)
    // The busiest day (11) is the tallest bar; the others are its share
    expect(bars[2]).toHaveAttribute('height', '85%')
    expect(bars[3]).toHaveAttribute('height', `${(4 / 11) * 85}%`)
    expect(screen.getByText('Thu').closest('[aria-hidden]')).not.toBeNull() // the labels repeat the description
  })

  it("names the days in the API's time zone, not the browser's", async () => {
    // Midnight on Thursday 22 October in Auckland is still Wednesday in UTC
    // (11:00 on the 21st), so a chart that read "since" as a moment would
    // start on the wrong day
    const auckland = statsBody({ time_zone: 'Pacific/Auckland', since: '2026-10-22T00:00:00+13:00' })
    open({ 'GET /admin/stats': { status: 200, body: auckland } })
    const chart = await screen.findByRole('img', { name: /^Bar chart/ })

    expect(chart).toHaveAccessibleName('Bar chart of conversations per day: Thu: 5, Fri: 8, Sat: 11, Sun: 4, Mon: 6, Tue: 7, Wed: 7')
    expect(everyDay(auckland.since, '7d', []).map((d) => d.day)[0]).toBe('2026-10-22')
  })

  it('shows a day with no conversations as zero', async () => {
    // The API sends every day; if one were ever missing, it still counts as 0
    const perDay = statsBody().per_day.filter((d) => d.day !== '2026-10-24')
    perDay[0] = { ...perDay[0], conversations: 0 }
    open({ 'GET /admin/stats': { status: 200, body: statsBody({ per_day: perDay }) } })
    const chart = await screen.findByRole('img', { name: /^Bar chart/ })

    expect(chart).toHaveAccessibleName('Bar chart of conversations per day: Thu: 0, Fri: 8, Sat: 0, Sun: 4, Mon: 6, Tue: 7, Wed: 7')
    expect(chart.querySelectorAll('svg')[0]).toHaveAttribute('height', '0%')
  })

  it('a quiet week with no conversations at all draws no bars', () => {
    expect(everyDay('2026-10-22T00:00:00+01:00', '7d', []).map((d) => d.conversations)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('a month names its days by date', () => {
    const days = everyDay('2026-09-30T00:00:00Z', '30d', [{ day: '2026-10-01', conversations: 3 }])
    expect(days).toHaveLength(30)
    expect(days[0]).toEqual({ day: '2026-09-30', conversations: 0 })
    expect(days[1]).toEqual({ day: '2026-10-01', conversations: 3 })
    expect(days[29].day).toBe('2026-10-29')
  })

  it('the 30-day chart describes all 30 days', async () => {
    const perDay = everyDay('2026-09-30T00:00:00+01:00', '30d', []).map((d, i) => ({ ...d, conversations: i }))
    open({ 'GET /admin/stats': { status: 200, body: statsBody({ range: '30d', since: '2026-09-30T00:00:00+01:00', per_day: perDay }) } })
    const chart = await screen.findByRole('img', { name: /^Bar chart/ })

    expect(chart.getAttribute('aria-label')).toMatch(/^Bar chart of conversations per day: 30 Sept?: 0, 1 Oct: 1, .* 29 Oct: 29$/)
    expect(chart.querySelectorAll('svg')).toHaveLength(30)
  })
})

describe('needs your attention', () => {
  it('links to each conversation and says why it needs attention', async () => {
    open()
    const list = await screen.findByRole('region', { name: 'Needs your attention' })

    const first = within(list).getByRole('link', { name: /Do you sell silk evening gowns/ })
    expect(first).toHaveAttribute('href', '/admin/conversations/7')
    expect(first).toHaveTextContent("Couldn't answer")
    expect(first).toHaveTextContent('chioma.o@example.com')
    const second = within(list).getByRole('link', { name: /Can I change my delivery address/ })
    expect(second).toHaveAttribute('href', '/admin/conversations/8')
    expect(second).toHaveTextContent('Unanswered')
    expect(within(list).getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/admin/conversations?filter=attention')
  })

  it('says when nothing needs attention', async () => {
    open({ 'GET /admin/conversations': { status: 200, body: conversationsBody([]) } })
    const list = await screen.findByRole('region', { name: 'Needs your attention' })

    expect(await within(list).findByText('No conversations need your attention')).toBeInTheDocument()
  })

  it('a failed list offers to try again, on its own', async () => {
    let calls = 0
    const { user } = open({
      'GET /admin/conversations': () => (++calls === 1 ? { status: 500, body: { detail: 'Something went wrong.' } } : ATTENTION),
    })
    const list = await screen.findByRole('region', { name: 'Needs your attention' })
    expect(await within(list).findByRole('alert')).toHaveTextContent("We couldn't load these conversations.")
    expect(screen.getByRole('region', { name: 'Key numbers' })).toBeInTheDocument() // the rest still shows

    await user.click(within(list).getByRole('button', { name: 'Try again' }))

    expect(await within(list).findByRole('link', { name: /Do you sell silk evening gowns/ })).toBeInTheDocument()
  })

  it('shows customer text as plain text, never as HTML', async () => {
    open({
      'GET /admin/conversations': {
        status: 200,
        body: conversationsBody([
          conversation({ title: '<script>window.hacked = true</script>', owner_email: '<img src=x onerror="window.hacked = true">@example.com' }),
        ]),
      },
    })
    const list = await screen.findByRole('region', { name: 'Needs your attention' })

    expect(await within(list).findByText('<script>window.hacked = true</script>')).toBeInTheDocument()
    expect(within(list).getByText('<img src=x onerror="window.hacked = true">@example.com')).toBeInTheDocument()
    expect(list.querySelector('script')).toBeNull()
    expect(list.querySelector('img')).toBeNull()
    expect(window.hacked).toBeUndefined()
  })

  it("shows times in the API's time zone", async () => {
    const now = new Date()
    const inZone = (timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
    open({
      'GET /admin/stats': { status: 200, body: statsBody({ time_zone: 'Asia/Tokyo' }) },
      'GET /admin/conversations': { status: 200, body: conversationsBody([conversation({ last_activity: now.toISOString() })]) },
    })
    const row = await screen.findByRole('link', { name: /Do you sell silk evening gowns/ })

    expect(row.querySelector('time')).toHaveTextContent(inZone('Asia/Tokyo'))
    expect(inZone('Asia/Tokyo')).not.toBe(inZone('UTC')) // Tokyo is 9 hours ahead
  })

  it('a conversation with no title is "Untitled conversation"', async () => {
    open({ 'GET /admin/conversations': { status: 200, body: conversationsBody([conversation({ title: null })]) } })
    expect(await screen.findByRole('link', { name: /Untitled conversation/ })).toHaveAttribute('href', '/admin/conversations/7')
  })
})

describe('the page', () => {
  it('prompts to upload a document, linking to Knowledge', async () => {
    open()
    const prompt = await screen.findByRole('region', { name: "Questions the assistant couldn't answer point to gaps in its knowledge" })

    expect(within(prompt).getByRole('link', { name: 'Upload a document' })).toHaveAttribute('href', '/admin/knowledge')
  })

  it('shows loading, then the numbers', async () => {
    const reply = deferred()
    open({ 'GET /admin/stats': () => reply.promise })

    expect(await screen.findByText('Loading the overview…')).toHaveAttribute('role', 'status')
    await act(async () => reply.resolve(STATS))

    expect(await numbers()).toBeInTheDocument()
    expect(screen.queryByText('Loading the overview…')).not.toBeInTheDocument()
  })

  it('an error offers to try again', async () => {
    let calls = 0
    const { user } = open({ 'GET /admin/stats': () => (++calls <= 2 ? { status: 500, body: { detail: 'Something went wrong.' } } : STATS) })
    // (the sidebar badge asks for the stats too: the first two calls fail)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the overview")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await numbers()).toBeInTheDocument()
  })

  it('a new store with nothing yet says so', async () => {
    open({
      'GET /admin/stats': {
        status: 200,
        body: statsBody({
          conversations: 0, previous_conversations: 0, questions: 0, answered: 0, customers: 0,
          needs_attention: { total: 0, couldnt_answer: 0, unanswered: 0 },
        }),
      },
      'GET /admin/conversations': { status: 200, body: conversationsBody([]) },
    })

    expect(await screen.findByRole('heading', { name: 'No conversations yet' })).toBeInTheDocument()
    expect(card(screen.getByRole('region', { name: 'Key numbers' }), 'Conversations')).toHaveTextContent('0none the week before')
    expect(screen.queryByRole('img', { name: /^Bar chart/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try the chat as a customer' })).toHaveAttribute('href', '/')
  })
})

describe('on a phone', () => {
  beforeEach(() => setMobile(true))

  it('puts the amber card first, then the numbers two by two', async () => {
    open()
    const amber = await screen.findByRole('link', { name: /Need your attention/ })

    expect(amber).toHaveTextContent("5Need your attention3 couldn't answer, 2 unanswered")
    expect(amber).toHaveAttribute('href', '/admin/conversations?filter=attention')
    const region = screen.getByRole('region', { name: 'Key numbers' })
    expect(within(region).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Conversations48', '/admin/conversations'],
      ['Answered186', '/admin/conversations'],
      ['Documents9', '/admin/knowledge'],
      ['Customers31', '/admin/customers'],
    ])
    expect(amber.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('uses the short range names, and keeps the heading for screen readers', async () => {
    open()
    const group = await screen.findByRole('group', { name: 'Date range' })

    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Today', '7 days', '30 days'])
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' }).closest('.sr-only')).not.toBeNull()
  })

  it('lists conversations needing attention without emails', async () => {
    open()
    const row = await screen.findByRole('link', { name: /Do you sell silk evening gowns/ })

    expect(row).toHaveTextContent("Couldn't answer")
    expect(row).not.toHaveTextContent('chioma.o@example.com')
  })

  it('"Needs" for one conversation', async () => {
    open({ 'GET /admin/stats': { status: 200, body: statsBody({ needs_attention: { total: 1, couldnt_answer: 0, unanswered: 1 } }) } })
    await waitFor(() => expect(screen.getByRole('link', { name: /Needs your attention/ })).toHaveTextContent('1Needs your attention1 unanswered'))
  })
})
