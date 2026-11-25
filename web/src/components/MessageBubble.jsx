import { AlertIcon } from './Icons.jsx'
import Monogram from './Monogram.jsx'

// Bubble widths: the bubble-mobile token on mobile, bubble-desktop above.
// As in the mockups, the width is the text's, with the padding outside it.
const width = 'box-content max-w-bubble-mobile sm:max-w-bubble-desktop'
// Folded tag: three large corners and a small one nearest the sender.
// whitespace-pre-wrap keeps the reply's line breaks.
const text = 'm-0 whitespace-pre-wrap break-words px-4 py-3 text-body'

// Message text is always rendered as text: React escapes it, so "<b>" or
// "<script>" in a reply shows literally and is never turned into HTML.
// failed: a question whose reply failed, shown "Not sent", with Retry when
// onRetry is given (only the latest question can be retried). answering:
// another request is writing its reply, shown "Still answering…".
export default function MessageBubble({ role, content, spaced, failed = false, answering = false, onRetry }) {
  const gap = spaced ? 'mt-4' : '' // a change of sender: 8 + 16 = space-6
  if (role === 'user') {
    const bubble = (
      <p className={`${text} ${width} ${failed || answering ? '' : gap} self-end rounded-lg rounded-br-sm bg-indigo text-surface-100`}>
        {content}
      </p>
    )
    if (answering) {
      return (
        <div className={`flex flex-col items-end gap-1 self-end ${gap}`}>
          {bubble}
          <span className="text-body-small text-ink-muted">Still answering…</span>
        </div>
      )
    }
    if (!failed) return bubble
    return (
      <div className={`flex flex-col items-end gap-1 self-end ${gap}`}>
        {bubble}
        <div className="flex items-center gap-2 text-body-small">
          <span className="flex items-center gap-1 font-semibold text-danger">
            <AlertIcon />
            Not sent
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-control cursor-pointer items-center border-0 bg-transparent px-1 font-sans text-body-small font-semibold text-clay underline hover:text-ink"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className={`flex items-end gap-2 ${gap}`}>
      <Monogram variant="bubble" />
      <p className={`${text} ${width} rounded-lg rounded-bl-sm border border-sand bg-surface-raised text-ink`}>
        {content}
      </p>
    </div>
  )
}
