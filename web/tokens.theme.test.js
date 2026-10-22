import { buildTheme, loadTokens } from './tokens.theme.js'

const tokens = loadTokens()
const theme = buildTheme(tokens)

describe('the Tailwind theme comes from design/tokens.json', () => {
  it('has exactly the token colours (plus transparent and current)', () => {
    const tokenColours = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value.light]))

    // gray.400 is only an alias for ink-muted, for Tailwind's built-in reset
    expect(theme.colors).toEqual({
      transparent: 'transparent', current: 'currentColor', ...tokenColours, gray: { 400: tokenColours['ink-muted'] },
    })
    expect(theme.colors.red).toBeUndefined() // Tailwind's own palette is gone
  })

  it('maps spacing tokens onto the usual 4px step names', () => {
    expect(theme.spacing['4']).toBe('16px')
    expect(theme.spacing['1.5']).toBe('6px')
    expect(theme.spacing['5.5']).toBe('22px')
    expect(theme.spacing['9']).toBeUndefined() // not a token
  })

  it('turns each type style into a font size with its line height and weight', () => {
    expect(theme.fontSize.body).toEqual(['15px', { lineHeight: '22px', fontWeight: '400' }])
    expect(theme.fontSize.eyebrow).toEqual(['13px', { lineHeight: '18px', fontWeight: '600', letterSpacing: '.08em' }])
    expect(theme.fontFamily.serif).toEqual(['"Fraunces"', 'Georgia', 'serif'])
  })

  it('uses the size, radius, shadow, motion, border and focus tokens', () => {
    expect(theme.width['panel-width']).toBe('380px')
    expect(theme.height.control).toBe('44px')
    expect(theme.flexBasis['hero-copy-basis']).toBe('420px')
    expect(theme.borderRadius).toEqual({ none: '0', sm: '4px', lg: '18px', pill: '999px' })
    expect(theme.boxShadow.panel).toBe('0 24px 48px rgba(43, 36, 32, .18)')
    expect(theme.transitionDuration['panel-slide']).toBe('200ms')
    expect(theme.borderWidth.DEFAULT).toBe('1px')
    expect(theme.outlineWidth.ring).toBe('2px')
    expect(theme.screens).toEqual({ sm: '640px' })
    // The desktop panel fits any window height, with space-8 above and below
    expect(theme.maxHeight['panel-fit']).toBe('calc(100dvh - 32px * 2)')
  })
})
