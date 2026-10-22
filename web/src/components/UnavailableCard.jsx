import { store } from '../config/store.js'
import { AlertIcon } from './Icons.jsx'

// Shown when the assistant doesn't answer (502, no response, or the
// service didn't wake). Try again repeats what failed.
export default function UnavailableCard({ onRetry, questionSaved = true }) {
  return (
    <div role="alert" className="mt-4 flex flex-col gap-3 rounded-sm border border-line-strong bg-surface-raised p-4">
      <div className="flex items-start gap-2.5">
        <span className="text-danger">
          <AlertIcon />
        </span>
        <div className="flex flex-col gap-1">
          <p className="m-0 text-body font-semibold text-danger">The assistant is unavailable right now</p>
          <p className="m-0 text-body-small text-ink-muted">
            {questionSaved
              ? 'Your question is saved. Try again in a moment, or reach our team directly.'
              : 'Try again in a moment, or reach our team directly.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="h-control cursor-pointer rounded-sm border-0 bg-indigo px-4.5 font-sans text-body-small font-semibold text-surface-100"
        >
          Try again
        </button>
        {store.whatsappUrl ? (
          <a
            href={store.whatsappUrl}
            className="inline-flex h-control items-center rounded-sm border border-line-strong px-4.5 text-body-small font-semibold text-ink no-underline"
          >
            WhatsApp us
          </a>
        ) : (
          // A placeholder number: shown as text, not a link (see store.js)
          <span className="text-body-small font-semibold text-ink">WhatsApp {store.whatsappNumber}</span>
        )}
      </div>
    </div>
  )
}
