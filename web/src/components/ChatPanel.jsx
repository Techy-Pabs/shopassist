import { useEffect, useId, useRef } from 'react'

import { useIsMobile } from '../hooks/useIsMobile.js'
import { useSession } from '../session/SessionContext.jsx'
import PanelHeader from './PanelHeader.jsx'
import SignInForm from './SignInForm.jsx'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function SignedIn() {
  const { signOut } = useSession()
  return (
    <div className="flex flex-1 flex-col items-start gap-4 px-6 py-8">
      <p className="m-0 text-body text-ink">Signed in. Chat arrives in Slice 4.</p>
      <button
        type="button"
        onClick={signOut}
        className="h-control cursor-pointer rounded-sm border border-line-strong bg-transparent px-4.5 font-sans text-body-small font-semibold text-ink"
      >
        Sign out
      </button>
    </div>
  )
}

// The chat panel: full screen and modal below the mobile breakpoint, a
// floating non-modal panel above it. Escape closes it.
export default function ChatPanel({ onClose }) {
  const { api, isSignedIn } = useSession()
  const isMobile = useIsMobile()
  const titleId = useId()
  const panelRef = useRef(null)
  const emailRef = useRef(null)

  // Move focus into the panel when it opens: the email field when signed
  // out, otherwise the panel itself
  useEffect(() => {
    ;(emailRef.current ?? panelRef.current)?.focus()
  }, [isSignedIn])

  // A stored token may have expired since it was saved: check it once when
  // the panel opens. A 401 signs out with the session message.
  useEffect(() => {
    if (isSignedIn) api.me()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // On mobile the panel covers the page, so Tab cycles inside it
  function trapFocus(event) {
    if (!isMobile || event.key !== 'Tab') return
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-modal={isMobile ? 'true' : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={trapFocus}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface-100 text-ink outline-none motion-safe:animate-panel-in sm:inset-auto sm:bottom-8 sm:right-8 sm:h-panel-height sm:max-h-panel-fit sm:w-panel-width sm:rounded-lg sm:border sm:border-sand sm:shadow-panel"
    >
      <PanelHeader
        titleId={titleId}
        subtitle={isSignedIn ? 'AI assistant, replies in seconds' : 'AI assistant'}
        onClose={onClose}
      />
      {isSignedIn ? <SignedIn /> : <SignInForm emailRef={emailRef} />}
    </section>
  )
}
