import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

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

afterEach(() => {
  mobile = false
  window.sessionStorage.clear()
})
