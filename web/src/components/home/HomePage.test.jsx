import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../../App.jsx'
import { fakeFetch } from '../../test/fakeApi.js'
import { launcherButton } from '../../test/launcher.js'
import { scrollPastHero, setMobile } from '../../test/setup.js'

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

describe('the invitation bubble', () => {
  const invitation = () => screen.queryByText('Questions about delivery or sizing? Ask us here.')

  it('waits until the visitor has scrolled past the hero; the launcher is always there', () => {
    setup()
    expect(invitation()).not.toBeInTheDocument()
    expect(launcherButton()).toBeInTheDocument()

    act(() => scrollPastHero())
    expect(invitation()).toBeInTheDocument()

    act(() => scrollPastHero(false)) // back up to the hero
    expect(invitation()).not.toBeInTheDocument()
    expect(launcherButton()).toBeInTheDocument()
  })

  it('appears with an animation only when motion is welcome', () => {
    setup()
    act(() => scrollPastHero())

    expect(invitation()).toHaveClass('motion-safe:animate-panel-in')
    expect(invitation().className).not.toMatch(/(^|\s)animate-/)
  })

  it('stays away once the chat has been opened', async () => {
    const { user } = setup()
    act(() => scrollPastHero())
    await user.click(launcherButton())
    await user.keyboard('{Escape}')

    act(() => scrollPastHero())
    expect(invitation()).not.toBeInTheDocument()
  })
})
