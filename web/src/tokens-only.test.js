// A guard: the source must not bypass the design tokens with literal
// colours, pixel values or Tailwind arbitrary values like "w-[123px]".
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Tests run from web/ (npm test)
const SRC = resolve(process.cwd(), 'src') + '/'

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(jsx?|css)$/.test(name) && !/\.test\.jsx?$/.test(name) ? [path] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf-8') }))

describe('every value comes from the tokens', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it.each([
    ['hex colours', /#[0-9a-fA-F]{3,8}\b/],
    ['rgb or hsl colours', /\b(rgba?|hsla?)\(/],
    ['pixel values', /\b\d+(\.\d+)?px\b/],
    ['Tailwind arbitrary values', /\b[a-z-]+-\[[^\]]+\]/],
    ['inline styles', /style=\{\{/],
  ])('no %s', (_, pattern) => {
    const offenders = files.filter((f) => pattern.test(f.text)).map((f) => f.path.replace(SRC, 'src/'))
    expect(offenders).toEqual([])
  })
})
