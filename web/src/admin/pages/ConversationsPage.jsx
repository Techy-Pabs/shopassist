import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { useIsMobile } from '../../hooks/useIsMobile.js'
import { count, dayAndTime, longDate, shortTime, startedAt, storeDay } from '../format.js'
import { BackIcon, CheckIcon, ReopenIcon, SearchIcon, WarningIcon } from '../icons.jsx'
import { useAdminSession } from '../session.jsx'
import { useStoreStats } from '../storeStats.jsx'
import { NO_ANSWER, useLoad } from '../useLoad.js'
import { PageHeader } from './Pages.jsx'

// The list's tabs, as /admin/conversations?filter= names them
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'resolved', label: 'Resolved' },
]
const PAGE_SIZE = 20
// How long typing pauses before the search runs
export const SEARCH_DELAY = 300

// The list's state lives in the address: ?filter=attention&q=lagos&page=2
function readList(params) {
  const filter = FILTERS.some((f) => f.value === params.get('filter')) ? params.get('filter') : 'all'
  const q = (params.get('q') ?? '').trim()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  return { filter, q, page }
}

// "?filter=attention&q=lagos", leaving out the defaults
function listSearch({ filter, q, page }) {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const text = params.toString()
  return text ? `?${text}` : ''
}

const conversationPath = (id, list) => `/admin/conversations/${id}${listSearch(list)}`
const titleOf = (conversation) => conversation.title || 'Untitled conversation'

const panel = 'rounded-sa-lg border border-sa-line bg-sa-surface'
const outlineButton =
  'inline-flex cursor-pointer items-center justify-center gap-sa-2 rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-3.5 font-sa-sans text-sa-body font-medium text-sa-ink aria-disabled:cursor-default aria-disabled:text-sa-ink-muted'

// The search box. The address changes once typing pauses, replacing the
// history entry (so Back doesn't step through every letter).
function SearchBox({ q, onSearch, phone }) {
  const [text, setText] = useState(q)
  const id = useId()

  // Back and forward change the address: show what it says
  useEffect(() => {
    setText((current) => (current.trim() === q ? current : q))
  }, [q])

  useEffect(() => {
    if (text.trim() === q) return undefined
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [text, q, onSearch])

  return (
    <div
      className={`flex ${phone ? 'h-sa-control-xl w-full' : 'h-sa-control-lg w-sa-search max-w-full'} items-center gap-sa-2 rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-3 text-sa-ink-muted focus-within:outline focus-within:outline-ring focus-within:outline-offset-ring focus-within:outline-sa-accent`}
    >
      <SearchIcon />
      <label htmlFor={id} className="sr-only">Search conversations</label>
      <input
        id={id}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search by question or email"
        className="h-full min-w-0 flex-1 border-0 bg-transparent font-sa-sans text-sa-body text-sa-ink focus-visible:outline-0"
      />
    </div>
  )
}

// The filter tabs: arrow keys, Home and End move between them (and choose
// the tab, so the list follows). Only the chosen tab is in the Tab order.
function FilterTabs({ filter, counts, onChange, ids, phone }) {
  const tabs = useRef({})
  function onKeyDown(event) {
    const at = FILTERS.findIndex((f) => f.value === filter)
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: FILTERS.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    const next = FILTERS[(to + FILTERS.length) % FILTERS.length].value
    onChange(next)
    tabs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label="Filter conversations" onKeyDown={onKeyDown}
      className="flex shrink-0 gap-sa-1 overflow-x-auto border-b border-sa-line-soft px-sa-4 py-sa-3">
      {FILTERS.map(({ value, label }) => {
        const on = value === filter
        return (
          <button
            key={value}
            ref={(element) => (tabs.current[value] = element)}
            id={`${ids}-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${ids}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(value)}
            className={`flex ${phone ? 'h-sa-touch' : 'h-sa-control'} shrink-0 cursor-pointer items-center gap-sa-1 rounded-sa-pill border px-sa-2.5 font-sa-sans text-sa-small ${
              on ? 'border-sa-ink bg-sa-ink font-medium text-sa-surface' : 'border-sa-line bg-sa-surface text-sa-ink hover:border-sa-line-strong'
            }`}
          >
            {label}
            {counts && <span className={on ? 'font-sa-mono' : 'font-sa-mono text-sa-ink-muted'}>{counts[value]}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function StatusBadge({ conversation }) {
  const chip = 'rounded-sa-pill px-sa-2 py-sa-0.25 text-sa-caption font-semibold'
  if (conversation.status === 'resolved') return <span className={`${chip} bg-sa-surface-sunken text-sa-ink-muted`}>Resolved</span>
  if (conversation.attention_reason === 'couldnt_answer') return <span className={`${chip} bg-sa-attention-tint text-sa-attention`}>Couldn&apos;t answer</span>
  if (conversation.attention_reason === 'unanswered') return <span className={`${chip} bg-sa-danger-tint text-sa-danger-ink`}>Unanswered</span>
  return null
}

// Up and down arrows (and Home and End) move between the list's links
function moveBetweenLinks(event) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
  if (step === undefined && event.key !== 'Home' && event.key !== 'End') return
  const links = [...event.currentTarget.querySelectorAll('a')]
  const at = links.indexOf(document.activeElement)
  if (at === -1) return
  event.preventDefault()
  const to = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : Math.min(links.length - 1, Math.max(0, at + step))
  links[to].focus()
}

function emptyMessage({ filter, q }) {
  if (q) return { title: `No conversations match “${q}”`, text: 'Try other words, or search for an email address.' }
  if (filter === 'attention') return { title: 'No conversations need your attention', text: "When the assistant can't answer a question, or a question gets no reply, it shows up here." }
  if (filter === 'resolved') return { title: 'No resolved conversations yet', text: 'Conversations you mark as resolved show up here.' }
  return { title: 'No conversations yet', text: 'When customers chat with the assistant, their conversations show up here.' }
}

// The list of conversations, as the tabs' panel. Titles and emails are
// customer text: React shows them as plain text, never as HTML.
function ConversationList({ list, request, selectedId, timeZone, ids, onPage, onClearSearch, focusId }) {
  const items = list.status === 'ready' ? list.data.items : []
  const body = useRef(null)

  // Back from a conversation on a phone: focus its row again
  useEffect(() => {
    if (focusId && list.status === 'ready') body.current?.querySelector(`[data-conversation="${focusId}"]`)?.focus()
  }, [focusId, list.status])

  const message = 'flex flex-col gap-sa-1 px-sa-4 py-sa-5'
  return (
    <div ref={body} role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${request.filter}`}
      tabIndex={items.length ? undefined : 0} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {list.status === 'loading' && <p role="status" className="m-0 px-sa-4 py-sa-5 text-sa-ink-muted">Loading conversations…</p>}
      {list.status === 'error' && (
        <div role="alert" className={`${message} gap-sa-3`}>
          <p className="m-0 font-semibold">We couldn&apos;t load the conversations</p>
          <p className="m-0 text-sa-small text-sa-ink-muted">{list.message}</p>
          <button type="button" onClick={list.retry} className={`${outlineButton} h-sa-control-lg self-start`}>Try again</button>
        </div>
      )}
      {list.status === 'ready' && items.length === 0 && (
        request.page > 1 ? (
          <div className={message}>
            <p className="m-0 font-semibold">There&apos;s nothing on page {request.page}</p>
            <button type="button" onClick={() => onPage(1)} className={`${outlineButton} mt-sa-2 h-sa-control-lg self-start`}>Go to the first page</button>
          </div>
        ) : (
          <div className={message}>
            <p className="m-0 font-semibold">{emptyMessage(request).title}</p>
            <p className="m-0 text-sa-small text-sa-ink-muted">{emptyMessage(request).text}</p>
            {request.q && (
              <button type="button" onClick={onClearSearch} className={`${outlineButton} mt-sa-2 h-sa-control-lg self-start`}>Clear search</button>
            )}
          </div>
        )
      )}
      {items.length > 0 && (
        <ul onKeyDown={moveBetweenLinks} className="m-0 list-none p-0">
          {items.map((c) => {
            const selected = String(c.id) === selectedId
            return (
              <li key={c.id}>
                <Link
                  to={conversationPath(c.id, request)}
                  data-conversation={c.id}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex flex-col gap-sa-1 border-b border-sa-line-soft px-sa-4 py-sa-3.5 text-sa-ink no-underline hover:text-sa-ink ${
                    selected ? 'bg-sa-accent-wash shadow-sa-selected' : 'hover:bg-sa-surface-muted'
                  }`}
                >
                  <span className="flex justify-between gap-sa-3">
                    <span className="min-w-0 break-all font-semibold">{c.owner_email}</span>
                    {timeZone && (
                      <time dateTime={c.last_activity} className="shrink-0 whitespace-nowrap text-sa-caption text-sa-ink-muted">
                        {shortTime(c.last_activity, { timeZone })}
                      </time>
                    )}
                  </span>
                  <span className="break-words">{titleOf(c)}</span>
                  <span className="flex items-center gap-sa-2 text-sa-caption text-sa-ink-muted">
                    <StatusBadge conversation={c} />
                    {count(c.message_count, 'message')}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {list.status === 'ready' && list.data.total > PAGE_SIZE && (
        <Paging page={request.page} total={list.data.total} onPage={onPage} />
      )}
    </div>
  )
}

function Paging({ page, total, onPage }) {
  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(total, page * PAGE_SIZE)
  const button = `${outlineButton} h-sa-control-md px-sa-3 text-sa-small`
  return (
    <nav aria-label="Pages" className="mt-auto flex items-center justify-between gap-sa-3 border-t border-sa-line-soft px-sa-4 py-sa-3">
      <span className="text-sa-small text-sa-ink-muted">{first}–{last} of {total}</span>
      <span className="flex gap-sa-2">
        <button type="button" className={button} aria-disabled={page === 1} onClick={() => page > 1 && onPage(page - 1)}>Previous</button>
        <button type="button" className={button} aria-disabled={last >= total} onClick={() => last < total && onPage(page + 1)}>Next</button>
      </span>
    </nav>
  )
}

// "Answered from": each document once, linked while it's still in the knowledge
function Sources({ sources }) {
  const seen = new Set()
  const unique = sources.filter((s) => {
    const key = s.document_id ?? `deleted:${s.document_name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!unique.length) return null
  return (
    <p className="m-0 flex flex-wrap justify-end gap-x-sa-1.5 text-sa-caption text-sa-ink-muted">
      Answered from
      {unique.map((s, i) => (
        <span key={s.document_id ?? s.document_name}>
          {s.document_id ? (
            <Link to={`/admin/knowledge?document=${s.document_id}`}>{s.document_name}</Link>
          ) : (
            <>{s.document_name} (removed from the knowledge)</>
          )}
          {i < unique.length - 1 && ','}
        </span>
      ))}
    </p>
  )
}

// Every message, with the day and time above each day's first one
function Messages({ messages, timeZone }) {
  let lastDay = null
  return messages.map((m) => {
    const day = timeZone && storeDay(m.created_at, timeZone)
    const newDay = day && day !== lastDay
    lastDay = day
    const customer = m.role === 'user'
    return (
      <div key={m.id} className="contents">
        {newDay && <p className="m-0 self-center text-sa-caption text-sa-ink-muted">{dayAndTime(m.created_at, { timeZone })}</p>}
        <div className={`flex max-w-sa-bubble flex-col gap-sa-1 ${customer ? '' : 'self-end'}`}>
          {customer ? (
            <span className="text-sa-caption text-sa-ink-muted">Customer</span>
          ) : (
            <span className="flex justify-end gap-sa-2 text-sa-caption text-sa-ink-muted">
              Assistant
              {m.outcome === 'no_info' && <span className="font-semibold text-sa-attention">Couldn&apos;t answer</span>}
            </span>
          )}
          <p className={`m-0 whitespace-pre-wrap break-words rounded-sa-lg border px-sa-3.5 py-sa-2.5 ${customer ? 'border-sa-line bg-sa-surface' : 'border-sa-accent-line bg-sa-accent-tint'}`}>
            {m.content}
          </p>
          {!customer && <Sources sources={m.sources} />}
        </div>
      </div>
    )
  })
}

function AttentionBanner({ conversation, phone }) {
  if (conversation.status !== 'needs_attention') return null
  const couldnt = conversation.attention_reason === 'couldnt_answer'
  return (
    <div className="mt-sa-2 flex flex-wrap items-center gap-sa-3 rounded-sa-lg border border-sa-attention-line bg-sa-attention-wash px-sa-4 py-sa-3.5">
      <span className="text-sa-attention"><WarningIcon /></span>
      <span className="min-w-0 grow basis-sa-panel-basis">
        {couldnt
          ? "The assistant couldn't answer a question here. If you sell this, add it to your knowledge."
          : "The customer's latest question has no reply yet. The assistant may have been unavailable."}
      </span>
      {couldnt && (
        <Link to="/admin/knowledge" className={`inline-flex ${phone ? 'h-sa-touch' : 'h-sa-control-md'} items-center rounded-sa-md bg-sa-accent px-sa-3.5 font-semibold text-sa-surface no-underline hover:text-sa-surface`}>
          Add to knowledge
        </Link>
      )}
    </div>
  )
}

// "Mark as resolved" or "Reopen". The page changes only once the server
// confirms; until then the button says what it's doing.
function ResolveButton({ conversation, action, onToggle, phone }) {
  const resolved = conversation.status === 'resolved'
  const pending = action.status === 'pending'
  return (
    <button type="button" onClick={onToggle} aria-disabled={pending}
      className={`${outlineButton} ${phone ? 'h-sa-touch' : 'h-sa-control-lg'}`}>
      {resolved ? <ReopenIcon /> : <CheckIcon />}
      {pending ? (resolved ? 'Reopening…' : 'Marking as resolved…') : resolved ? 'Reopen' : 'Mark as resolved'}
    </button>
  )
}

function ThreadMessage({ heading, title, children, role }) {
  return (
    <div role={role} className="flex flex-col gap-sa-2 p-sa-6">
      <h2 ref={heading} tabIndex={-1} className="m-0 text-sa-heading outline-none">{title}</h2>
      {children}
    </div>
  )
}

// One conversation: every message, its outcome and sources, and the
// resolve button. Message text is plain text, never HTML.
function Thread({ id, thread, timeZone, backTo, phone, onChanged }) {
  const { api } = useAdminSession()
  const [action, setAction] = useState({ status: 'idle' })
  const [announcement, setAnnouncement] = useState('')
  const heading = useRef(null)
  const current = useRef(id)
  current.current = id

  useEffect(() => {
    setAction({ status: 'idle' })
    setAnnouncement('')
  }, [id])

  // On a phone the thread is its own screen: focus its heading when it opens
  const settled = thread.status !== 'loading'
  useEffect(() => {
    if (phone && settled) heading.current?.focus()
  }, [phone, id, settled])

  async function toggle() {
    if (action.status === 'pending') return
    const resolved = thread.data.conversation.status === 'resolved'
    setAction({ status: 'pending' })
    const result = await api.request('POST', `/admin/conversations/${id}/${resolved ? 'reopen' : 'resolve'}`)
    if (current.current !== id) return
    if (!result.ok) {
      if (result.kind !== 'session-ended') {
        const failed = resolved ? "We couldn't reopen this conversation." : "We couldn't mark this conversation as resolved."
        setAction({ status: 'error', message: `${failed} ${result.kind === 'network' ? NO_ANSWER : result.message}` })
      }
      return
    }
    // Confirmed: show the conversation as the server now has it
    const fresh = await api.request('GET', `/admin/conversations/${id}`)
    if (current.current !== id) return
    if (fresh.ok) thread.replace(fresh.data)
    else thread.refresh()
    setAction({ status: 'idle' })
    setAnnouncement(resolved ? 'Reopened.' : 'Marked as resolved.')
    onChanged()
  }

  const back = <Link to={backTo}>Back to all conversations</Link>
  const notFound = !/^\d+$/.test(id) || thread.httpStatus === 404
  if (notFound) {
    return (
      <ThreadMessage heading={heading} title="Conversation not found">
        <p className="m-0 text-sa-ink-muted">There&apos;s no conversation at this address. It may have been deleted.</p>
        {back}
      </ThreadMessage>
    )
  }
  if (thread.status === 'loading') return <p role="status" className="m-0 p-sa-6 text-sa-ink-muted">Loading the conversation…</p>
  if (thread.status === 'error') {
    return (
      <ThreadMessage heading={heading} title="We couldn't load this conversation" role="alert">
        <p className="m-0 text-sa-ink-muted">{thread.message}</p>
        <button type="button" onClick={thread.retry} className={`${outlineButton} h-sa-control-lg self-start`}>Try again</button>
      </ThreadMessage>
    )
  }
  if (thread.status !== 'ready') return null

  const { conversation, messages } = thread.data
  const side = phone ? 'px-sa-4' : 'px-sa-6'
  return (
    <section aria-label={`Conversation with ${conversation.owner_email}`} className="flex min-h-0 flex-1 flex-col">
      <div className={`flex flex-wrap items-center justify-between gap-sa-3 border-b border-sa-line bg-sa-surface ${side} py-sa-3.5`}>
        <div className="flex min-w-0 flex-col">
          <h2 ref={heading} tabIndex={-1} className="m-0 break-words text-sa-heading outline-none">{titleOf(conversation)}</h2>
          <span className="flex flex-wrap items-center gap-sa-2 text-sa-small text-sa-ink-muted">
            {timeZone && `Started ${startedAt(conversation.created_at, { timeZone })} · `}
            {count(conversation.message_count, 'message')}
            {conversation.status === 'resolved' && <StatusBadge conversation={conversation} />}
          </span>
        </div>
        <ResolveButton conversation={conversation} action={action} onToggle={toggle} phone={phone} />
        {action.status === 'error' && (
          <p role="alert" className="m-0 basis-full text-sa-small font-medium text-sa-danger-ink">{action.message}</p>
        )}
        <p role="status" className="sr-only">{announcement}</p>
      </div>
      <div className={`flex flex-1 flex-col gap-sa-4 ${phone ? 'p-sa-4' : 'overflow-y-auto p-sa-6'}`}>
        {messages.length === 0 && <p className="m-0 text-sa-ink-muted">No messages in this conversation yet.</p>}
        <Messages messages={messages} timeZone={timeZone} />
        <AttentionBanner conversation={conversation} phone={phone} />
      </div>
    </section>
  )
}

// Who the customer is, from the conversation's summary
function CustomerPanel({ customer, timeZone, request, phone }) {
  const overline = 'm-0 text-sa-overline uppercase text-sa-ink-muted'
  const facts = [
    ['Conversations', customer.conversation_count],
    ['Questions asked', customer.questions_asked],
    ["Couldn't answer", customer.couldnt_answer],
  ]
  return (
    <aside aria-label="Customer details"
      className={`flex flex-col gap-sa-5 bg-sa-surface p-sa-5 ${phone ? 'border-t border-sa-line' : 'min-w-0 max-w-sa-panel grow basis-sa-panel-basis overflow-y-auto border-l border-sa-line'}`}>
      <div className="flex flex-col gap-sa-1">
        <h2 className={overline}>Customer</h2>
        <span className="break-all font-semibold">{customer.email}</span>
        {timeZone && <span className="text-sa-small text-sa-ink-muted">Account since {longDate(customer.joined, timeZone)}</span>}
      </div>
      <dl className="m-0 flex flex-col gap-sa-2.5 text-sa-small">
        {facts.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-sa-3">
            <dt className="text-sa-ink-muted">{label}</dt>
            <dd className="m-0 font-sa-mono">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-sa-2 border-t border-sa-line-soft pt-sa-4">
        <h2 className={overline}>Earlier conversations</h2>
        {customer.earlier_conversations.length === 0 && <p className="m-0 text-sa-small text-sa-ink-muted">None yet</p>}
        {customer.earlier_conversations.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-sa-2 p-0">
            {customer.earlier_conversations.map((e) => (
              <li key={e.id}>
                <Link to={conversationPath(e.id, request)} className={`flex flex-col text-sa-ink no-underline hover:text-sa-accent ${phone ? 'min-h-sa-touch justify-center' : ''}`}>
                  <span className="break-words">{titleOf(e)}</span>
                  {timeZone && <span className="text-sa-caption text-sa-ink-muted">{shortTime(e.last_activity, { timeZone })}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

export default function ConversationsPage() {
  const phone = useIsMobile()
  const { conversationId: id = null } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const request = readList(params)
  const { timeZone, refresh: refreshStats } = useStoreStats()
  const ids = useId()

  const list = useLoad(
    `/admin/conversations?filter=${request.filter}&limit=${PAGE_SIZE}&offset=${(request.page - 1) * PAGE_SIZE}${request.q ? `&q=${encodeURIComponent(request.q)}` : ''}`,
  )
  const thread = useLoad(id && /^\d+$/.test(id) ? `/admin/conversations/${id}` : null)

  // The tabs keep their last counts while a new list loads
  const counts = useRef(null)
  if (list.status === 'ready') counts.current = list.data.counts

  // Changing the list keeps the open conversation; a new filter or search starts at page 1
  const here = id ? `/admin/conversations/${id}` : '/admin/conversations'
  const go = useCallback((next, options) => navigate(`${here}${listSearch(next)}`, options), [navigate, here])
  const { filter } = request
  const onSearch = useCallback((q) => go({ filter, q, page: 1 }, { replace: true }), [go, filter])

  // On a phone, coming back from a conversation focuses its row in the list
  const [returnFrom, setReturnFrom] = useState(null)
  const lastId = useRef(id)
  useEffect(() => {
    if (lastId.current && !id) setReturnFrom(lastId.current)
    lastId.current = id
  }, [id])

  const { refresh: refreshList } = list
  const onChanged = useCallback(() => {
    refreshList()
    refreshStats()
  }, [refreshList, refreshStats])

  const listPanel = (
    <>
      <FilterTabs filter={request.filter} counts={counts.current} ids={ids} phone={phone} onChange={(filter) => go({ ...request, filter, page: 1 })} />
      <ConversationList
        list={list}
        request={request}
        selectedId={id}
        timeZone={timeZone}
        ids={ids}
        focusId={phone ? returnFrom : null}
        onPage={(page) => go({ ...request, page })}
        onClearSearch={() => go({ ...request, q: '', page: 1 })}
      />
    </>
  )
  const threadView = id && (
    <Thread id={id} thread={thread} timeZone={timeZone} backTo={`/admin/conversations${listSearch(request)}`} phone={phone} onChanged={onChanged} />
  )
  const customer = id && thread.status === 'ready' && thread.data.customer

  if (phone) {
    return (
      <div className="flex flex-col">
        <PageHeader title="Conversations" srOnly />
        {id ? (
          <>
            <div className="px-sa-2 py-sa-1">
              <Link to={`/admin/conversations${listSearch(request)}`} className="inline-flex h-sa-touch items-center gap-sa-1 px-sa-2 font-medium">
                <BackIcon />
                All conversations
              </Link>
            </div>
            <div className="bg-sa-ground">{threadView}</div>
            {customer && <CustomerPanel customer={customer} timeZone={timeZone} request={request} phone />}
          </>
        ) : (
          <section aria-label="Conversation list" className="flex flex-col bg-sa-surface">
            <div className="px-sa-4 pb-sa-1 pt-sa-4"><SearchBox q={request.q} onSearch={onSearch} phone /></div>
            {listPanel}
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-sa-line bg-sa-surface px-sa-7 pb-sa-4 pt-sa-5">
        <PageHeader title="Conversations">
          <SearchBox q={request.q} onSearch={onSearch} />
        </PageHeader>
      </div>
      <div className="flex min-h-0 flex-1">
        <section aria-label="Conversation list" className="flex min-w-0 max-w-sa-list-max grow basis-sa-list-basis flex-col border-r border-sa-line bg-sa-surface">
          {listPanel}
        </section>
        <div className="flex min-w-0 grow-3 basis-sa-thread-basis flex-col bg-sa-ground">
          {threadView || (
            <div className="flex flex-1 items-center justify-center p-sa-6 text-sa-ink-muted">
              <p className="m-0">Choose a conversation to read it.</p>
            </div>
          )}
        </div>
        {customer && <CustomerPanel customer={customer} timeZone={timeZone} request={request} />}
      </div>
    </div>
  )
}
