// The admin's default link colours must never beat a link's own colour
// class: ".sa-root a" outweighs ".text-sa-ink", which turned the nav green
// and hid the white text of links styled as buttons. They must weigh one
// class, no more (and no less, or the store's link colour wins). jsdom
// can't apply the cascade, so this reads the rule itself.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8')

it('the admin link colours weigh one class', () => {
  const selectors = [...css.matchAll(/^\s*([^{}\n]*\.sa-root[^{}\n]*\ba\b[^{}\n]*)\{/gm)].map((m) => m[1].trim())
  expect(selectors).toEqual(['.sa-root :where(a)', '.sa-root :where(a:hover)'])
})
