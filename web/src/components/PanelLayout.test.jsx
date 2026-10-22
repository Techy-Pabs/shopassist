// The panel's header must stay at the top in every view, with only the
// area below it scrolling (a bug in short desktop windows). jsdom has no
// layout, so this checks the structure that guarantees it; the CSS test
// below checks the rules that make the panel fit and stop it scrolling.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App.jsx'
import { deferred, fakeFetch } from '../test/fakeApi.js'

const SCROLLER = '.overflow-y-auto'

async function openIn(view) {
  window.sessionStorage.clear()
  const routes = { 'GET /auth/me': { status: 200, body: { id: 1, email: 'a@example.com' } } }
  if (view !== 'signin') window.sessionStorage.setItem('loomlane.token', 'tok')
  if (view === 'conversation') {
    window.sessionStorage.setItem('loomlane.conversationId', '1')
    routes['GET /conversations/1/messages'] = {
      status: 200,
      body: [{ id: 1, role: 'user', content: 'Hello', created_at: new Date().toISOString() }],
    }
  }
  if (view === 'waking') routes['GET /health'] = () => deferred().promise
  if (view === 'history') routes['GET /conversations'] = { status: 200, body: [] }
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<App fetchImpl={fakeFetch(routes)} />)
  await user.click(screen.getByRole('button', { name: 'Ask Loom & Lane' }))
  if (view === 'waking') act(() => vi.advanceTimersByTime(3_000))
  if (view === 'history') await user.click(await screen.findByRole('button', { name: 'Conversation history' }))
  const expected = {
    signin: 'Sign in to chat',
    welcome: 'Hello, how can we help?',
    conversation: null,
    waking: 'Getting the assistant ready',
    history: 'No conversations yet',
  }[view]
  if (expected) await screen.findByRole('heading', { name: expected })
  else await screen.findByText('Hello')
  vi.useRealTimers()
  return screen.getByRole('dialog')
}

// Scrolling areas that are showing (the chat stays mounted, hidden, behind the history list)
const visibleScrollers = (panel) => [...panel.querySelectorAll(SCROLLER)].filter((el) => !el.closest('.hidden'))

describe.each(['signin', 'welcome', 'conversation', 'waking', 'history'])('the %s view', (view) => {
  it('has one scrolling area, below the header and band', async () => {
    const panel = await openIn(view)

    const scrollers = visibleScrollers(panel)
    expect(scrollers).toHaveLength(1)
    const scroller = scrollers[0]
    expect(scroller).toHaveClass('min-h-0', 'flex-1') // it shrinks; the header doesn't

    const header = screen.getByRole('button', { name: 'Close chat' }).closest('.bg-indigo')
    expect(header).toHaveClass('shrink-0')
    expect(scroller.contains(header)).toBe(false)
    const band = panel.querySelector('.adire.h-adire-tile')
    expect(band).toHaveClass('shrink-0')
    expect(scroller.contains(band)).toBe(false)

    // The question input, where there is one, stays below the scrolling area
    const input = panel.querySelector('input[type="text"]')
    if (input) expect(scroller.contains(input)).toBe(false)
  })
})

describe('the panel CSS', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8')
  const rules = [...css.matchAll(/\.panel-box\s*\{([^}]*)\}/g)].map((m) => m[1].replace(/\s+/g, ' ').trim())

  it('clips the panel (hidden first, for browsers without clip)', () => {
    expect(rules).toContainEqual(expect.stringMatching(/overflow: hidden; overflow: clip;/))
  })

  it('caps the desktop panel to the window (vh first, dvh where supported)', () => {
    expect(css).toMatch(/@media \(min-width: theme\('screens\.sm'\)\)/)
    expect(rules).toContainEqual(
      expect.stringMatching(/max-height: calc\(100vh - theme\('spacing\.8'\) \* 2\); max-height: theme\('maxHeight\.panel-fit'\);/),
    )
  })
})
