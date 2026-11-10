import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../../App.jsx'
import { callsTo, fakeFetch } from '../../test/fakeApi.js'
import { launcherButton } from '../../test/launcher.js'
import { scrollPastHero, setMobile, showTheNote } from '../../test/setup.js'

const IMAGES = resolve(process.cwd(), 'public/images')
const GITHUB = 'https://github.com/Techy-Pabs/shopassist'

function setup() {
  const user = userEvent.setup()
  render(<App fetchImpl={fakeFetch({})} />)
  return { user }
}

// Every link must go somewhere real: this page, a section of it, the
// support email or the project on GitHub
function deadLinks() {
  return [...document.querySelectorAll('a[href]')]
    .map((a) => a.getAttribute('href'))
    .filter((href) => {
      if (href === '/' || href === GITHUB || href === 'mailto:support@loomandlane.example') return false
      if (href.startsWith('#')) return !document.getElementById(href.slice(1))
      return true
    })
}

describe('the homepage', () => {
  it('shows the header, hero and sections from the mockup', () => {
    setup()

    expect(screen.getByRole('link', { name: 'Loom & Lane' })).toHaveAttribute('href', '/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'New in', 'Women', 'Men', 'Accessories', 'Our fabrics', 'Help',
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Cloth made for Lagos days' })).toBeInTheDocument()
    for (const name of ['Shop by collection', 'Just arrived', 'Cloth with a story in every fold', 'Between sizes?', 'Returns and exchanges', 'Still have a question?']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    for (const name of ['Green lace panel dress', 'White pleat kaftan', 'Brown stripe shirt', 'Woven market tote']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('leaves out search, account and the bag, which have no shop behind them', () => {
    setup()

    expect(screen.queryByRole('button', { name: /search|account/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/bag \(/i)).not.toBeInTheDocument()
  })

  it.each(['desktop', 'mobile'])('has no dead links on %s', async (device) => {
    if (device === 'mobile') setMobile(true)
    const { user } = setup()
    if (device === 'mobile') await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(document.querySelectorAll('a[href]').length).toBeGreaterThan(15)
    expect(deadLinks()).toEqual([])
    expect(screen.getByRole('link', { name: 'View the project on GitHub' })).toHaveAttribute('href', GITHUB)
  })

  it('"Shop new in" and "Explore our fabrics" go to their sections', () => {
    setup()

    expect(screen.getByRole('link', { name: 'Shop new in' })).toHaveAttribute('href', '#new-in')
    expect(screen.getByRole('link', { name: 'Explore our fabrics' })).toHaveAttribute('href', '#fabrics')
    expect(document.getElementById('new-in')).toContainElement(screen.getByRole('heading', { name: 'Just arrived' }))
  })
})

// The page and the assistant must agree: these follow knowledge/*.md
describe('store facts', () => {
  it('match the knowledge base', () => {
    setup()
    const text = document.body.textContent

    expect(text).toContain('Lagos delivery in 1 to 2 business days')
    expect(text).toContain('Free delivery over ₦100,000')
    expect(text).toContain('Other states in 3 to 5 business days.')
    expect(text).toContain('From our Lekki Phase 1 point, ready within 24 hours.')
    expect(text).toContain('In Lagos, for orders under ₦150,000.')
    expect(text).toContain('We use UK sizes, and our dresses run slim. If you are between two sizes, go one size up.')
    expect(text).toContain(
      'Full price pieces can be returned within 14 days. Sale pieces can be exchanged for another size, and exchanges are free within Lagos.',
    )
    expect(text).not.toContain('Abuja')
  })
})

describe('photos', () => {
  const images = () => [...document.querySelectorAll('main img')]

  it('come in two widths, with alt text, a size, and a file that exists', () => {
    setup()

    expect(images()).toHaveLength(9)
    for (const img of images()) {
      expect(img.getAttribute('alt')).toMatch(/\w{3}/)
      expect(img).toHaveAttribute('width', '1280')
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0)
      const [small, large] = img.getAttribute('srcset').split(', ').map((entry) => entry.split(' '))
      expect(small[1]).toBe('640w')
      expect(large[1]).toBe('1280w')
      for (const [src] of [small, large]) expect(existsSync(resolve(IMAGES, src.replace('/images/', '')))).toBe(true)
      expect(img.getAttribute('sizes')).toMatch(/^\(min-width: \S+\) \d+vw, \d+vw$/)
    }
  })

  it('load lazily below the first screen, with the cloth pattern behind them', () => {
    setup()

    const [hero, heroInset, ...rest] = images()
    expect(hero).toHaveAttribute('loading', 'eager')
    expect(hero).toHaveAttribute('fetchpriority', 'high')
    expect(heroInset).toHaveAttribute('loading', 'eager')
    for (const img of rest) expect(img).toHaveAttribute('loading', 'lazy')
    for (const img of images()) {
      expect(img.parentElement.className).toMatch(/\b(adire|adire-lg|aso|weave|pinstripe)\b/)
    }
  })

  it('are credited in CREDITS.md and in the footer', () => {
    setup()
    const credits = readFileSync(resolve(IMAGES, 'CREDITS.md'), 'utf-8')

    for (const img of images()) {
      for (const entry of img.getAttribute('srcset').split(', ')) {
        expect(credits).toContain(entry.split(' ')[0].replace('/images/', ''))
      }
    }
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/Photos from Unsplash by .+Annie Spratt\./)
  })
})

describe('opening the chat', () => {
  it('the help card button opens the chat, and focus returns to it afterwards', async () => {
    const { user } = setup()
    const ask = within(document.getElementById('help')).getByRole('button', { name: 'Ask Loom & Lane' })

    await user.click(ask)
    expect(screen.getByRole('dialog', { name: 'Loom & Lane' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ask).toHaveFocus()
  })

  it('the launcher opens it too', async () => {
    const { user } = setup()
    expect(launcherButton()).toHaveAttribute('aria-haspopup', 'dialog')

    await user.click(launcherButton())

    expect(screen.getByRole('dialog', { name: 'Loom & Lane' })).toBeInTheDocument()
  })

  it('on phones the round launcher keeps its name for screen readers', () => {
    setMobile(true)
    setup()

    expect(launcherButton()).toHaveTextContent('Ask Loom & Lane')
    expect(screen.getByText('L&L')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('the mobile menu', () => {
  beforeEach(() => setMobile(true))

  it('opens and closes with its button, which says whether it is open', async () => {
    const { user } = setup()
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument() // hidden

    await user.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAccessibleName('Close menu')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(button).toHaveAttribute('aria-controls', nav.id)
    expect(within(nav).getAllByRole('link')).toHaveLength(6)

    await user.click(button)
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('works from the keyboard: Tab into it, Escape closes it and returns to the button', async () => {
    const { user } = setup()
    screen.getByRole('button', { name: 'Open menu' }).focus()

    await user.keyboard('{Enter}')
    await user.tab() // the store name, beside the button
    expect(screen.getByRole('link', { name: 'Loom & Lane' })).toHaveFocus()
    await user.tab() // then the opened menu, below
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'New in' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus()
  })

  it('choosing a section closes it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Our fabrics' }))

    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument())
  })
})

describe('the demo strip', () => {
  const strip = () => screen.getByRole('banner').firstElementChild

  it('says this is a demo store with a limited assistant, above the announcement bar', () => {
    setup()

    expect(strip()).toHaveTextContent(
      "Portfolio demo. Loom & Lane is a fictional store built to show ShopAssist, an AI customer support assistant. Its knowledge base is limited to this demo store's delivery, returns, sizing and product details.",
    )
    expect(within(strip()).getByText('Portfolio demo.').tagName).toBe('STRONG')
    expect(strip().nextElementSibling).toHaveTextContent('Free delivery over ₦100,000')
  })

  it('is clay with surface-100 text, an icon hidden from screen readers, and a ring that shows on clay', () => {
    setup()

    expect(strip()).toHaveClass('bg-clay', 'text-surface-100')
    expect(strip().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    const tryIt = within(strip()).getByRole('button', { name: 'Try the assistant' })
    expect(tryIt).toHaveClass('focus-visible:outline-surface-100')
  })

  it.each(['desktop', 'mobile'])('"Try the assistant" opens the chat and gets focus back on %s', async (device) => {
    if (device === 'mobile') setMobile(true)
    const { user } = setup()
    const tryIt = within(strip()).getByRole('button', { name: 'Try the assistant' })
    expect(tryIt).toHaveAttribute('aria-haspopup', 'dialog')

    await user.click(tryIt)
    expect(screen.getByRole('dialog', { name: 'Loom & Lane' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close chat' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tryIt).toHaveFocus()
  })
})

describe('the note beside the chat button', () => {
  const NOTE = 'Ask our AI assistant'
  const region = () => screen.getByRole('complementary', { name: 'Chat' })
  const dismiss = () => within(region()).queryByRole('button', { name: 'Dismiss the note' })
  const badge = () => within(region()).queryByText('1')
  const ring = () => region().querySelector('[class*="animate-launcher-ring"]')
  // The badge's words are hidden text inside the button. jsdom's name
  // calculation, like Chrome's, puts a space where they join ("Lane , 1");
  // screen readers read it the same either way
  const withBadge = /^Ask Loom & Lane ?, 1 new message$/
  // The visible note (its text is also in the status region, for screen readers)
  const note = () => within(region()).queryAllByText(NOTE).find((el) => el.getAttribute('aria-hidden') === 'true')

  // Only the timers move by hand; userEvent waits on the same clock
  beforeEach(() => {
    showTheNote()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => vi.useRealTimers())

  // Plain events: with fake timers, the async helpers would wait on a timer
  // that never runs
  // Guest chat on, so a greeting is waiting and the badge can show
  const GUEST_CHAT_ON = { 'GET /auth/guest': { status: 200, body: { enabled: true } } }
  const start = (routes = GUEST_CHAT_ON) => render(<App fetchImpl={fakeFetch(routes)} />)
  // Lets the answer to GET /auth/guest arrive
  const settle = () => act(async () => {})
  const closeChat = () => fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
  const wait = (ms) => act(() => vi.advanceTimersByTime(ms))

  it('appears 2 seconds after the page loads, with the "1" badge and the ring', async () => {
    start()
    await settle()
    wait(1999)
    expect(dismiss()).not.toBeInTheDocument()
    expect(badge()).not.toBeInTheDocument()
    expect(launcherButton()).toHaveAccessibleName('Ask Loom & Lane')

    wait(1)

    expect(note()).toBeVisible()
    expect(dismiss()).toBeInTheDocument()
    expect(badge()).toBeInTheDocument()
    expect(ring()).toBeInTheDocument()
    // The badge is part of the button's name while it shows
    expect(launcherButton()).toHaveAccessibleName(withBadge)
  })

  it('is announced politely once, and focus stays where it was', () => {
    start()
    const status = within(region()).getByRole('status')
    expect(status).toBeEmptyDOMElement() // present from the start, so the change is announced

    wait(2000)

    expect(status).toHaveTextContent(NOTE)
    // The visible copy is hidden from screen readers, so it isn't read twice
    expect(within(region()).getAllByText(NOTE)).toHaveLength(2)
    expect(within(region()).getAllByText(NOTE).filter((el) => !el.closest('[aria-hidden="true"]'))).toEqual([status])
    expect(document.body).toHaveFocus()
  })

  describe('the "1" badge only shows when a greeting really is waiting', () => {
    const offline = { 'GET /auth/guest': () => new TypeError('Failed to fetch') }

    it.each([
      ['guest chat is off', {}],
      ["the API can't be reached", offline],
      ['the API has an error', { 'GET /auth/guest': { status: 500, body: { detail: 'Something went wrong.' } } }],
    ])('no badge when %s; the note still shows', async (_, routes) => {
      start(routes)
      await settle()
      wait(2000)

      expect(note()).toBeVisible()
      expect(badge()).not.toBeInTheDocument()
      expect(launcherButton()).toHaveAccessibleName('Ask Loom & Lane')
    })

    it('no badge when the chat will reopen a conversation instead of greeting', async () => {
      window.sessionStorage.setItem('loomlane.token', 'token-123')
      window.sessionStorage.setItem('loomlane.conversationId', '42')
      start()
      await settle()
      wait(2000)

      expect(note()).toBeVisible()
      expect(badge()).not.toBeInTheDocument()
    })

    it('a badge for someone signed in, whose chat opens on the welcome greeting', async () => {
      window.sessionStorage.setItem('loomlane.token', 'token-123')
      const fetch = fakeFetch({}) // guest chat off: it doesn't matter to an account
      render(<App fetchImpl={fetch} />)
      await settle()
      wait(2000)

      expect(badge()).toBeInTheDocument()
      expect(callsTo(fetch, 'GET', '/auth/guest')).toHaveLength(0) // nothing to ask
    })
  })

  it('on desktop it doesn\'t wait for any scrolling', () => {
    start()
    wait(2000)

    expect(note()).toBeVisible()
  })

  describe('on a phone, where the hero fills the first screen', () => {
    beforeEach(() => setMobile(true))

    it('waits until the hero buttons have scrolled off the top, then shows with a 44px dismiss button', async () => {
      start()
      await settle()
      wait(10_000)
      expect(note()).toBeUndefined()
      expect(badge()).not.toBeInTheDocument()

      act(() => scrollPastHero())

      expect(note()).toBeVisible()
      expect(note().parentElement.className).not.toMatch(/(^|\s)hidden/)
      expect(dismiss()).toHaveClass('h-control', 'w-control')
      expect(launcherButton()).toHaveAccessibleName(withBadge)
    })

    it('shows at 2 seconds if the visitor is already past the hero buttons, not before', () => {
      start()
      act(() => scrollPastHero())
      wait(1999)
      expect(note()).toBeUndefined()

      wait(1)
      expect(note()).toBeVisible()
    })

    it('once shown, stays when scrolling back up (announced once, no flicker)', () => {
      start()
      wait(2000)
      act(() => scrollPastHero())
      act(() => scrollPastHero(false))

      expect(note()).toBeVisible()
    })

    it('a visit that ends before scrolling hasn\'t had the note yet', () => {
      const view = start()
      wait(5000)
      view.unmount()

      start()
      act(() => scrollPastHero())
      wait(2000)
      expect(note()).toBeVisible()
    })
  })

  it('dismissing it hides the note, the badge and the ring, and focus moves to the chat button', () => {
    start()
    wait(2000)

    fireEvent.click(dismiss())

    expect(note()).toBeUndefined()
    expect(within(region()).getByRole('status')).toBeEmptyDOMElement()
    expect(badge()).not.toBeInTheDocument()
    expect(ring()).not.toBeInTheDocument()
    expect(launcherButton()).toHaveAccessibleName('Ask Loom & Lane')
    expect(launcherButton()).toHaveFocus()
  })

  it('shows once per visit: not again after a reload', () => {
    const view = start()
    wait(2000)
    expect(dismiss()).toBeInTheDocument()

    view.unmount()
    start() // the same tab, so the same sessionStorage
    wait(10_000)

    expect(dismiss()).not.toBeInTheDocument()
    expect(badge()).not.toBeInTheDocument()
  })

  it('opening the chat hides it for good', () => {
    start()
    wait(2000)

    fireEvent.click(launcherButton())
    closeChat()
    wait(10_000)

    expect(note()).toBeUndefined()
    expect(badge()).not.toBeInTheDocument()
    expect(launcherButton()).toHaveAccessibleName('Ask Loom & Lane')
  })

  it('never appears if the chat was opened in the first 2 seconds', () => {
    start()
    fireEvent.click(launcherButton())
    closeChat()

    wait(10_000)

    expect(note()).toBeUndefined()
  })

  it('only moves for visitors who welcome motion: the slide and the ring are motion-safe', () => {
    start()
    wait(2000)

    const pill = note().parentElement
    expect(pill).toHaveClass('motion-safe:animate-note-in')
    expect(pill.className).not.toMatch(/(^|\s)animate-/)
    expect(ring()).toHaveClass('motion-safe:animate-launcher-ring-round', 'sm:motion-safe:animate-launcher-ring', 'opacity-0')
    expect(ring().className).not.toMatch(/(^|\s)(sm:)?animate-/)
  })
})

describe('the hero tag', () => {
  it('sits at the top of the photo, clear of the note at the bottom right', () => {
    render(<App fetchImpl={fakeFetch({})} />)
    const tag = screen.getByText('In the picture').parentElement

    expect(tag).toHaveClass('top-6', 'right-6')
    expect(tag.className).not.toMatch(/(^|\s)bottom-/)
  })
})
