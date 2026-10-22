import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { store } from '../config/store.js'
import { STICK_TO_BOTTOM_WITHIN } from '../design.js'
import { GIVE_UP_AFTER, useWake } from '../hooks/useWake.js'
import { loadConversationId, saveConversationId } from '../lib/conversationStore.js'
import { formatDivider, sameDay } from '../lib/dates.js'
import { useSession } from '../session/SessionContext.jsx'
import Composer from './Composer.jsx'
import DateDivider from './DateDivider.jsx'
import MessageBubble from './MessageBubble.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import UnavailableCard from './UnavailableCard.jsx'
import WakingScreen from './WakingScreen.jsx'
import WelcomeScreen from './WelcomeScreen.jsx'

let localKey = 0

// The signed in chat: the waking screen, the welcome screen, or the
// conversation, with the input below.
export default function ChatView({ inputRef }) {
  const { api, draft, setDraft, signOut } = useSession()
  const wake = useWake(api)
  const [conversationId, setConversationId] = useState(loadConversationId)
  const conversationRef = useRef(conversationId)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(Boolean(conversationId))
  // A message that couldn't be sent because the session ended comes back here
  const [input, setInput] = useState(draft)
  const [inputError, setInputError] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState(null) // { text } of the send that failed
  // The one polite live region: typing, then each new reply
  const [announcement, setAnnouncement] = useState('')
  const scrollRef = useRef(null)
  const endRef = useRef(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    if (draft) setDraft('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rememberConversation = useCallback((id) => {
    conversationRef.current = id
    setConversationId(id)
    saveConversationId(id)
  }, [])

  // Resume this tab's conversation, if there is one
  useEffect(() => {
    const id = conversationRef.current
    if (!id) return undefined
    let cancelled = false
    api.listMessages(id).then((result) => {
      if (cancelled) return
      if (result.ok) setMessages(result.data)
      else if (result.status === 404) rememberConversation(null) // gone, or another account's
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [api, rememberConversation])

  async function send(text, { retry = false } = {}) {
    if (waiting) return
    if (!retry) {
      // Shown straight away, before the server answers
      setMessages((list) => [...list, { key: `local-${++localKey}`, role: 'user', content: text, created_at: new Date().toISOString(), local: true }])
      setInput('')
    }
    setFailed(null)
    setInputError(null)
    setWaiting(true)
    setAnnouncement(`${store.name} is typing`)
    stickToBottom.current = true

    let id = conversationRef.current
    if (!id) {
      // Created on the first message only, so opening the panel never
      // leaves empty conversations behind
      const created = await api.createConversation()
      if (!created.ok) return sendFailed(created, text, retry)
      id = created.data.id
      rememberConversation(id)
    }

    let result
    if (retry) {
      // The question is normally already saved: ask only for the reply, so
      // it isn't stored twice. 409 means it never reached the server, so
      // send it again in full.
      result = await api.retryReply(id)
      if (result.status === 409) result = await api.sendMessage(id, text)
    } else {
      result = await api.sendMessage(id, text)
    }
    if (!result.ok) return sendFailed(result, text, retry)
    setWaiting(false)
    setMessages((list) => [...list, result.data])
    setAnnouncement(`${store.name} replied: ${result.data.content}`)
  }

  function sendFailed(result, text, retry) {
    setWaiting(false)
    setAnnouncement('')
    if (result.kind === 'session-ended') {
      // The panel is about to show sign in: keep the text for afterwards
      setDraft(text)
      return
    }
    if (result.kind === 'validation') {
      // Not sent: take the bubble back and return the text to the input
      if (!retry) {
        setMessages((list) => {
          const last = list[list.length - 1]
          return last?.local && last.content === text ? list.slice(0, -1) : list
        })
        setInput(text)
      }
      setInputError(result.fieldErrors.content ?? result.message)
      return
    }
    if (result.status === 404) rememberConversation(null)
    setFailed({ text })
  }

  // Follow new messages, unless the customer has scrolled up to read
  function onScroll() {
    const el = scrollRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_WITHIN
  }
  useLayoutEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, waiting, failed])

  if (wake.state === 'waking') return <WakingScreen elapsed={wake.elapsed} total={GIVE_UP_AFTER} />

  const showWelcome = !loading && messages.length === 0 && wake.state !== 'unavailable'
  return (
    <>
      <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {showWelcome ? (
          <WelcomeScreen onSuggestion={(label) => send(label)} disabled={waiting} />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const date = new Date(message.created_at)
              const newDay = !previous || !sameDay(new Date(previous.created_at), date)
              return (
                <div key={message.id ?? message.key} className="contents">
                  {newDay && <DateDivider label={formatDivider(date)} />}
                  <MessageBubble role={message.role} content={message.content} spaced={!newDay && previous.role !== message.role} />
                </div>
              )
            })}
            {waiting && <TypingIndicator spaced={messages.length > 0} />}
            {failed && <UnavailableCard onRetry={() => send(failed.text, { retry: true })} />}
            {wake.state === 'unavailable' && !failed && <UnavailableCard questionSaved={false} onRetry={wake.retry} />}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Composer
        value={input}
        onChange={setInput}
        onSend={(text) => send(text)}
        onSignOut={signOut}
        waiting={waiting}
        error={inputError}
        inputRef={inputRef}
      />
    </>
  )
}
