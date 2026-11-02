import { useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useIsMobile } from '../../hooks/useIsMobile.js'
import { Paging, SearchBox } from '../controls.jsx'
import { count, lastActive, longDate } from '../format.js'
import { useStoreStats } from '../storeStats.jsx'
import { useLoad } from '../useLoad.js'
import { PageHeader } from './Pages.jsx'

const PAGE_SIZE = 20

const outlineButton =
  'inline-flex h-sa-touch sm:h-sa-control-lg cursor-pointer items-center self-start rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-4 font-sa-sans text-sa-body font-medium text-sa-ink'

// The page's state lives in the address: ?q=chioma&page=2
function readRequest(params) {
  const q = (params.get('q') ?? '').trim()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  return { q, page }
}

// Their conversations: the Conversations page, searched by their email
const conversationsOf = (email) => `/admin/conversations?${new URLSearchParams({ q: email })}`

// Every account, from GET /admin/users. Emails are customer text: React
// shows them as plain text, never as HTML.
function CustomersTable({ list, request, timeZone, onPage, onClearSearch, phone }) {
  const message = 'flex flex-col gap-sa-1 px-sa-4 py-sa-6'
  // Moving to another page or search keeps the last page showing until the
  // new one arrives, so the button that was pressed keeps focus
  const busy = list.status === 'loading' && Boolean(list.data)
  if (list.status === 'loading' && !busy) return <p role="status" className="m-0 px-sa-4 py-sa-6 text-sa-ink-muted">Loading customers…</p>
  if (list.status === 'error') {
    return (
      <div role="alert" className={`${message} gap-sa-3`}>
        <p className="m-0 font-semibold">We couldn&apos;t load the customers</p>
        <p className="m-0 text-sa-small text-sa-ink-muted">{list.message}</p>
        <button type="button" onClick={list.retry} className={outlineButton}>Try again</button>
      </div>
    )
  }
  const { items, total } = list.data
  if (items.length === 0) {
    if (request.page > 1 && total > 0) {
      return (
        <div className={message}>
          <p className="m-0 font-semibold">There&apos;s nothing on page {request.page}</p>
          <button type="button" onClick={() => onPage(1)} className={`${outlineButton} mt-sa-2`}>Go to the first page</button>
        </div>
      )
    }
    return (
      <div className={message}>
        {request.q ? (
          <>
            <p className="m-0 font-semibold">No accounts match “{request.q}”</p>
            <p className="m-0 text-sa-small text-sa-ink-muted">Try part of the email address.</p>
            <button type="button" onClick={onClearSearch} className={`${outlineButton} mt-sa-2`}>Clear search</button>
          </>
        ) : (
          <>
            <p className="m-0 font-semibold">No customers yet</p>
            <p className="m-0 text-sa-small text-sa-ink-muted">When people create an account in the store&apos;s chat, they show up here.</p>
          </>
        )}
      </div>
    )
  }
  const cell = 'px-sa-4 py-sa-3'
  return (
    <>
      {/* Scrolls sideways inside its own box on narrow screens (focusable,
          so the keyboard can scroll it; relative, so nothing in it can
          widen the page) */}
      <div role="region" aria-label="Customer table" aria-busy={busy} tabIndex={0} className="relative overflow-x-auto">
        <table className="w-full min-w-sa-table-wide border-collapse text-left">
          <thead>
            <tr className="bg-sa-surface-muted text-sa-caption text-sa-ink-muted">
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Email</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Role</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 text-right font-semibold">Conversations</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Last active</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => {
              const admin = u.role === 'admin'
              return (
                <tr key={u.id} className="border-t border-sa-line-soft">
                  <td className={cell}>
                    {admin ? (
                      <span className="break-all font-semibold">{u.email}</span>
                    ) : (
                      <Link to={conversationsOf(u.email)} className={`break-all font-semibold text-sa-ink ${phone ? 'inline-flex min-h-sa-touch items-center' : ''}`}>
                        {u.email}
                      </Link>
                    )}
                  </td>
                  <td className={cell}>
                    {admin ? (
                      <span className="rounded-sa-pill bg-sa-ink px-sa-2 py-sa-0.5 text-sa-caption font-semibold text-sa-surface">Admin</span>
                    ) : (
                      'Customer'
                    )}
                  </td>
                  <td className={`${cell} text-right font-sa-mono`}>{u.conversation_count}</td>
                  <td className={`${cell} text-sa-ink-muted`}>
                    {timeZone && (u.last_active ? lastActive(u.last_active, { timeZone }) : 'Never')}
                  </td>
                  <td className={`${cell} text-sa-ink-muted`}>{timeZone && longDate(u.created_at, timeZone)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <Paging page={request.page} pageSize={PAGE_SIZE} total={total} onPage={onPage} phone={phone}
          summary={(first, last, all) => `Showing ${first} to ${last} of ${all}`} />
      )}
    </>
  )
}

export default function CustomersPage() {
  const phone = useIsMobile()
  const { timeZone } = useStoreStats()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const request = readRequest(params)

  const go = useCallback((next, options) => {
    const search = new URLSearchParams()
    if (next.q) search.set('q', next.q)
    if (next.page > 1) search.set('page', String(next.page))
    const text = search.toString()
    navigate(`/admin/customers${text ? `?${text}` : ''}`, options)
  }, [navigate])
  const onSearch = useCallback((q) => go({ q, page: 1 }, { replace: true }), [go])

  const list = useLoad(`/admin/users?limit=${PAGE_SIZE}&offset=${(request.page - 1) * PAGE_SIZE}${request.q ? `&q=${encodeURIComponent(request.q)}` : ''}`)
  // The count keeps its last value while a new page loads
  const total = useRef(null)
  if (list.status === 'ready') total.current = list.data.total

  return (
    <div className={`flex flex-col ${phone ? 'gap-sa-3' : 'gap-sa-5'}`}>
      <PageHeader title="Customers" description="People who have signed in to chat with the assistant." srOnly={phone} />

      <section aria-label="Customer list" className="overflow-hidden rounded-sa-lg border border-sa-line bg-sa-surface">
        <div className={`flex flex-wrap items-center gap-sa-3 border-b border-sa-line ${phone ? 'p-sa-3' : 'px-sa-4 py-sa-3'}`}>
          {total.current != null && (
            <span>
              <span className="font-sa-mono font-medium">{total.current}</span>{' '}
              <span className="text-sa-ink-muted">{count(total.current, 'account').replace(/^\d+ /, '')}</span>
            </span>
          )}
          <div className={phone ? 'w-full' : 'ml-auto'}>
            <SearchBox q={request.q} onSearch={onSearch} label="Search by email" placeholder="Search by email"
              size={phone ? 'h-sa-control-xl w-full' : 'h-sa-control-md w-sa-search-md max-w-full'} />
          </div>
        </div>
        <CustomersTable
          list={list}
          request={request}
          timeZone={timeZone}
          phone={phone}
          onPage={(page) => go({ ...request, page })}
          onClearSearch={() => go({ q: '', page: 1 })}
        />
      </section>

      <p className="m-0 text-sa-small text-sa-ink-muted">
        Customers&apos; passwords are never shown here. Giving someone admin access is done by your developer, so a stolen
        customer account can&apos;t make itself an admin.
      </p>
    </div>
  )
}
