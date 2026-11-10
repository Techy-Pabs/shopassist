import { launcher } from '../config/store.js'
import { useGreetingWaiting } from '../session/useGreetingWaiting.js'
import { SmallCloseIcon } from './Icons.jsx'
import Monogram from './Monogram.jsx'

// The closed chat: a clay pill on desktop, a round clay button with the
// monogram on phones (the label is still read out). Hidden while the panel
// is open (the panel takes its corner).
//
// showNote: the note "Ask our AI assistant" beside the button, with a ring
// that pulses three times, and the "1" badge only when a greeting really is
// waiting in the chat (see useGreetingWaiting). None of it moves for
// visitors who ask for reduced motion.
export default function Launcher({ ref, onOpen, showNote = false, onDismissNote }) {
  const greetingWaiting = useGreetingWaiting()
  const showBadge = showNote && greetingWaiting
  return (
    // A landmark, so the note is found when moving between page regions
    <aside aria-label="Chat" className="fixed bottom-6 right-4 flex items-center gap-2.5 sm:bottom-8 sm:right-8 sm:gap-3">
      {/* Always present, so the note's text is announced politely once when
          it appears (focus never moves to it). The visible copy below is
          hidden from screen readers so it isn't read twice. */}
      <p role="status" className="sr-only">{showNote ? launcher.note : ''}</p>
      {showNote && (
        <div className="flex items-center gap-0.5 rounded-pill bg-ink py-1 pl-3.5 pr-1 text-body-small font-semibold text-surface-100 motion-safe:animate-note-in sm:gap-1 sm:py-1.5 sm:pl-4 sm:pr-1.5 sm:text-body sm:font-semibold">
          <span aria-hidden="true">{launcher.note}</span>
          {/* A full touch target (control) on phones; the pill's padding is
              taken back so it stays the mockup's height */}
          <button
            type="button"
            onClick={onDismissNote}
            aria-label="Dismiss the note"
            className="-my-1 flex h-control w-control cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-sand sm:my-0 sm:h-note-dismiss sm:w-note-dismiss"
          >
            <SmallCloseIcon />
          </button>
        </div>
      )}
      <div className="relative">
        {showNote && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-pill border-ring border-clay opacity-0 motion-safe:animate-launcher-ring-round sm:motion-safe:animate-launcher-ring"
          />
        )}
        <button
          ref={ref}
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-expanded="false"
          className="relative flex h-launcher-round w-launcher-round cursor-pointer items-center justify-center gap-2.5 rounded-pill border-0 bg-clay p-0 font-sans text-body font-semibold text-surface-100 sm:h-launcher sm:w-auto sm:justify-start sm:pl-2 sm:pr-5.5"
        >
          <Monogram variant="launcher" />
          {/* The badge is part of the name while it shows: text, not an
              aria-label, so the name always starts with what's visible */}
          <span className="sr-only sm:not-sr-only">
            {launcher.label}
            {showBadge && <span className="sr-only">, 1 new message</span>}
          </span>
        </button>
        {showBadge && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 box-border flex h-launcher-badge min-w-launcher-badge items-center justify-center rounded-pill border-badge border-surface-100 bg-indigo px-1.5 text-caption font-semibold text-surface-100 sm:-top-1.5"
          >
            1
          </span>
        )}
      </div>
    </aside>
  )
}
