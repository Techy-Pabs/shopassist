import { Fragment, useEffect, useId, useRef, useState } from 'react'

import { announcements, demo, menu } from '../../config/home.js'
import { store } from '../../config/store.js'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { CloseIcon, MenuIcon } from '../Icons.jsx'

// There is no shop behind the page, so search, account and the bag are left
// out; every link scrolls to a section of this page.
const navLink = 'text-ink no-underline hover:text-clay'

// The demo strip: ink, with an underlined text button in surface-100 (clay
// on ink is too faint for small text). The button is a full size target.
function DemoStrip({ onAsk }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 bg-ink px-4 py-1 text-center text-label font-normal text-surface-100 sm:py-0">
      <p className="m-0 py-2 sm:py-0">{demo.text}</p>
      <button
        type="button"
        onClick={onAsk}
        aria-haspopup="dialog"
        className="min-h-control cursor-pointer border-0 bg-transparent p-0 font-sans text-label text-surface-100 underline hover:text-sand"
      >
        {demo.action}
      </button>
    </div>
  )
}

// The dots between items are decoration, so screen readers skip them
const Dot = () => (
  <span aria-hidden="true" className="text-indigo-tint">
    ·
  </span>
)

function Announcements({ isMobile }) {
  // On phones, one line of text that wraps like a sentence (as in the mockup)
  if (isMobile) {
    const items = announcements.filter((a) => a.short)
    return (
      <p className="m-0 bg-indigo px-4 py-2.5 text-center text-caption text-surface-100">
        {items.map((item, index) => (
          <Fragment key={item.short}>
            {index > 0 && (
              <>
                {' '}
                <Dot />{' '}
              </>
            )}
            {item.short}
          </Fragment>
        ))}
      </p>
    )
  }
  return (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-6 gap-y-2 bg-indigo px-6 py-2.5 text-label font-medium text-surface-100">
      {announcements.map((item, index) => (
        <li key={item.text} className="flex gap-x-6">
          {index > 0 && <Dot />}
          {item.text}
        </li>
      ))}
    </ul>
  )
}

// Mobile: a button that shows and hides the menu below the header (the
// disclosure pattern). Escape or choosing a link closes it.
function MobileMenu() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <div className="flex items-center gap-1 border-b border-sand py-2 pl-1 pr-2">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
          className="flex h-control w-control cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-ink"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
        <a href="/" className="flex-1 font-serif text-brand-sm text-ink no-underline">
          {store.name}
        </a>
      </div>
      <nav id={menuId} aria-label="Main" hidden={!open} className="border-b border-sand px-4 py-2">
        <ul className="m-0 list-none p-0">
          {menu.map((item) => (
            <li key={item.section}>
              <a
                href={`#${item.section}`}
                onClick={() => setOpen(false)}
                className={`flex h-control-lg items-center text-body font-semibold ${navLink}`}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

function DesktopHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sand px-12 py-5">
      <a href="/" className="font-serif text-brand-lg text-ink no-underline">
        {store.name}
      </a>
      <nav aria-label="Main">
        <ul className="m-0 flex list-none flex-wrap gap-7 p-0 text-body-small font-medium">
          {menu.map((item) => (
            <li key={item.section}>
              {/* A full size target; it also gives the row the mockup's height */}
              <a href={`#${item.section}`} className={`flex min-h-control items-center ${navLink}`}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default function SiteHeader({ onAsk }) {
  const isMobile = useIsMobile()
  return (
    <header>
      <DemoStrip onAsk={onAsk} />
      <Announcements isMobile={isMobile} />
      {isMobile ? <MobileMenu /> : <DesktopHeader />}
    </header>
  )
}
