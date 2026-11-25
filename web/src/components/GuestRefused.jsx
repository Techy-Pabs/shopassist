import { store } from '../config/store.js'

// "in about an hour", from a Retry-After in seconds
export function waitInWords(seconds) {
  if (seconds == null) return 'later'
  if (seconds < 90) return 'in a minute or so'
  const minutes = Math.round(seconds / 60)
  if (minutes < 50) return `in about ${minutes} minutes`
  const hours = Math.round(seconds / 3600)
  return hours <= 1 ? 'in about an hour' : `in about ${hours} hours`
}

// Why the API wouldn't start a guest chat, in plain language. Known codes
// get our own wording (with the wait from Retry-After); anything else shows
// the API's own message.
export function refusalReason({ code, message, retryAfter }) {
  if (code === 'guest_create_limit_reached') {
    return `Too many guest chats were started from your connection. Try again ${waitInWords(retryAfter)}.`
  }
  if (code === 'guest_chat_disabled') return 'Chatting without an account is turned off right now.'
  return message
}

// Shown instead of the chat when the API refused to start a guest chat: the
// reason, and the way forward with an account. onAccount("sign-in" or
// "create") opens that form.
export default function GuestRefused({ refusal, onAccount, headingRef }) {
  const button = 'inline-flex h-control-lg cursor-pointer items-center rounded-sm px-4.5 font-sans text-body-small font-semibold sm:h-control'
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-8">
      <div className="flex flex-col gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="m-0 font-serif text-heading text-ink outline-none">
          Guest chat isn&apos;t available
        </h3>
        <p role="alert" className="m-0 text-body text-ink-muted">{refusalReason(refusal)}</p>
        <p className="m-0 text-body text-ink-muted">You can still chat with a free account.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onAccount('sign-in')} className={`${button} border-0 bg-indigo text-surface-100`}>
          Sign in
        </button>
        <button type="button" onClick={() => onAccount('create')} className={`${button} border border-line-strong bg-transparent text-ink`}>
          Create an account
        </button>
      </div>
      <p className="m-0 text-body-small text-ink-muted">
        Or email <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a>
      </p>
    </div>
  )
}
