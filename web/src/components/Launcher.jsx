import { launcher } from '../config/store.js'
import Monogram from './Monogram.jsx'

// The closed chat: a clay pill, with an invitation bubble above it, on
// desktop; a round clay button with the monogram on phones (the label is
// still read out). Hidden while the panel is open (the panel takes its corner).
export default function Launcher({ ref, onOpen, showInvitation = true }) {
  return (
    // A landmark, so the invitation is found when moving between page regions
    <aside aria-label="Chat" className="fixed bottom-6 right-4 flex flex-col items-end gap-3 sm:bottom-8 sm:right-8">
      {showInvitation && (
        <p className="m-0 hidden box-content max-w-invitation motion-safe:animate-panel-in rounded-lg rounded-br-sm border border-sand bg-surface-raised px-4 py-3 text-body-small text-ink sm:block">
          {launcher.invitation}
        </p>
      )}
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded="false"
        className="flex h-launcher-round w-launcher-round cursor-pointer items-center justify-center gap-2.5 rounded-pill border-0 bg-clay p-0 font-sans text-body font-semibold text-surface-100 sm:h-launcher sm:w-auto sm:justify-start sm:pl-2 sm:pr-5.5"
      >
        <Monogram variant="launcher" />
        <span className="sr-only sm:not-sr-only">{launcher.label}</span>
      </button>
    </aside>
  )
}
