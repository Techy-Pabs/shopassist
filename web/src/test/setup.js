import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'

// jsdom has no matchMedia. Tests start on a desktop width and can switch
// with setMobile(true).
let mobile = false
const listeners = new Set()

window.matchMedia = (query) => ({
  get matches() {
    return mobile
  },
  media: query,
  addEventListener: (_, listener) => listeners.add(listener),
  removeEventListener: (_, listener) => listeners.delete(listener),
})

export function setMobile(value) {
  mobile = value
  listeners.forEach((listener) => listener())
}

// jsdom has no IntersectionObserver. This one reports nothing until a test
// calls scrollPastHero(), which tells every observer that what it watches
// (the hero's buttons) has scrolled out above the window (or, with false,
// back into view).
const observers = new Set()
window.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback
  }
  observe(el) {
    this.el = el
    observers.add(this)
  }
  disconnect() {
    observers.delete(this)
  }
}

export function scrollPastHero(past = true) {
  observers.forEach((o) => o.callback([{ target: o.el, isIntersecting: !past, boundingClientRect: { top: past ? -100 : 0 } }]))
}

// The note beside the chat button appears 2 seconds after the page loads.
// Tests that aren't about it start as if this visit has already had it, so a
// slow test never sees it appear part way through; the note's own tests
// remove this with showTheNote().
export const NOTE_KEY = 'loomlane.noteShown'

beforeEach(() => {
  window.sessionStorage.setItem(NOTE_KEY, '1')
})

export function showTheNote() {
  window.sessionStorage.removeItem(NOTE_KEY)
}

afterEach(() => {
  mobile = false
  window.sessionStorage.clear()
  // A test's page title must not carry over into the next test
  document.title = ''
})
