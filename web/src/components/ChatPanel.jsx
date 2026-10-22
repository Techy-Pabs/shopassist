import { useEffect, useId, useRef, useState } from 'react'

import { useIsMobile } from '../hooks/useIsMobile.js'
import { useSession } from '../session/SessionContext.jsx'
import ChatView from './ChatView.jsx'
import { loadConversationId, saveConversationId } from '../lib/conversationStore.js'
import HistoryList from './HistoryList.jsx'
import PanelHeader, { HistoryHeader } from './PanelHeader.jsx'
import SignInForm from './SignInForm.jsx'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The chat panel: full screen and modal below the mobile breakpoint, a
// floating non-modal panel above it. Escape closes it.
export default function ChatPanel({ onClose }) {
  const { api, isSignedIn } = useSession()
  const isMobile = useIsMobile()
  const titleId = useId()
  const panelRef = useRef(null)
  // The first field to focus: the email (signed out) or the question input
  const focusRef = useRef(null)
  const historyButtonRef = useRef(null)
  const backRef = useRef(null)
  // "chat" or "history". The chat stays mounted (hidden) while the list
  // shows, so a reply on its way isn't lost.
  const [view, setView] = useState('chat')
  // Changing chatKey starts the chat afresh: a chosen or a new conversation
  const [chatKey, setChatKey] = useState(0)
  // Where focus goes after switching views
  const [focusNext, setFocusNext] = useState(null)

  useEffect(() => {
    if (!focusNext) return
    const target = { back: backRef, history: historyButtonRef, input: focusRef }[focusNext]
    target.current?.focus()
    setFocusNext(null)
  }, [focusNext, view, chatKey])

  // Signing out (or a session ending) always returns to the chat view
  useEffect(() => {
    if (!isSignedIn) setView('chat')
  }, [isSignedIn])

  function showHistory() {
    setView('history')
    setFocusNext('back')
  }

  function backToChat() {
    setView('chat')
    setFocusNext('history')
  }

  // Continue a past conversation, or start a new one (created lazily on its
  // first message): the chat starts again with that conversation
  function switchConversation(id) {
    saveConversationId(id)
    setChatKey((key) => key + 1)
    setView('chat')
    setFocusNext('input')
  }

  // Move focus into the panel when it opens: the email field when signed
  // out, the question input when signed in, otherwise the panel itself
  useEffect(() => {
    ;(focusRef.current ?? panelRef.current)?.focus()
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
      className="panel-box fixed inset-0 z-50 flex flex-col bg-surface-100 text-ink outline-none motion-safe:animate-panel-in sm:inset-auto sm:bottom-8 sm:right-8 sm:h-panel-height sm:w-panel-width sm:rounded-lg sm:border sm:border-sand sm:shadow-panel"
    >
      {view === 'history' ? (
        <HistoryHeader titleId={titleId} onBack={backToChat} onClose={onClose} backRef={backRef} />
      ) : (
        <PanelHeader
          titleId={titleId}
          subtitle={isSignedIn ? 'AI assistant, replies in seconds' : 'AI assistant'}
          onClose={onClose}
          onHistory={isSignedIn ? showHistory : undefined}
          historyRef={historyButtonRef}
        />
      )}
      {!isSignedIn && <SignInForm emailRef={focusRef} />}
      {isSignedIn && (
        // hidden, not unmounted, while the list shows
        <div className={view === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <ChatView key={chatKey} inputRef={focusRef} />
        </div>
      )}
      {isSignedIn && view === 'history' && (
        <HistoryList
          currentId={loadConversationId()}
          onOpen={(id) => switchConversation(id)}
          onNew={() => switchConversation(null)}
        />
      )}
    </section>
  )
}
