import { useId, useRef, useState } from 'react'

import { store } from '../config/store.js'
import { useSession } from '../session/SessionContext.jsx'
import StitchedRule from './StitchedRule.jsx'

const MODES = [
  { id: 'sign-in', label: 'Sign in', submit: 'Sign in and start chatting', busy: 'Signing in…' },
  { id: 'create', label: 'Create account', submit: 'Create account and start chatting', busy: 'Creating your account…' },
]

// Shared styles. Controls use the control-lg size on mobile and control on desktop.
const inputClass =
  'box-border h-control-lg rounded-sm border border-line-strong bg-surface-raised px-3.5 font-sans text-body text-ink sm:h-control'
const errorClass = 'm-0 text-body-small font-medium text-danger'

function Field({ id, label, type, value, onChange, error, hint, autoComplete, inputRef }) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={id.split('-').pop()}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={inputClass}
      />
      {error && (
        <p id={errorId} className={errorClass}>
          {error}
        </p>
      )}
      {hint && (
        <span id={hintId} className="text-caption font-normal text-ink-muted">
          {hint}
        </span>
      )}
    </div>
  )
}

export default function SignInForm({ emailRef }) {
  const { api, signIn, notice } = useSession()
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const tabRefs = useRef({})
  const ids = useId()
  const current = MODES.find((m) => m.id === mode)

  function selectMode(id, { focus = false } = {}) {
    setMode(id)
    setFieldErrors({})
    setFormError(null)
    if (focus) tabRefs.current[id]?.focus()
  }

  // Tabs pattern: arrow keys move between tabs, Home and End jump to the ends
  function onTabKeyDown(event) {
    const index = MODES.findIndex((m) => m.id === mode)
    const next = {
      ArrowRight: (index + 1) % MODES.length,
      ArrowLeft: (index - 1 + MODES.length) % MODES.length,
      Home: 0,
      End: MODES.length - 1,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    selectMode(MODES[next].id, { focus: true })
  }

  function showFailure(result) {
    if (result.kind === 'validation') {
      setFieldErrors(result.fieldErrors)
      // A message for a field we don't show still needs to be seen
      const shown = ['email', 'password']
      const other = Object.entries(result.fieldErrors).find(([field]) => !shown.includes(field))
      setFormError(other ? other[1] : null)
    } else if (result.status === 400 && mode === 'create') {
      // "Email already registered" belongs under the email field
      setFieldErrors({ email: result.message })
      setFormError(null)
    } else {
      setFieldErrors({})
      setFormError(result.message)
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFieldErrors({})
    setFormError(null)
    try {
      if (mode === 'create') {
        const created = await api.register(email, password)
        if (!created.ok) return showFailure(created)
      }
      const result = await api.login(email, password)
      if (!result.ok) return showFailure(result)
      signIn(result.data.access_token)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-8">
      <div className="flex flex-col gap-2">
        <h3 className="m-0 font-serif text-heading text-ink">Sign in to chat</h3>
        <p className="m-0 text-body text-ink-muted">
          So we can keep your conversations together and pick up where you left off.
        </p>
      </div>

      {notice && (
        <p role="status" className={errorClass}>
          {notice}
        </p>
      )}

      <div role="tablist" aria-label="Account" className="grid grid-cols-2 rounded-pill bg-sand p-1">
        {MODES.map((m) => {
          const selected = m.id === mode
          return (
            <button
              key={m.id}
              ref={(el) => (tabRefs.current[m.id] = el)}
              id={`${ids}-tab-${m.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${ids}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectMode(m.id)}
              onKeyDown={onTabKeyDown}
              className={`h-avatar cursor-pointer rounded-pill border-0 font-sans text-label text-ink ${
                selected ? 'bg-surface-raised' : 'bg-transparent'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${mode}`} className="flex flex-col gap-5">
        <Field
          id={`${ids}-email`}
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          autoComplete="email"
          inputRef={emailRef}
        />
        <Field
          id={`${ids}-password`}
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          hint="At least 8 characters."
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
        />

        {formError && (
          <p role="alert" className={errorClass}>
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="h-control-lg cursor-pointer rounded-sm border-0 bg-indigo font-sans text-body font-semibold text-surface-100 disabled:cursor-default disabled:border disabled:border-line-strong disabled:bg-sand disabled:text-ink-muted sm:h-control"
        >
          {busy ? current.busy : current.submit}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <StitchedRule />
        <span className="text-caption text-ink-muted">Prefer a person?</span>
        <StitchedRule />
      </div>
      <p className="m-0 text-center text-body-small text-ink-muted">
        Email <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a> or WhatsApp{' '}
        {store.whatsappUrl ? <a href={store.whatsappUrl}>{store.whatsappNumber}</a> : store.whatsappNumber},{' '}
        {store.supportHours}.
      </p>
    </form>
  )
}
