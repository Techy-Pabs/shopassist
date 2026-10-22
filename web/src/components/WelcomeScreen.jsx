import { useId } from 'react'

import MessageBubble from './MessageBubble.jsx'

export const GREETING = "Hi, I'm here to help with orders, delivery, returns and sizing. What would you like to know?"
export const SUGGESTIONS = [
  "Where's my order?",
  'Delivery to my state',
  'How do returns work?',
  'Help me find my size',
  'Can I pay on delivery?',
]

// The start of a new conversation. Each chip sends exactly its label.
export default function WelcomeScreen({ onSuggestion, disabled }) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-6 px-4 pb-4 pt-8">
      <h3 className="m-0 px-2 font-serif text-heading-welcome text-ink">Hello, how can we help?</h3>
      <MessageBubble role="assistant" content={GREETING} />
      <div className="flex flex-col gap-3 px-2">
        <span id={labelId} className="text-label text-ink-muted">
          Popular questions
        </span>
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((label) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(label)}
              className="min-h-control cursor-pointer rounded-pill border-0 bg-indigo-tint px-4 font-sans text-label text-ink disabled:cursor-default"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
