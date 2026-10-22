import { useId } from 'react'

import { store } from '../config/store.js'
import { SendIcon } from './Icons.jsx'

// The question input. While a reply is on its way the input stays usable,
// but sending waits.
export default function Composer({ value, onChange, onSend, onSignOut, waiting, error, inputRef }) {
  const id = useId()
  const errorId = `${id}-error`

  function onSubmit(event) {
    event.preventDefault()
    if (!waiting && value.trim()) onSend(value)
  }

  return (
    <form onSubmit={onSubmit} className="flex shrink-0 flex-col gap-2 border-t border-sand px-4 pb-6 pt-3 sm:pb-3.5">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Your question
        </label>
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={waiting ? 'Wait for the reply, or type your next question' : 'Ask about delivery, returns or sizing'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          className="box-border h-control-lg min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-raised px-3.5 font-sans text-body text-ink sm:h-control"
        />
        <button
          type="submit"
          disabled={waiting}
          aria-label={waiting ? 'Send, available once the reply arrives' : 'Send'}
          className="flex h-control-lg w-control-lg shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-indigo text-surface-100 disabled:cursor-default disabled:border disabled:border-line-strong disabled:bg-sand disabled:text-ink-muted sm:h-control sm:w-control"
        >
          <SendIcon />
        </button>
      </div>
      {error && (
        <p id={errorId} className="m-0 text-body-small font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 min-w-0 text-caption font-normal text-ink-muted">
          An AI assistant. For a specific order, email <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a>
        </p>
        {onSignOut && (
          // Styled like the footer's link: small text, but a full size touch
          // target, in its own column beside the text so it overlaps nothing
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-control min-w-control shrink-0 cursor-pointer items-center justify-end border-0 bg-transparent p-0 font-sans text-caption font-normal text-clay underline hover:text-ink"
          >
            Sign out
          </button>
        )}
      </div>
    </form>
  )
}
