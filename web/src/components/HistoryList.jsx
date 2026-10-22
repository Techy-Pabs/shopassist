import { useCallback, useEffect, useState } from 'react'

import { formatDay, isThisWeek } from '../lib/dates.js'
import { useSession } from '../session/SessionContext.jsx'
import { PlusIcon } from './Icons.jsx'

// One row: title and day on the first line, the latest message below.
// Both lines clip to one line with an ellipsis.
function ConversationRow({ conversation, current, last, onOpen }) {
  const highlight = current ? '-mx-4 bg-surface-raised px-4' : ''
  return (
    <li className={`border-t border-dashed border-sand ${last ? 'border-b' : ''} ${highlight}`}>
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        aria-current={current ? 'true' : undefined}
        className="flex w-full min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent px-0 py-3.5 text-left font-sans text-ink"
      >
        <span className="flex w-full min-w-0 items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-body font-semibold">{conversation.title ?? 'New conversation'}</span>
          <span className="shrink-0 text-caption font-normal text-ink-muted">{formatDay(new Date(conversation.updated_at))}</span>
        </span>
        <span className="w-full truncate text-body-small text-ink-muted">
          {conversation.last_message_preview ?? 'No messages yet'}
        </span>
      </button>
    </li>
  )
}

function Group({ title, conversations, currentId, onOpen, spaced }) {
  if (conversations.length === 0) return null
  return (
    <section aria-label={title}>
      <h3 className={`m-0 pb-2 text-label text-ink-muted ${spaced ? 'pt-5' : 'pt-2'}`}>{title}</h3>
      <ul className="m-0 list-none p-0">
        {conversations.map((conversation, index) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            current={conversation.id === currentId}
            last={index === conversations.length - 1}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  )
}

// The conversation list, from GET /conversations
export default function HistoryList({ currentId, onOpen, onNew, newRef }) {
  const { api } = useSession()
  const [state, setState] = useState({ status: 'loading', conversations: [] })

  const load = useCallback(async () => {
    setState({ status: 'loading', conversations: [] })
    const result = await api.listConversations()
    // A 401 signs out (the panel then shows sign in), so only report others
    if (result.ok) setState({ status: 'ready', conversations: result.data })
    else if (result.kind !== 'session-ended') setState({ status: 'error', conversations: [] })
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const now = new Date()
  const thisWeek = state.conversations.filter((c) => isThisWeek(new Date(c.updated_at), now))
  const earlier = state.conversations.filter((c) => !isThisWeek(new Date(c.updated_at), now))

  return (
    <>
      <div className="shrink-0 p-4">
        <button
          ref={newRef}
          type="button"
          onClick={onNew}
          className="flex h-control-lg w-full cursor-pointer items-center justify-center gap-2 rounded-sm border-0 bg-indigo font-sans text-body font-semibold text-surface-100 sm:h-control"
        >
          <PlusIcon />
          New conversation
        </button>
      </div>

      <nav aria-label="Past conversations" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
        {state.status === 'loading' && (
          <p role="status" className="m-0 py-2 text-body-small text-ink-muted">
            Loading your conversations…
          </p>
        )}

        {state.status === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-3 py-2">
            <p className="m-0 text-body-small font-medium text-danger">We couldn't load your conversations.</p>
            <button
              type="button"
              onClick={load}
              className="h-control cursor-pointer rounded-sm border border-line-strong bg-transparent px-4.5 font-sans text-body-small font-semibold text-ink"
            >
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.conversations.length === 0 && (
          <div className="flex flex-col gap-2 py-2">
            <h3 className="m-0 font-serif text-title-chat text-ink">No conversations yet</h3>
            <p className="m-0 text-body text-ink-muted">Your conversations will appear here. Ask us anything to start one.</p>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <Group title="This week" conversations={thisWeek} currentId={currentId} onOpen={onOpen} />
            <Group title="Earlier" conversations={earlier} currentId={currentId} onOpen={onOpen} spaced={thisWeek.length > 0} />
          </>
        )}
      </nav>
    </>
  )
}
