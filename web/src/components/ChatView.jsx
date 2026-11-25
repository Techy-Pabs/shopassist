import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { store } from '../config/store.js'
import { STICK_TO_BOTTOM_WITHIN } from '../design.js'
import { GIVE_UP_AFTER, useWake } from '../hooks/useWake.js'
import { loadConversationId, saveConversationId } from '../lib/conversationStore.js'
import { formatDivider, sameDay } from '../lib/dates.js'
import { useSession } from '../session/SessionContext.jsx'
import Composer from './Composer.jsx'
import DateDivider from './DateDivider.jsx'
import GuestLimitCard from './GuestLimitCard.jsx'
import MessageBubble from './MessageBubble.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import UnavailableCard from './UnavailableCard.jsx'
import WakingScreen from './WakingScreen.jsx'
import WelcomeScreen from './WelcomeScreen.jsx'

let localKey = 0

// While a question is "Still answering…" elsewhere, how often to look for
// its reply
export const POLL_EVERY = 3_000

// The server's messages, as the chat keeps them
const fromServer = (list) => list.map((m) => ({ ...m, key: `id-${m.id}` }))

// The chat, signed in or as a guest: the waking screen, the welcome screen,
// or the conversation, with the input below. onSignIn(mode) opens sign in
// ("sign-in" or "create") for a guest.
export default function ChatView({ inputRef, onStatus, onSignIn }) {
  const { api, draft, setDraft, signOut, isGuest, guest, refreshUsage, reachGuestLimit, guestChatOff } = useSession()
  // A guest who can't ask more: out of questions, or the daily guest limit
  const locked = isGuest && Boolean(guest.limit)
  // The card takes focus when the message box is disabled under the guest:
  // after a refusal, or when their last question has just been answered
  const [refused, setRefused] = useState(false)
  const wasLocked = useRef(locked)
  useEffect(() => {
    if (locked && !wasLocked.current) {
      const active = document.activeElement
      // Focus was in the message form (its box or Send button), both now disabled
      if (!active || active === document.body || inputRef?.current?.form?.contains(active)) setRefused(true)
    }
    wasLocked.current = locked
  }, [locked, inputRef])
  const wake = useWake(api)
  const [conversationId, setConversationId] = useState(loadConversationId)
  const conversationRef = useRef(conversationId)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(Boolean(conversationId))
  // A message that couldn't be sent because the session ended comes back here
  const [input, setInput] = useState(draft)
  const [inputError, setInputError] = useState(null)
  const [waiting, setWaiting] = useState(false)
  // The one polite live region: typing, then each new reply
  const [announcement, setAnnouncement] = useState('')
  // Questions (by key) whose send got no answer at all: the server may or may
  // not have saved them, so a retry checks before sending again
  const retrying = useRef(new Set())
  // The messages as last rendered, for code that runs after an await
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // The pending look for a reply that's still being written, and whether the
  // chat is still open (polling stops when it closes)
  const pollTimer = useRef(null)
  // The question another request is answering: { key, conversationId,
  // questionId, deadline }. deadline: when the server will count it as
  // failed (from its Retry-After or retry_in, so the cut-off lives in one
  // place); the chat stops waiting then, even if it can't reach the server.
  const answering = useRef(null)
  const giveUpTimer = useRef(null)
  const mounted = useRef(true)
  // The latest look-again function, for the online event (see below)
  const pollRef = useRef(null)
  useEffect(() => {
    mounted.current = true
    // Looking again is pointless while the browser is offline: pause, and
    // look straight away when it's back
    const online = () => {
      if (!answering.current) return
      clearTimeout(pollTimer.current)
      pollRef.current?.()
    }
    const offline = () => clearTimeout(pollTimer.current)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      mounted.current = false
      clearTimeout(pollTimer.current)
      clearTimeout(giveUpTimer.current)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])
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
      if (result.ok) setMessages(fromServer(result.data))
      else if (result.status === 404) rememberConversation(null) // gone, or another account's
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [api, rememberConversation])

  // Change one question's bubble (by its key) in place
  function update(key, patch) {
    setMessages((list) => list.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  async function send(text) {
    if (waiting || locked) return
    // Shown straight away, before the server answers
    const key = `local-${++localKey}`
    setMessages((list) => [...list, { key, role: 'user', content: text, status: 'sending', created_at: new Date().toISOString() }])
    setInput('')
    await deliver({ key, content: text, id: null })
  }

  // Retry a question whose reply failed. The same bubble goes back to
  // sending: no second bubble, and the question isn't saved twice.
  function retry(question) {
    if (waiting) return
    update(question.key, { status: 'sending' })
    // The Retry button goes with the failed state: keep keyboard users in place
    inputRef.current?.focus()
    deliver(question)
  }

  // Get the reply to a question: send it, or (when it was saved as failed)
  // ask for the reply to that same message
  async function deliver({ key, content: text, id: messageId }) {
    setInputError(null)
    setWaiting(true)
    setAnnouncement(`${store.name} is typing`)
    stickToBottom.current = true

    let id = conversationRef.current
    if (!id) {
      // Created on the first message only, so opening the panel never
      // leaves empty conversations behind
      const created = await api.createConversation()
      if (!created.ok) return sendFailed(created, key, text)
      id = created.data.id
      rememberConversation(id)
    }

    let result
    if (messageId) {
      result = await api.retryMessage(id, messageId)
      // Another request (a second tab, a double tap) is answering it
      if (result.code === 'reply_in_progress') return stillAnswering(key, id, messageId, result.retryAfter)
    } else if (retrying.current.has(key)) {
      // A retry of a question whose send got no answer: it may have reached
      // the server, and even been answered. Look before sending it again.
      return lookBeforeResending(key, id, text)
    } else {
      result = await api.sendMessage(id, text)
    }
    if (!result.ok) return sendFailed(result, key, text)
    replied(key, result.data)
  }

  function replied(key, reply) {
    setWaiting(false)
    update(key, { status: 'sent' })
    setMessages((list) => [...list, { ...reply, key: `id-${reply.id}` }])
    setAnnouncement(`${store.name} replied: ${reply.content}`)
    refreshUsage() // a guest has one question fewer
  }

  // The send got no answer: reload the conversation, and send the question
  // again only if the server doesn't have it
  async function lookBeforeResending(key, conversationId, text) {
    const loaded = await api.listMessages(conversationId)
    if (!mounted.current) return
    if (!loaded.ok) return sendFailed(loaded, key, text)
    // Ours: a question the chat didn't know about, with the same words (the
    // server trims them), the latest such
    const known = new Set(messagesRef.current.filter((m) => m.id).map((m) => m.id))
    const question = [...loaded.data].reverse().find((m) => m.role === 'user' && !known.has(m.id) && m.content === text.trim())
    retrying.current.delete(key)
    if (!question) {
      // It never arrived: send it now
      const result = await api.sendMessage(conversationId, text)
      if (!result.ok) return sendFailed(result, key, text)
      return replied(key, result.data)
    }
    // It arrived: show the conversation as the server has it
    setMessages(fromServer(loaded.data))
    const questionKey = `id-${question.id}`
    if (question.status === 'failed') return deliver({ key: questionKey, content: question.content, id: question.id })
    if (question.status === 'sending') return stillAnswering(questionKey, conversationId, question.id, question.retry_in)
    finishedElsewhere(loaded.data, question)
  }

  // Another request is writing this question's reply: say so on the bubble
  // (no error, no Retry), and look again every few seconds until the reply
  // is there, the server says the question failed, or its cut-off passes.
  // retryIn: the server's seconds until the question counts as failed.
  function stillAnswering(key, conversationId, questionId, retryIn) {
    update(key, { status: 'answering' })
    setWaiting(true)
    if (!answering.current) setAnnouncement('Still answering. The reply will appear here.')
    const deadline = retryIn != null ? Date.now() + retryIn * 1000 : (answering.current?.deadline ?? null)
    answering.current = { key, conversationId, questionId, deadline }
    clearTimeout(giveUpTimer.current)
    if (deadline != null) giveUpTimer.current = setTimeout(giveUp, Math.max(0, deadline - Date.now()))
    lookAgainSoon()
  }

  function lookAgainSoon() {
    clearTimeout(pollTimer.current)
    // Offline: paused until the online event
    if (answering.current && navigator.onLine !== false) pollTimer.current = setTimeout(lookAgain, POLL_EVERY)
  }

  async function lookAgain() {
    const current = answering.current
    if (!current) return
    const loaded = await api.listMessages(current.conversationId)
    if (!mounted.current || answering.current !== current) return
    if (loaded.kind === 'session-ended') return stopAnswering()
    const question = loaded.ok ? loaded.data.find((m) => m.id === current.questionId) : null
    if (!question || question.status === 'sending') {
      return stillAnswering(current.key, current.conversationId, current.questionId, question?.retry_in)
    }
    stopAnswering()
    setMessages(fromServer(loaded.data))
    finishedElsewhere(loaded.data, question)
  }
  pollRef.current = lookAgain

  // The server's cut-off has passed without a reply: the question counts as
  // failed there too, so show it failed, with Retry (by its id)
  function giveUp() {
    const current = answering.current
    if (!current) return
    stopAnswering()
    update(current.key, { status: 'failed', id: current.questionId })
    setWaiting(false)
    setAnnouncement('Not sent: The reply took too long. Use Retry to try again.')
  }

  function stopAnswering() {
    clearTimeout(pollTimer.current)
    clearTimeout(giveUpTimer.current)
    answering.current = null
  }

  // The question was answered, or failed, by another request: the
  // conversation is already showing as the server has it
  function finishedElsewhere(serverMessages, question) {
    setWaiting(false)
    if (question.status === 'failed') {
      setAnnouncement('Not sent: The assistant is unavailable right now. Use Retry to try again.')
      return
    }
    const reply = serverMessages.find((m) => m.role === 'assistant' && serverMessages.indexOf(m) > serverMessages.indexOf(question))
    if (reply) setAnnouncement(`${store.name} replied: ${reply.content}`)
    refreshUsage()
  }

  // Not sent: take the bubble back (the text goes back to the input or the draft)
  function takeBack(key) {
    setMessages((list) => list.filter((m) => m.key !== key))
  }

  function sendFailed(result, key, text) {
    setWaiting(false)
    setAnnouncement('')
    if (result.kind === 'session-ended') {
      // The panel is about to show sign in: keep the text for afterwards
      setDraft(text)
      return
    }
    if (result.kind === 'validation') {
      // Not sent: take the bubble back and return the text to the input
      takeBack(key)
      setInput(text)
      setInputError(result.fieldErrors.content ?? result.message)
      return
    }
    if (result.code === 'guest_limit_reached' || result.code === 'guest_daily_limit_reached') {
      // The question wasn't saved: it's kept for after signing in
      takeBack(key)
      setDraft(text)
      setRefused(true)
      reachGuestLimit(result.code)
      return
    }
    if (result.code === 'guest_too_fast') {
      takeBack(key)
      setInput(text)
      setInputError(result.message)
      return
    }
    if (result.code === 'guest_chat_disabled') {
      // Guest chat was turned off: sign in instead, with the text kept
      takeBack(key)
      setDraft(text)
      guestChatOff()
      return
    }
    // A failed reply still saved the question: a guest has one fewer
    if (result.kind === 'unavailable') refreshUsage()
    if (result.status === 404) rememberConversation(null)
    // The bubble stays, marked "Not sent", with Retry. With the server's id
    // (a 502) the retry answers that same message; without one, the send
    // may not have arrived
    update(key, { status: 'failed', ...(result.messageId ? { id: result.messageId } : {}) })
    if (!result.messageId) retrying.current.add(key)
    setAnnouncement(`Not sent: ${result.message} Use Retry to try again.`)
  }

  // Follow new messages, unless the customer has scrolled up to read
  function onScroll() {
    const el = scrollRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_WITHIN
  }
  const showWelcome = !loading && messages.length === 0 && wake.state !== 'unavailable' && !locked
  // The latest question, when its reply failed: the only one that can be retried
  const last = messages[messages.length - 1]
  const lastFailed = last?.role === 'user' && last.status === 'failed' ? last : null
  // The welcome screen is read from the top: only a conversation follows
  // its newest message
  useLayoutEffect(() => {
    if (!showWelcome && stickToBottom.current) endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, waiting, showWelcome])

  // For the panel header: "connecting", "typing", "unavailable" or "ready"
  const status =
    wake.state === 'waking' ? 'connecting'
    : waiting ? 'typing'
    : lastFailed || wake.state === 'unavailable' ? 'unavailable'
    : 'ready'
  useEffect(() => {
    onStatus?.(status)
  }, [status, onStatus])

  // When the chat appears (or the waking screen gives way to it), the message
  // box takes focus if nothing else has it: focus is on the panel itself or
  // nowhere. Focus the visitor moved somewhere else stays there.
  const awake = wake.state !== 'waking'
  useEffect(() => {
    const active = document.activeElement
    if (awake && (!active || active === document.body || active.getAttribute('role') === 'dialog')) inputRef?.current?.focus()
  }, [awake, inputRef])

  if (wake.state === 'waking') return <WakingScreen elapsed={wake.elapsed} total={GIVE_UP_AFTER} />

  return (
    <>
      <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {showWelcome ? (
          <WelcomeScreen
            onSuggestion={(label) => {
              // The chips go away once it's sent: keep keyboard users in place
              inputRef.current?.focus()
              send(label)
            }}
            disabled={waiting}
            guest={isGuest}
            notice={isGuest ? guest.notice : null}
          />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const date = new Date(message.created_at)
              const newDay = !previous || !sameDay(new Date(previous.created_at), date)
              return (
                <div key={message.key} className="contents">
                  {newDay && <DateDivider label={formatDivider(date)} />}
                  <MessageBubble
                    role={message.role}
                    content={message.content}
                    spaced={!newDay && previous.role !== message.role}
                    failed={message.status === 'failed'}
                    answering={message.status === 'answering'}
                    onRetry={message === lastFailed && !locked ? () => retry(message) : undefined}
                  />
                </div>
              )
            })}
            {/* "Still answering…" is on the bubble itself */}
            {waiting && !messages.some((m) => m.status === 'answering') && <TypingIndicator spaced={messages.length > 0} />}
            {wake.state === 'unavailable' && <UnavailableCard questionSaved={false} onRetry={wake.retry} />}
            {locked && (
              <GuestLimitCard
                kind={guest.limit}
                limit={guest.questionLimit}
                takeFocus={refused}
                onCreate={() => onSignIn?.('create')}
                onSignIn={() => onSignIn?.('sign-in')}
              />
            )}
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
        onSignOut={isGuest ? undefined : signOut}
        waiting={waiting}
        error={inputError}
        inputRef={inputRef}
        guest={isGuest ? { questionsLeft: guest.questionsLeft, onSignIn: () => onSignIn?.('sign-in') } : null}
        locked={locked}
      />
    </>
  )
}
