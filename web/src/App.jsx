import { useCallback, useEffect, useRef, useState } from 'react'

import ChatPanel from './components/ChatPanel.jsx'
import Launcher from './components/Launcher.jsx'
import Storefront from './components/Storefront.jsx'
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
  const launcherRef = useRef(null)
  const returnFocus = useRef(false)

  const openPanel = useCallback(() => {
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

  // After closing, focus goes back to the launcher
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false
      launcherRef.current?.focus()
    }
  }, [open])

  return (
    <SessionProvider fetchImpl={fetchImpl}>
      <div className="relative min-h-screen bg-surface-100 text-ink">
        <Storefront />
        {open ? (
          <ChatPanel onClose={closePanel} />
        ) : (
          <Launcher ref={launcherRef} onOpen={openPanel} showInvitation={showInvitation} />
        )}
      </div>
    </SessionProvider>
  )
}
