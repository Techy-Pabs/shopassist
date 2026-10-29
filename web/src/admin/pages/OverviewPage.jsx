import { useId, useState } from 'react'
import { Link } from 'react-router'

import { store } from '../../config/store.js'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { count, dayAndMonth, daysAgo, shortTime, weekday } from '../format.js'
import { ChevronIcon, DocumentIcon, WarningIcon } from '../icons.jsx'
import { useLoad } from '../useLoad.js'
import { PageHeader } from './Pages.jsx'

// The date ranges /admin/stats knows, with how the page names them
const RANGES = [
  { value: 'today', label: 'Today', short: 'Today', before: 'yesterday', days: 1 },
  { value: '7d', label: 'Last 7 days', short: '7 days', before: 'the week before', days: 7 },
  { value: '30d', label: 'Last 30 days', short: '30 days', before: 'the 30 days before', days: 30 },
]

const ATTENTION_LINK = '/admin/conversations?filter=attention'

// Every day of the range, oldest first, with 0 for any day the API left
// out. "since" is midnight in the store's time zone ("2026-10-23T00:00:00+01:00"),
// so its first ten characters are the range's first day.
export function everyDay(since, range, perDay) {
  const counts = new Map(perDay.map((d) => [d.day, d.conversations]))
  const first = Date.parse(`${since.slice(0, 10)}T00:00:00Z`)
  return Array.from({ length: RANGES.find((r) => r.value === range).days }, (_, i) => {
    const day = new Date(first + i * 86_400_000).toISOString().slice(0, 10)
    return { day, conversations: counts.get(day) ?? 0 }
  })
}

// "up from 39 the week before", in plain words for every case
export function comparison(now, before, range) {
  const when = RANGES.find((r) => r.value === range).before
  if (!before) return `none ${when}`
  if (now > before) return `up from ${before} ${when}`
  if (now < before) return `down from ${before} ${when}`
  return `the same as ${when}`
}

// "3 the assistant couldn't answer, 2 unanswered"
function attentionSplit({ couldnt_answer: couldnt, unanswered }, short) {
  const parts = []
  if (couldnt) parts.push(short ? `${couldnt} couldn't answer` : `${couldnt} the assistant couldn't answer`)
  if (unanswered) parts.push(`${unanswered} unanswered`)
  return parts.join(', ') || 'Nothing is waiting for you'
}

function knowledgeNote({ documents, last_updated: updated }, timeZone) {
  return documents && updated ? `last updated ${daysAgo(updated, { timeZone })}` : 'no documents yet'
}

const panel = 'rounded-sa-lg border border-sa-line bg-sa-surface'
const cardLink = 'text-sa-ink no-underline hover:text-sa-ink'
const secondaryButton =
  'flex h-sa-control-lg cursor-pointer items-center justify-center self-start rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-4 font-sa-sans text-sa-body font-semibold text-sa-ink'

function RangeSwitch({ range, onChange, phone }) {
  return (
    <div role="group" aria-label="Date range" className={`${phone ? 'flex w-full' : 'inline-flex'} rounded-sa-md border border-sa-line bg-sa-surface p-sa-0.75`}>
      {RANGES.map(({ value, label, short }) => {
        const on = value === range
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(value)}
            className={`${phone ? 'h-sa-touch flex-1' : 'h-sa-control px-sa-3'} cursor-pointer rounded-sa-sm border-0 font-sa-sans text-sa-small font-medium ${
              on ? 'bg-sa-ink text-sa-surface' : 'bg-transparent text-sa-ink-muted hover:text-sa-ink'
            }`}
          >
            {phone ? short : label}
          </button>
        )
      })}
    </div>
  )
}

// The four key numbers, each a link to its page
function KeyNumbers({ stats, range }) {
  const attention = stats.needs_attention
  const card = `${cardLink} flex flex-col gap-sa-2 rounded-sa-lg border px-sa-5 py-sa-4.5`
  const plain = `${card} border-sa-line bg-sa-surface hover:border-sa-line-strong`
  const figure = 'font-sa-mono text-sa-figure'
  const note = 'text-sa-small text-sa-ink-muted'
  return (
    <section aria-label="Key numbers" className="grid grid-cols-sa-fit-card gap-sa-4">
      <Link to="/admin/conversations" className={plain}>
        <span className="font-medium text-sa-ink-muted">Conversations</span>
        <span className={figure}>{stats.conversations}</span>
        <span className={note}>{comparison(stats.conversations, stats.previous_conversations, range)}</span>
      </Link>
      <Link to="/admin/conversations" className={plain}>
        <span className="font-medium text-sa-ink-muted">Questions answered</span>
        <span className={figure}>{stats.answered}</span>
        <span className={note}>of {count(stats.questions, 'customer question')}</span>
      </Link>
      <Link to={ATTENTION_LINK} className={`${card} border-sa-attention-line bg-sa-attention-wash`}>
        <span className="flex items-center gap-sa-1.5 font-semibold text-sa-attention">
          <WarningIcon />
          Needs your attention
        </span>
        <span className={figure}>{attention.total}</span>
        <span className={note}>{attentionSplit(attention, false)}</span>
      </Link>
      <Link to="/admin/knowledge" className={plain}>
        <span className="font-medium text-sa-ink-muted">Knowledge documents</span>
        <span className={figure}>{stats.knowledge.documents}</span>
        <span className={note}>{knowledgeNote(stats.knowledge, stats.time_zone)}</span>
      </Link>
    </section>
  )
}

// On a phone: the amber card first, then the other numbers two by two
function PhoneNumbers({ stats }) {
  const attention = stats.needs_attention
  const small = `${cardLink} flex flex-col gap-sa-1 rounded-sa-lg border border-sa-line bg-sa-surface p-sa-3.5`
  const numbers = [
    ['/admin/conversations', 'Conversations', stats.conversations],
    ['/admin/conversations', 'Answered', stats.answered],
    ['/admin/knowledge', 'Documents', stats.knowledge.documents],
    ['/admin/customers', 'Customers', stats.customers],
  ]
  return (
    <>
      <Link to={ATTENTION_LINK} className={`${cardLink} flex items-center gap-sa-3 rounded-sa-lg border border-sa-attention-line bg-sa-attention-wash px-sa-4 py-sa-3.5`}>
        <span className="font-sa-mono text-sa-figure-md">{attention.total}</span>
        <span className="flex flex-1 flex-col">
          <span className="font-semibold text-sa-attention">{attention.total === 1 ? 'Needs' : 'Need'} your attention</span>
          <span className="text-sa-small text-sa-ink-muted">{attentionSplit(attention, true)}</span>
        </span>
        <span className="text-sa-attention"><ChevronIcon /></span>
      </Link>
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-sa-3">
        {numbers.map(([to, label, value]) => (
          <Link key={label} to={to} className={small}>
            <span className="text-sa-small text-sa-ink-muted">{label}</span>
            <span className="font-sa-mono text-sa-figure-sm">{value}</span>
          </Link>
        ))}
      </section>
    </>
  )
}

// The tallest bar's share of the chart's height, leaving room for its number
const TALLEST = 85
// With a month of days, the bars are too narrow for their numbers, and only
// every seventh day is named
const LABEL_EVERY = 7

function Chart({ days, range, phone }) {
  const titleId = useId()
  const month = days.length > 7
  const name = (day) => (month ? dayAndMonth(day) : weekday(day))
  const max = Math.max(0, ...days.map((d) => d.conversations))
  const description = `Bar chart of conversations per day: ${days.map((d) => `${name(d.day)}: ${d.conversations}`).join(', ')}`
  const gap = month ? 'gap-sa-1' : 'gap-sa-3.5'
  return (
    <section aria-labelledby={titleId} className={`${panel} flex min-w-0 grow-3 basis-sa-chart-basis flex-col gap-sa-4 ${phone ? 'p-sa-4' : 'p-sa-5'}`}>
      <div className="flex items-baseline justify-between gap-sa-3">
        <h2 id={titleId} className={`m-0 ${phone ? 'text-sa-lead font-semibold' : 'text-sa-heading'}`}>Conversations per day</h2>
        <span className="text-sa-small text-sa-ink-muted">{RANGES.find((r) => r.value === range).label}</span>
      </div>
      <div role="img" aria-label={description} className={`flex h-sa-chart items-end border-b border-sa-line px-sa-1 ${gap}`}>
        {days.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-sa-1.5">
            {!month && <span className="font-sa-mono text-sa-caption text-sa-ink-muted">{d.conversations}</span>}
            {/* An SVG's height attribute takes a percentage: each bar is its
                day's share of the busiest day. A day with none has no bar. */}
            <svg
              aria-hidden="true"
              data-conversations={d.conversations}
              width="100%"
              height={`${max ? (d.conversations / max) * TALLEST : 0}%`}
              className="shrink-0 rounded-t-sa-sm bg-sa-accent"
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className={`flex px-sa-1 text-sa-caption text-sa-ink-muted ${gap}`}>
        {days.map((d, i) => (
          <span key={d.day} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
            {!month || i % LABEL_EVERY === 0 ? name(d.day) : ''}
          </span>
        ))}
      </div>
    </section>
  )
}

function Reason({ reason }) {
  return reason === 'couldnt_answer' ? (
    <span className="rounded-sa-pill bg-sa-attention-tint px-sa-2 py-sa-0.25 text-sa-caption font-semibold text-sa-attention">
      Couldn&apos;t answer
    </span>
  ) : (
    <span className="rounded-sa-pill bg-sa-danger-tint px-sa-2 py-sa-0.25 text-sa-caption font-semibold text-sa-danger-ink">
      Unanswered
    </span>
  )
}

// The conversations waiting for the admin, with times in the store's zone.
// Titles and emails are customer text: React renders them as plain text,
// never as HTML.
function AttentionList({ list, timeZone, phone }) {
  const titleId = useId()
  const side = phone ? 'px-sa-4' : 'px-sa-5'
  const message = `m-0 border-t border-sa-line-soft ${side} py-sa-4`
  return (
    <section aria-labelledby={titleId} className={`${panel} flex min-w-0 grow-2 basis-sa-attention-basis flex-col`}>
      <div className={`flex items-baseline justify-between gap-sa-3 ${side} ${phone ? 'pb-sa-2.5 pt-sa-3.5' : 'pb-sa-3 pt-sa-5'}`}>
        <h2 id={titleId} className={`m-0 ${phone ? 'text-sa-lead font-semibold' : 'text-sa-heading'}`}>Needs your attention</h2>
        {!phone && <Link to={ATTENTION_LINK} className="text-sa-small font-medium">View all</Link>}
      </div>
      {list.status === 'loading' && <p role="status" className={`${message} text-sa-ink-muted`}>Loading conversations…</p>}
      {list.status === 'error' && (
        <div role="alert" className={`flex flex-col gap-sa-3 border-t border-sa-line-soft ${side} py-sa-4`}>
          <p className="m-0">We couldn&apos;t load these conversations. {list.message}</p>
          <button type="button" onClick={list.retry} className={secondaryButton}>Try again</button>
        </div>
      )}
      {list.status === 'ready' && list.data.items.length === 0 && (
        <div className={`${message} flex flex-col gap-sa-1`}>
          <p className="m-0 font-semibold">No conversations need your attention</p>
          <p className="m-0 text-sa-small text-sa-ink-muted">
            When the assistant can&apos;t answer a question, or a question gets no reply, it shows up here.
          </p>
        </div>
      )}
      {list.status === 'ready' && list.data.items.length > 0 && (
        <ul className="m-0 list-none p-0">
          {list.data.items.map((c) => (
            <li key={c.id}>
              <Link
                to={`/admin/conversations/${c.id}`}
                className={`${cardLink} flex flex-col gap-sa-1 border-t border-sa-line-soft ${side} py-sa-3 hover:bg-sa-surface-muted`}
              >
                <span className="flex justify-between gap-sa-3">
                  <span className="min-w-0 break-words font-semibold">{c.title || 'Untitled conversation'}</span>
                  <time dateTime={c.last_activity} className="whitespace-nowrap text-sa-caption text-sa-ink-muted">
                    {shortTime(c.last_activity, { timeZone })}
                  </time>
                </span>
                <span className="flex flex-wrap items-center gap-sa-2 text-sa-small text-sa-ink-muted">
                  <Reason reason={c.attention_reason} />
                  {!phone && <span className="min-w-0 break-all">{c.owner_email}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function UploadPrompt({ phone }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`${panel} flex flex-wrap items-center gap-sa-4 ${phone ? 'p-sa-4' : 'px-sa-5 py-sa-4.5'}`}>
      <span className="text-sa-accent"><DocumentIcon /></span>
      <div className="flex min-w-0 flex-1 basis-sa-prompt-basis flex-col gap-sa-0.5">
        <h2 id={titleId} className="m-0 text-sa-lead font-semibold">
          Questions the assistant couldn&apos;t answer point to gaps in its knowledge
        </h2>
        <p className="m-0 text-sa-ink-muted">Add a document that covers them, and the assistant can answer next time.</p>
      </div>
      <Link
        to="/admin/knowledge"
        className={`inline-flex ${phone ? 'h-sa-touch' : 'h-sa-control-lg'} items-center rounded-sa-md bg-sa-accent px-sa-4 font-semibold text-sa-surface no-underline hover:text-sa-surface`}
      >
        Upload a document
      </Link>
    </section>
  )
}

// A store nobody has chatted with yet
function NothingYet() {
  return (
    <section className={`${panel} flex flex-col gap-sa-2 p-sa-6`} aria-labelledby="overview-nothing-yet">
      <h2 id="overview-nothing-yet" className="m-0 text-sa-heading">No conversations yet</h2>
      <p className="m-0 text-sa-ink-muted">
        When customers chat with the assistant, you&apos;ll see how many conversations it has, how many questions it
        answers, and anything that needs your attention.
      </p>
      <Link to="/" className="self-start font-medium">Try the chat as a customer</Link>
    </section>
  )
}

export default function OverviewPage() {
  const phone = useIsMobile()
  const [range, setRange] = useState('7d')
  const stats = useLoad(`/admin/stats?range=${range}`)
  // The list doesn't depend on the range, so changing it doesn't reload this
  const attention = useLoad(`${ATTENTION_LINK}&limit=5`)
  const data = stats.data
  const nothingYet = data && data.customers === 0 && data.conversations === 0 && data.previous_conversations === 0

  return (
    <div className={`flex flex-col ${phone ? 'gap-sa-3' : 'gap-sa-6'}`}>
      <PageHeader title="Overview" description={`How your assistant is doing for ${store.name} customers.`} srOnly={phone}>
        <RangeSwitch range={range} onChange={setRange} phone={phone} />
      </PageHeader>

      {stats.status === 'loading' && (
        <p role="status" className={`${panel} m-0 p-sa-5 text-sa-ink-muted`}>Loading the overview…</p>
      )}

      {stats.status === 'error' && (
        <div role="alert" className={`${panel} flex flex-col gap-sa-3 p-sa-5`}>
          <h2 className="m-0 text-sa-heading">We couldn&apos;t load the overview</h2>
          <p className="m-0 text-sa-ink-muted">{stats.message}</p>
          <button type="button" onClick={stats.retry} className={secondaryButton}>Try again</button>
        </div>
      )}

      {stats.status === 'ready' && (
        <>
          {phone ? <PhoneNumbers stats={data} /> : <KeyNumbers stats={data} range={data.range} />}
          {nothingYet ? (
            <NothingYet />
          ) : (
            <div className={`flex flex-wrap items-start ${phone ? 'gap-sa-3' : 'gap-sa-4'}`}>
              {phone ? (
                <>
                  <AttentionList list={attention} timeZone={data.time_zone} phone />
                  <Chart days={everyDay(data.since, data.range, data.per_day)} range={data.range} phone />
                </>
              ) : (
                <>
                  <Chart days={everyDay(data.since, data.range, data.per_day)} range={data.range} />
                  <AttentionList list={attention} timeZone={data.time_zone} />
                </>
              )}
            </div>
          )}
          <UploadPrompt phone={phone} />
        </>
      )}
    </div>
  )
}
