import { useEffect, useRef } from 'react'

import { store } from '../config/store.js'

const COPY = {
  guest_limit_reached: (limit) => ({
    title: limit ? `You've used your ${limit} guest questions` : "You've used your guest questions",
    text: 'Create a free account to keep chatting and save your conversations, or reach our team directly.',
  }),
  guest_daily_limit_reached: () => ({
    title: 'Guest chat is busy today',
    text: 'Sign in or create a free account to keep going, or try again tomorrow.',
  }),
}

// A guest can't ask more (Guest-Limit mockup): out of questions, or the
// demo's daily guest limit is reached. Offers an account instead.
// takeFocus: the message box has just been disabled under the guest's
// cursor, so focus moves here rather than being lost.
export default function GuestLimitCard({ kind, limit, onCreate, onSignIn, takeFocus = false }) {
  const first = useRef(null)
  useEffect(() => {
    if (takeFocus) first.current?.focus()
  }, [takeFocus])
  const { title, text } = COPY[kind](limit)
  const button = 'inline-flex h-control cursor-pointer items-center rounded-sm px-4.5 font-sans text-body-small font-semibold'
  return (
    <div role="status" className="mt-5 flex flex-col gap-3 rounded-sm border border-line-strong bg-surface-raised px-4 py-4.5">
      <div className="flex flex-col gap-1">
        <p className="m-0 font-serif text-title text-ink">{title}</p>
        <p className="m-0 text-body-small text-ink-muted">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button ref={first} type="button" onClick={onCreate} className={`${button} border-0 bg-indigo text-surface-100`}>
          Create a free account
        </button>
        <button type="button" onClick={onSignIn} className={`${button} border border-line-strong bg-transparent text-ink`}>
          Sign in
        </button>
      </div>
      <p className="m-0 text-label-relaxed text-ink-muted">
        Or email <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a>
      </p>
    </div>
  )
}
