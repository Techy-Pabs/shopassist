import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'

import { usePageTitle } from '../look.js'

// Every admin page starts with this. After moving to a page, focus goes to
// its heading, so screen readers announce where they are (in the same update
// that shows the page, so the heading never appears unfocused). Children (such as
// controls) sit to the right. On a phone the header bar already shows the
// page's name, so a page can keep its heading for screen readers only.
export function PageHeader({ title, description, children, srOnly = false }) {
  const heading = useRef(null)
  usePageTitle(title)
  useLayoutEffect(() => {
    heading.current?.focus()
  }, [title])
  return (
    <header className="flex flex-wrap items-end justify-between gap-sa-4">
      <div className={srOnly ? 'sr-only' : 'flex flex-col gap-sa-1'}>
        <h1 ref={heading} tabIndex={-1} className="m-0 text-sa-title outline-none">
          {title}
        </h1>
        {description && <p className="m-0 text-sa-ink-muted">{description}</p>}
      </div>
      {children}
    </header>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-sa-6">
      <PageHeader title="Page not found" description="There is no admin page at this address." />
      <Link to="/admin" className="inline-flex min-h-sa-touch items-center self-start sm:min-h-0">Go to the overview</Link>
    </div>
  )
}
