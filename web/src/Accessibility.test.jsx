// Automated accessibility checks (axe) on the homepage and every panel
// view. jsdom has no layout, so colour contrast is checked in real Chrome
// instead (see the README's accessibility notes).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import axe from 'axe-core'

import { showView, viewNames } from './test/views.jsx'

async function violations() {
  const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  // Readable on failure: rule, then the offending elements
  return results.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

describe.each(['desktop', 'mobile'])('on %s', (device) => {
  it.each(viewNames(device))('the %s view has no axe violations', async (name) => {
    await showView(name, device)

    expect(await violations()).toEqual([])
  })
})

// prefers-reduced-motion: every animation is behind motion-safe:, so it
// doesn't run for people who ask for less motion
describe('reduced motion', () => {
  const dir = resolve(__dirname, 'components')
  const files = (folder) =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) return files(path)
      return name.endsWith('.jsx') && !name.includes('.test.') ? [path] : []
    })
  const sources = files(dir)

  it('animates only when motion is welcome', () => {
    const unguarded = sources.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/(\S*)animate-[a-z-]+/g)]
        .filter(([, prefix]) => !prefix.endsWith('motion-safe:'))
        .map(([match]) => `${relative(dir, path)}: ${match}`),
    )
    expect(sources.some((path) => path.includes('/home/'))).toBe(true) // the homepage's folder too
    expect(unguarded).toEqual([])
  })
})
