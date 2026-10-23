// Every class the interface uses must have a rule in the CSS that Tailwind
// generates from tokens.json. A class without one does nothing and raises no
// error: a token that doesn't exist, a theme key Tailwind doesn't read for
// that utility, or a class name Tailwind can't see in the source. The page
// just breaks (an icon at full width, a heading at body size).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

import config from '../tailwind.config.cjs'
import { showView, viewNames } from './test/views.jsx'

const SRC = resolve(process.cwd(), 'src')

// Class names in the generated CSS's selectors: ".sm\:h-icon-lg" -> "sm:h-icon-lg"
function classesWithRules(css) {
  const found = new Set()
  postcss.parse(css).walkRules((rule) => {
    for (const [, name] of rule.selector.matchAll(/\.((?:\\.|[^\s.:#[\],>+~()])+)/g)) {
      found.add(name.replace(/\\(.)/g, '$1'))
    }
  })
  return found
}

// Every class on every element on screen, including ones built in code
function classesOnScreen() {
  return [...document.querySelectorAll('[class]')].flatMap((el) => el.getAttribute('class').split(/\s+/).filter(Boolean))
}

// Plain className="..." strings in the components, for branches the views
// don't reach
function classesInSource(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return classesInSource(path)
    if (!name.endsWith('.jsx') || name.includes('.test.')) return []
    return [...readFileSync(path, 'utf-8').matchAll(/className="([^"]+)"/g)].flatMap(([, list]) =>
      list.split(/\s+/).map((cls) => `${relative(SRC, path)}: ${cls}`),
    )
  })
}

let withRules
let generated
beforeAll(async () => {
  const from = join(SRC, 'index.css')
  generated = (await postcss([tailwindcss(config)]).process(readFileSync(from, 'utf-8'), { from })).css
  withRules = classesWithRules(generated)
}, 60_000)

describe('every class has a CSS rule', () => {
  it('finds the generated rules', () => {
    // Older and newer tokens alike, and the pattern classes from index.css
    for (const cls of ['h-icon', 'sm:h-icon-lg', 'sm:text-display-home', 'sm:grid-cols-fit-collection', 'adire-lg']) {
      expect(withRules.has(cls)).toBe(true)
    }
  })

  it('with real values (a missing token can give "undefined" instead of no rule)', () => {
    const broken = []
    postcss.parse(generated).walkDecls((decl) => {
      if (/\b(undefined|NaN)\b/.test(decl.value)) broken.push(`${decl.parent.selector} { ${decl.prop}: ${decl.value} }`)
    })
    expect(broken).toEqual([])
  })

  it('for plain class names in the components', () => {
    const missing = classesInSource().filter((entry) => !withRules.has(entry.split(': ')[1]))
    expect(missing).toEqual([])
  })

  describe.each(['desktop', 'mobile'])('on %s', (device) => {
    it.each(viewNames(device))('for everything in the %s view', async (name) => {
      await showView(name, device)

      const missing = [...new Set(classesOnScreen())].filter((cls) => !withRules.has(cls))
      expect(missing).toEqual([])
    })
  })
})
