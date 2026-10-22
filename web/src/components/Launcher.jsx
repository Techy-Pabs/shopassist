import { launcher } from '../config/store.js'
import Monogram from './Monogram.jsx'

// The closed chat: a clay pill, with an invitation bubble above it on
// desktop. Hidden while the panel is open (the panel takes its corner).
export default function Launcher({ ref, onOpen, showInvitation = true }) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col items-end gap-3 sm:bottom-8 sm:right-8">
      {showInvitation && (
        <p className="m-0 hidden max-w-invitation rounded-lg rounded-br-sm border border-sand bg-surface-raised px-4 py-3 text-body-small text-ink sm:block">
          {launcher.invitation}
        </p>
      )}
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded="false"
        className="flex h-launcher cursor-pointer items-center gap-2.5 rounded-pill border-0 bg-clay pl-2 pr-5.5 font-sans text-body font-semibold text-surface-100"
      >
        <Monogram variant="launcher" />
        {launcher.label}
      </button>
    </div>
  )
}
