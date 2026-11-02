import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { usePageTitle } from './look.js'
import { useAdminSession } from './session.jsx'

// The screens before the dashboard: sign in, not allowed, unreachable, checking

// Each screen's heading takes focus when it appears (after signing out, say),
// so screen readers announce where they are and Tab starts from here
function Card({ children }) {
  const card = useRef(null)
  useLayoutEffect(() => {
    card.current.querySelector('h1')?.focus()
  }, [])
  return (
    <main className="flex min-h-dvh items-center justify-center p-sa-4">
      <div ref={card} className="flex w-full max-w-sa-dialog flex-col gap-sa-6 rounded-sa-lg border border-sa-line bg-sa-surface p-sa-6">
        <div className="flex items-center gap-sa-2.5">
          <span aria-hidden="true" className="flex h-sa-avatar w-sa-avatar items-center justify-center rounded-sa-md bg-sa-accent font-semibold text-sa-surface">
            S
          </span>
          <span className="text-sa-heading">ShopAssist</span>
        </div>
        {children}
      </div>
    </main>
  )
}

const primaryButton =
  'flex h-sa-control-xl w-full cursor-pointer items-center justify-center rounded-sa-md border-0 bg-sa-accent font-sans text-sa-body font-semibold text-sa-surface disabled:cursor-default'
const field =
  'h-sa-control-xl w-full rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-3 font-sans text-sa-body text-sa-ink'

export function SignIn() {
  const { signIn, notice } = useAdminSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const ids = useId()
  usePageTitle('Sign in')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const failed = await signIn(email.trim(), password)
    setBusy(false)
    if (failed) setError(failed.message)
  }

  return (
    <Card>
      <div className="flex flex-col gap-sa-1">
        <h1 tabIndex={-1} className="m-0 text-sa-title outline-none">Sign in to the dashboard</h1>
        <p className="m-0 text-sa-ink-muted">For store admins. Use the account that has admin access.</p>
      </div>
      {notice && (
        <p role="status" className="m-0 rounded-sa-md border border-sa-attention-line bg-sa-attention-wash px-sa-3 py-sa-2.5 text-sa-attention">
          {notice}
        </p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-sa-4">
        <div className="flex flex-col gap-sa-1.5">
          <label htmlFor={`${ids}-email`} className="text-sa-small font-medium">Email</label>
          <input id={`${ids}-email`} type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={field} />
        </div>
        <div className="flex flex-col gap-sa-1.5">
          <label htmlFor={`${ids}-password`} className="text-sa-small font-medium">Password</label>
          <input id={`${ids}-password`} type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={field} />
        </div>
        {error && (
          <p role="alert" className="m-0 text-sa-small font-medium text-sa-danger-ink">{error}</p>
        )}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <Link to="/" className="inline-flex min-h-sa-touch items-center self-start text-sa-small sm:min-h-0">Back to the store</Link>
    </Card>
  )
}

export function NotAllowed() {
  const { user, signOut } = useAdminSession()
  usePageTitle('Not allowed')
  return (
    <Card>
      <div className="flex flex-col gap-sa-2">
        <h1 tabIndex={-1} className="m-0 text-sa-title outline-none">This area is for store admins</h1>
        <p className="m-0 text-sa-ink-muted">
          You&apos;re signed in as {user.email}, which is a customer account. The store&apos;s chat is where customers
          ask their questions.
        </p>
      </div>
      <Link to="/" className={`${primaryButton} no-underline hover:text-sa-surface`}>
        Back to the store
      </Link>
      <button type="button" onClick={signOut}
        className="flex h-sa-control-xl w-full cursor-pointer items-center justify-center rounded-sa-md border border-sa-line-strong bg-sa-surface font-sans text-sa-body font-semibold text-sa-ink">
        Sign in with another account
      </button>
    </Card>
  )
}

export function Unreachable() {
  const { retry } = useAdminSession()
  usePageTitle('Unavailable')
  return (
    <Card>
      <div role="alert" className="flex flex-col gap-sa-2">
        <h1 tabIndex={-1} className="m-0 text-sa-title outline-none">We couldn&apos;t reach ShopAssist</h1>
        <p className="m-0 text-sa-ink-muted">The server may be waking up after a quiet spell. Try again in a moment.</p>
      </div>
      <button type="button" onClick={retry} className={primaryButton}>Try again</button>
    </Card>
  )
}

export function Checking() {
  return (
    <Card>
      <p role="status" className="m-0 text-sa-ink-muted">Checking your account…</p>
    </Card>
  )
}
