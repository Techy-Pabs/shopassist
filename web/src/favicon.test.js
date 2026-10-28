// The tab icon: the L&L monogram, linked from index.html, drawn only in
// token colours (and served from the site, so the CSP's img-src 'self' allows it)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const web = process.cwd()
const tokenColours = JSON.parse(readFileSync(resolve(web, 'design/tokens.json'), 'utf-8')).color.tokens.map((t) =>
  t.value.light.toUpperCase(),
)

describe('the favicon', () => {
  it('is linked from index.html as an SVG on this site', () => {
    const html = readFileSync(resolve(web, 'index.html'), 'utf-8')

    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    expect(existsSync(resolve(web, 'public/favicon.svg'))).toBe(true)
  })

  it('shows the monogram in token colours only', () => {
    const svg = readFileSync(resolve(web, 'public/favicon.svg'), 'utf-8')
    const colours = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(([hex]) => hex.toUpperCase())

    expect(svg).toContain('L&amp;L')
    expect(colours.length).toBeGreaterThan(1)
    expect(colours.filter((hex) => !tokenColours.includes(hex))).toEqual([])
  })
})
