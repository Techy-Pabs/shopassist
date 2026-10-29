import { useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'

import { store } from '../config/store.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import {
  CloseIcon, ConversationsIcon, CustomersIcon, KnowledgeIcon, MenuIcon, OpenStoreIcon, OverviewIcon, SignOutIcon,
} from './icons.jsx'
import { useAdminSession } from './session.jsx'

const PAGES = [
  { to: '/admin', label: 'Overview', icon: OverviewIcon, end: true },
  { to: '/admin/conversations', label: 'Conversations', icon: ConversationsIcon, badge: true },
  { to: '/admin/knowledge', label: 'Knowledge', icon: KnowledgeIcon },
  { to: '/admin/customers', label: 'Customers', icon: CustomersIcon },
]

// "Loom & Lane" -> "LL"
const initials = (name) =>
  name
    .split(/\s+/)
    .filter((word) => /^[a-z]/i.test(word))
    .map((word) => word[0].toUpperCase())
    .join('')
    .slice(0, 2)

const rowLink =
  'flex h-sa-control-lg items-center gap-sa-2.5 rounded-sa-md px-sa-2.5 text-sa-ink no-underline hover:bg-sa-surface-muted'

// How many conversations need attention, for the badge beside Conversations
function useAttentionCount() {
  const { api } = useAdminSession()
  const [count, setCount] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.request('GET', '/admin/stats').then((result) => {
      if (!cancelled && result.ok) setCount(result.data.needs_attention.total)
    })
    return () => {
      cancelled = true
    }
  }, [api])
  return count
}

function Mark() {
  return (
    <div className="flex items-center gap-sa-2.5 px-sa-2">
      <span aria-hidden="true" className="flex h-sa-avatar w-sa-avatar items-center justify-center rounded-sa-md bg-sa-accent font-semibold text-sa-surface">
        S
      </span>
      <span className="text-sa-heading">ShopAssist</span>
    </div>
  )
}

function StoreChip() {
  return (
    <div className="flex h-sa-control-xl items-center gap-sa-2.5 rounded-sa-md border border-sa-line bg-sa-surface-muted px-sa-2.5">
      <span aria-hidden="true" className="flex h-sa-avatar-sm w-sa-avatar-sm items-center justify-center rounded-sa-pill bg-sa-accent-tint text-sa-micro text-sa-accent">
        {initials(store.name)}
      </span>
      <span className="flex flex-col">
        <span className="text-sa-caption text-sa-ink-muted">Store</span>
        <span className="font-semibold">{store.name}</span>
      </span>
    </div>
  )
}

function Nav({ attention, onNavigate }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-sa-0.5">
      {PAGES.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            isActive
              ? `${rowLink} bg-sa-accent-tint font-semibold text-sa-accent hover:bg-sa-accent-tint`
              : rowLink
          }
        >
          <Icon />
          <span className="flex-1">{label}</span>
          {badge && attention > 0 && (
            <span className="flex h-sa-badge min-w-sa-badge-min items-center justify-center rounded-sa-pill bg-sa-attention-tint px-sa-1.5 text-sa-caption font-semibold text-sa-attention">
              {attention}
              <span className="sr-only"> need attention</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Account({ onNavigate }) {
  const { user, signOut } = useAdminSession()
  return (
    <div className="flex flex-col gap-sa-0.5 border-t border-sa-line pt-sa-3">
      <Link to="/" onClick={onNavigate} className={rowLink}>
        <OpenStoreIcon />
        Open the store&apos;s chat
      </Link>
      <div className="flex items-center gap-sa-2.5 px-sa-2.5 py-sa-2">
        <span aria-hidden="true" className="flex h-sa-avatar w-sa-avatar shrink-0 items-center justify-center rounded-sa-pill bg-sa-ink text-sa-caption font-semibold text-sa-surface">
          {user.email[0].toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{user.email}</span>
          <span className="text-sa-caption text-sa-ink-muted">Admin</span>
        </span>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="flex h-sa-touch w-sa-touch shrink-0 cursor-pointer items-center justify-center rounded-sa-md border-0 bg-transparent text-sa-ink-muted hover:bg-sa-surface-muted sm:h-sa-control-md sm:w-sa-control-md"
        >
          <SignOutIcon />
        </button>
      </div>
    </div>
  )
}

function Sidebar({ attention }) {
  return (
    <aside className="sticky top-0 flex h-dvh w-sa-sidebar shrink-0 flex-col gap-sa-6 overflow-y-auto border-r border-sa-line bg-sa-surface px-sa-3 py-sa-5">
      <Mark />
      <StoreChip />
      <Nav attention={attention} />
      <div className="mt-auto">
        <Account />
      </div>
    </aside>
  )
}

// On a phone: a header with the page's name, and a menu button that shows
// and hides the sidebar's contents below it (the disclosure pattern).
// Escape, or choosing a page, closes it.
function PhoneHeader({ attention }) {
  const { user } = useAdminSession()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const menuId = useId()
  const current = [...PAGES].reverse().find((page) => (page.end ? pathname === page.to : pathname.startsWith(page.to)))

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    // One header landmark around the bar and its menu, so everything in the
    // menu is inside a landmark
    <header className="border-b border-sa-line bg-sa-surface">
      <div className="flex items-center gap-sa-2 py-sa-2 pl-sa-3 pr-sa-2">
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
          className="flex h-sa-touch w-sa-touch cursor-pointer items-center justify-center rounded-sa-md border-0 bg-transparent text-sa-ink"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">{current?.label ?? 'ShopAssist admin'}</span>
          <span className="text-sa-caption text-sa-ink-muted">{store.name}</span>
        </span>
        <span aria-hidden="true" className="mr-sa-1.5 flex h-sa-avatar-lg w-sa-avatar-lg items-center justify-center rounded-sa-pill bg-sa-ink text-sa-caption font-semibold text-sa-surface">
          {user.email[0].toUpperCase()}
        </span>
      </div>
      {/* The hidden attribute and the "hidden" class: on its own, the
          attribute loses to a display class like flex and the menu shows */}
      <div
        id={menuId}
        hidden={!open}
        className={open ? 'flex flex-col gap-sa-4 border-t border-sa-line px-sa-3 pb-sa-3 pt-sa-4' : 'hidden'}
      >
        <StoreChip />
        <Nav attention={attention} onNavigate={() => setOpen(false)} />
        <Account onNavigate={() => setOpen(false)} />
      </div>
    </header>
  )
}

export default function AdminLayout({ children }) {
  const isMobile = useIsMobile()
  const attention = useAttentionCount()
  if (isMobile) {
    return (
      <div className="min-h-dvh">
        <PhoneHeader attention={attention} />
        <main className="p-sa-4">{children}</main>
      </div>
    )
  }
  return (
    <div className="flex min-h-dvh">
      <Sidebar attention={attention} />
      <main className="min-w-0 flex-1 px-sa-10 pb-sa-12 pt-sa-7">
        <div className="mx-auto max-w-sa-content">{children}</div>
      </main>
    </div>
  )
}
