import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'

import { AppRoutes } from '../../Root.jsx'
import { ADMIN_ME, STATS, USERS, adminUser, usersBody } from '../../test/adminFixtures.js'
import { callsTo, deferred, fakeFetch } from '../../test/fakeApi.js'
import { setMobile } from '../../test/setup.js'
import { ADMIN_TOKEN_KEY } from '../session.jsx'

let location
function Where() {
  location = useLocation()
  return null
}
const here = () => location.pathname + location.search

function open(path = '/admin/customers', routes = {}) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token')
  const fetch = fakeFetch({
    'GET /auth/me': ADMIN_ME,
    'GET /admin/stats': STATS,
    'GET /admin/users': USERS,
    'GET /admin/conversations': { status: 200, body: { items: [], total: 0, limit: 20, offset: 0, counts: { all: 0, attention: 0, resolved: 0 } } },
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

const table = () => screen.findByRole('table')
const usersQuery = (fetch) => new URL(callsTo(fetch, 'GET', '/admin/users').at(-1)[0]).searchParams

describe('the customer table', () => {
  describe('on a fixed day', () => {
    // Only the date is fixed (to 16:00 UTC on Wednesday 28 October), so timers run as usual
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-28T16:00:00Z'), toFake: ['Date'] }))
    afterEach(() => vi.useRealTimers())

    it('shows the email, role, conversations, last active and joined, in the store time zone', async () => {
      open()
      const rows = within(await table()).getAllByRole('row')

      expect(within(rows[0]).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Email', 'Role', 'Conversations', 'Last active', 'Joined'])
      await waitFor(() => expect(rows[1]).toHaveTextContent('12 Oct 2026')) // once the time zone is known
      // 13:24 UTC is 14:24 in Lagos
      expect(within(rows[1]).getAllByRole('cell').map((td) => td.textContent)).toEqual(['chioma.o@example.com', 'Customer', '3', 'Today, 14:24', '12 Oct 2026'])
      expect(rows[2]).toHaveTextContent('Never') // never wrote a message
      expect(screen.getByText('accounts').parentElement).toHaveTextContent('3 accounts')
    })
  })

  it('shows only these fields: no id, no password, nothing else', async () => {
    open('/admin/customers', {
      'GET /admin/users': { status: 200, body: usersBody([{ ...adminUser(), hashed_password: 'secret-hash', id: 777 }]) },
    })
    const row = within(await table()).getAllByRole('row')[1]
    expect(within(row).getAllByRole('cell')).toHaveLength(5)
    expect(row).not.toHaveTextContent('secret-hash')
    expect(row).not.toHaveTextContent('777')
  })

  it("a customer's email links to their conversations; an admin's is a badge and no link", async () => {
    open()
    const rows = within(await table())

    expect(rows.getByRole('link', { name: 'chioma.o@example.com' })).toHaveAttribute('href', '/admin/conversations?q=chioma.o%40example.com')
    const adminRow = rows.getByText('abraham@example.com').closest('tr')
    expect(within(adminRow).queryByRole('link')).not.toBeInTheDocument()
    expect(within(adminRow).getByText('Admin')).toHaveClass('bg-sa-ink')
  })

  it('following an email opens Conversations searched by it', async () => {
    const { fetch, user } = open()
    await user.click(await screen.findByRole('link', { name: 'chioma.o@example.com' }))

    expect(here()).toBe('/admin/conversations?q=chioma.o%40example.com')
    expect(await screen.findByRole('searchbox', { name: 'Search conversations' })).toHaveValue('chioma.o@example.com')
    await waitFor(() => expect(new URL(callsTo(fetch, 'GET', '/admin/conversations').at(-1)[0]).searchParams.get('q')).toBe('chioma.o@example.com'))
  })

  it('emails are plain text: <script> and <img onerror> show as text', async () => {
    const script = '<script>window.hacked = true</script>@example.com'
    const img = '<img src=x onerror="window.hacked = true">@example.com'
    open('/admin/customers', {
      'GET /admin/users': { status: 200, body: usersBody([adminUser({ email: script }), adminUser({ id: 9, email: img, role: 'admin' })]) },
    })
    await table()

    expect(screen.getByRole('link', { name: script })).toBeInTheDocument()
    expect(screen.getByText(img)).toBeInTheDocument()
    expect(document.querySelector('main script, main img')).toBeNull()
    expect(window.hacked).toBeUndefined()
  })
})

describe('search and paging', () => {
  it('search waits for typing to pause, and is kept in the address', async () => {
    const { fetch, user } = open('/admin/customers?page=2', { 'GET /admin/users': { status: 200, body: usersBody(USERS.body.items, 45) } })
    await table()
    const before = callsTo(fetch, 'GET', '/admin/users').length

    await user.type(screen.getByRole('searchbox', { name: 'Search by email' }), 'chioma')
    expect(callsTo(fetch, 'GET', '/admin/users')).toHaveLength(before)

    await waitFor(() => expect(usersQuery(fetch).get('q')).toBe('chioma'))
    expect(callsTo(fetch, 'GET', '/admin/users')).toHaveLength(before + 1)
    expect(usersQuery(fetch).get('offset')).toBe('0') // a new search starts at page 1
    expect(here()).toBe('/admin/customers?q=chioma')
  })

  it('a search in the address fills the box', async () => {
    const { fetch } = open('/admin/customers?q=tunde')
    expect(await screen.findByRole('searchbox', { name: 'Search by email' })).toHaveValue('tunde')
    await waitFor(() => expect(usersQuery(fetch).get('q')).toBe('tunde'))
  })

  it('pages through long lists, kept in the address', async () => {
    const { fetch, user } = open('/admin/customers', { 'GET /admin/users': { status: 200, body: usersBody(USERS.body.items, 45) } })
    const pages = await screen.findByRole('navigation', { name: 'Pages' })
    expect(pages).toHaveTextContent('Showing 1 to 20 of 45')
    expect(within(pages).getByRole('button', { name: 'Previous' })).toHaveAttribute('aria-disabled', 'true')

    await user.click(within(pages).getByRole('button', { name: 'Next' }))

    expect(here()).toBe('/admin/customers?page=2')
    await waitFor(() => expect(usersQuery(fetch).get('offset')).toBe('20'))
    expect(await screen.findByRole('navigation', { name: 'Pages' })).toHaveTextContent('Showing 21 to 40 of 45')
  })

  it('Next keeps focus while the next page loads, showing the last page meanwhile', async () => {
    const reply = deferred()
    let calls = 0
    const long = { status: 200, body: usersBody(USERS.body.items, 45) }
    const { user } = open('/admin/customers', { 'GET /admin/users': () => (++calls === 1 ? long : reply.promise) })
    const next = within(await screen.findByRole('navigation', { name: 'Pages' })).getByRole('button', { name: 'Next' })
    next.focus()

    await user.keyboard('{Enter}')

    expect(next).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Customer table' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Loading customers…')).not.toBeInTheDocument()
    await act(async () => reply.resolve(long))
    expect(screen.getByRole('region', { name: 'Customer table' })).toHaveAttribute('aria-busy', 'false')
    expect(next).toHaveFocus()
  })

  it('a page past the end offers the first page', async () => {
    const { user } = open('/admin/customers?page=9', { 'GET /admin/users': { status: 200, body: usersBody([], 45) } })
    await user.click(await screen.findByRole('button', { name: 'Go to the first page' }))
    expect(here()).toBe('/admin/customers')
  })
})

describe('states', () => {
  it('loading, then an error with Try again', async () => {
    let calls = 0
    const reply = deferred()
    const { user } = open('/admin/customers', { 'GET /admin/users': () => (++calls === 1 ? reply.promise : USERS) })
    expect(await screen.findByText('Loading customers…')).toHaveAttribute('role', 'status')
    await act(async () => reply.resolve({ status: 500, body: { detail: 'Something went wrong.' } }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the customers")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await table()).toBeInTheDocument()
  })

  it('no customers yet', async () => {
    open('/admin/customers', { 'GET /admin/users': { status: 200, body: usersBody([]) } })
    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
  })

  it('no search results, with Clear search', async () => {
    const { user } = open('/admin/customers?q=kaftan', { 'GET /admin/users': { status: 200, body: usersBody([]) } })
    expect(await screen.findByText('No accounts match “kaftan”')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(here()).toBe('/admin/customers')
  })
})

describe('on a phone', () => {
  beforeEach(() => setMobile(true))

  it('the table scrolls inside its own box, which the keyboard can reach', async () => {
    open()
    const box = await screen.findByRole('region', { name: 'Customer table' })
    expect(box).toHaveClass('overflow-x-auto', 'relative')
    expect(box).toHaveAttribute('tabindex', '0')
    expect(within(box).getByRole('table')).toHaveClass('min-w-sa-table-wide')
  })

  it('email links and paging buttons are 44px targets', async () => {
    open('/admin/customers', { 'GET /admin/users': { status: 200, body: usersBody(USERS.body.items, 45) } })
    expect(await screen.findByRole('link', { name: 'chioma.o@example.com' })).toHaveClass('min-h-sa-touch')
    expect(screen.getByRole('button', { name: 'Next' })).toHaveClass('h-sa-touch')
  })
})
