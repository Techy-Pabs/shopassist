import { useCallback, useEffect, useRef, useState } from 'react'

import ChatPanel from './components/ChatPanel.jsx'
import HomePage from './components/home/HomePage.jsx'
import Launcher from './components/Launcher.jsx'
import { NOTE_DELAY } from './design.js'
import { useIsMobile } from './hooks/useIsMobile.js'
import { SessionProvider } from './session/SessionContext.jsx'

// The note beside the chat button shows once per visit (per tab): not again
// after a reload, once it has been dismissed, or once the chat has been opened.
// It is due 2 seconds after the page loads. On phones the hero fills the
// first screen, so there it waits until the hero's buttons have scrolled off
// the top; once shown it stays until dismissed or the chat is opened.
const NOTE_KEY = 'loomlane.noteShown'

function noteShown() {
  try {
    return window.sessionStorage.getItem(NOTE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberNote() {
  try {
    window.sessionStorage.setItem(NOTE_KEY, '1')
  } catch {
    // Without storage the note may simply show again next time
  }
}

export default function App({ fetchImpl }) {
  const [open, setOpen] = useState(false)
  // waiting -> due (after the delay) -> showing -> done; or done straight
  // away if this visit has already had the note
  const [note, setNote] = useState(() => (noteShown() ? 'done' : 'waiting'))
  const [pastHeroButtons, setPastHeroButtons] = useState(false)
  const phone = useIsMobile()
  const launcherRef = useRef(null)
  const returnFocus = useRef(false)
  // The button that opened the chat (the launcher or one on the page)
  const opener = useRef(null)

  const openPanel = useCallback(() => {
    opener.current = document.activeElement
    setOpen(true)
    setNote('done')
    rememberNote()
  }, [])

  const dismissNote = useCallback(() => {
    setNote('done')
    rememberNote()
    // The dismiss button goes with the note: focus moves to the chat button
    // beside it instead of falling back to the top of the page
    launcherRef.current?.focus()
  }, [])

  useEffect(() => {
    if (note !== 'waiting') return undefined
    const timer = setTimeout(() => setNote((current) => (current === 'waiting' ? 'due' : current)), NOTE_DELAY)
    return () => clearTimeout(timer)
  }, [note])

  useEffect(() => {
    if (note === 'due' && (!phone || pastHeroButtons)) {
      rememberNote()
      setNote('showing')
    }
  }, [note, phone, pastHeroButtons])

  const closePanel = useCallback(() => {
    returnFocus.current = true
    setOpen(false)
  }, [])

  // After closing, focus goes back to the button that opened the chat, or
  // to the launcher when that button is gone
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false
      const target = opener.current?.isConnected && opener.current !== document.body ? opener.current : launcherRef.current
      target?.focus()
    }
  }, [open])

  return (
    <SessionProvider fetchImpl={fetchImpl}>
      <div className="relative min-h-screen bg-surface-100 text-ink">
        <HomePage onAsk={openPanel} onPastHeroButtons={setPastHeroButtons} />
        {open ? (
          <ChatPanel onClose={closePanel} />
        ) : (
          <Launcher ref={launcherRef} onOpen={openPanel} showNote={note === 'showing'} onDismissNote={dismissNote} />
        )}
      </div>
    </SessionProvider>
  )
}
