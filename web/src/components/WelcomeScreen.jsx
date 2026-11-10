import { useId } from 'react'

import MessageBubble from './MessageBubble.jsx'

export const GREETING = "Hi, I'm here to help with orders, delivery, returns and sizing. What would you like to know?"
// A guest's greeting (Guest-Welcome mockup)
export const GUEST_GREETING = 'Hi! Ask me anything about delivery, returns or sizing. No account needed.'
// Says up front what the demo assistant can and can't help with
export const DEMO_NOTE =
  "This is a demo with a limited knowledge base. I can answer questions about Loom & Lane's delivery, returns, sizing and products."
export const SUGGESTIONS = [
  "Where's my order?",
  'Delivery to my state',
  'How do returns work?',
  'Help me find my size',
  'Can I pay on delivery?',
]
// A guest has no orders to ask about
export const GUEST_SUGGESTIONS = SUGGESTIONS.slice(1)

// The start of a new conversation. Each chip sends exactly its label.
// guest: the guest welcome, with the demo note first. notice: a line above it
// (for example that an earlier guest chat has ended).
export default function WelcomeScreen({ onSuggestion, disabled, guest = false, notice = null }) {
  const labelId = useId()
  const note = <p className={`m-0 px-2 text-caption text-ink-muted ${guest ? '' : '-mt-3 sm:-mt-2'}`}>{DEMO_NOTE}</p>
  return (
    <div className="flex flex-col gap-6 px-4 pb-4 pt-8 sm:gap-4 sm:px-3 sm:pb-1 sm:pt-4">
      {notice && <p role="status" className="m-0 px-2 text-body-small font-semibold text-ink">{notice}</p>}
      {guest ? (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 px-2 font-serif text-heading-welcome text-ink sm:text-heading">Hello, how can we help?</h3>
          {note}
        </div>
      ) : (
        <h3 className="m-0 px-2 font-serif text-heading-welcome text-ink sm:text-heading">Hello, how can we help?</h3>
      )}
      <MessageBubble role="assistant" content={guest ? GUEST_GREETING : GREETING} />
      {/* In the desktop panel the heading is one line (the heading style) and
          the gaps are tighter, so the note and all five chips fit */}
      {!guest && note}
      <div className="flex flex-col gap-3 px-2 sm:gap-2">
        <span id={labelId} className="text-label text-ink-muted">
          Popular questions
        </span>
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {(guest ? GUEST_SUGGESTIONS : SUGGESTIONS).map((label) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(label)}
              className="min-h-control cursor-pointer rounded-pill border-0 bg-indigo-tint px-4 font-sans text-label text-ink disabled:cursor-default sm:px-3"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
