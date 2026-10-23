import { useCallback, useEffect, useRef, useState } from 'react'

import ChatPanel from './components/ChatPanel.jsx'
import HomePage from './components/home/HomePage.jsx'
import Launcher from './components/Launcher.jsx'
import { SessionProvider } from './session/SessionContext.jsx'

// The invitation bubble shows until the panel has been opened once in the tab
const INVITATION_KEY = 'loomlane.invitationSeen'

function invitationSeen() {
  try {
    return window.sessionStorage.getItem(INVITATION_KEY) === '1'
  } catch {
    return false
  }
}

export default function App({ fetchImpl }) {
  const [open, setOpen] = useState(false)
  const [showInvitation, setShowInvitation] = useState(() => !invitationSeen())
  // The invitation waits until the visitor has scrolled past the hero, so
  // it doesn't cover the hero's photos on the first screen
  const [pastHero, setPastHero] = useState(false)
  const launcherRef = useRef(null)
  const returnFocus = useRef(false)
  // The button that opened the chat (the launcher or one on the page)
  const opener = useRef(null)

  const openPanel = useCallback(() => {
    opener.current = document.activeElement
    setOpen(true)
    setShowInvitation(false)
    try {
      window.sessionStorage.setItem(INVITATION_KEY, '1')
    } catch {
      // The invitation simply shows again next time
    }
  }, [])

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
        <HomePage onAsk={openPanel} onPastHero={setPastHero} />
        {open ? (
          <ChatPanel onClose={closePanel} />
        ) : (
          <Launcher ref={launcherRef} onOpen={openPanel} showInvitation={showInvitation && pastHero} />
        )}
      </div>
    </SessionProvider>
  )
}
