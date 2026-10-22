// Builds the Tailwind theme from the Loom & Lane design tokens.
//
// The theme REPLACES Tailwind's defaults (colours, spacing, sizes, type,
// radius, shadows, durations), so a class like `bg-red-500` or `p-9` simply
// doesn't exist: every value used in the interface comes from tokens.json.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// The tokens live inside web/ (web/design/tokens.json), so web/ is
// self-contained and can move to its own repository unchanged.
export const TOKENS_PATH = resolve(here, 'design/tokens.json')

export function loadTokens(path = TOKENS_PATH) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

const byName = (tokens, value = (t) => t.value) =>
  Object.fromEntries(tokens.map((t) => [t.name, value(t)]))

// "space-4" -> "4", "space-1-5" -> "1.5", so p-4 is 16px and p-1.5 is 6px,
// following Tailwind's usual 4px steps.
const spacingKey = (name) => name.replace(/^space-/, '').replace('-', '.')

// "radius-sm" -> "sm"
const radiusKey = (name) => name.replace(/^radius-/, '')

const fontStack = (family) => family.split(',').map((f) => f.trim())

export function buildTheme(tokens) {
  const colors = byName(tokens.color.tokens, (t) => t.value.light)

  const fontFamily = Object.fromEntries(
    Object.entries(tokens.type.families).map(([name, family]) => [name, fontStack(family)]),
  )

  const styles = tokens.type.groups.flatMap((group) => group.styles)
  const fontSize = Object.fromEntries(
    styles.map((s) => [
      s.name,
      [
        s.fontSize,
        {
          lineHeight: s.lineHeight,
          fontWeight: String(s.fontWeight),
          ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}),
        },
      ],
    ]),
  )
  // Only the weights the type styles use: 400, 500 and 600
  const weightNames = { 400: 'normal', 500: 'medium', 600: 'semibold' }
  const fontWeight = Object.fromEntries(
    [...new Set(styles.map((s) => s.fontWeight))].map((w) => [weightNames[w] ?? String(w), String(w)]),
  )
  const letterSpacing = Object.fromEntries(
    styles.filter((s) => s.letterSpacing).map((s) => [s.name, s.letterSpacing]),
  )

  const spacing = {
    0: '0',
    ...Object.fromEntries(tokens.spacing.tokens.map((t) => [spacingKey(t.name), t.value])),
  }
  const size = byName(tokens.size.tokens)

  // Keywords that describe a relationship, not a design value
  const keywords = { auto: 'auto', full: '100%', min: 'min-content', max: 'max-content', fit: 'fit-content' }
  const lengths = { ...spacing, ...size, ...keywords }

  const borderWidth = { 0: '0', DEFAULT: byName(tokens.border.tokens).border }
  const focus = byName(tokens.focus.tokens)
  const breakpoint = size['breakpoint-mobile']

  // Tailwind's built-in reset and ring utilities reach for colours from its
  // own palette (gray.400 for placeholders, a blue ring). Point them at
  // tokens so no other colour ends up in the CSS.
  const resetColors = { gray: { 400: colors['ink-muted'] } }

  return {
    screens: { sm: breakpoint },
    colors: { transparent: 'transparent', current: 'currentColor', ...colors, ...resetColors },
    ringColor: { DEFAULT: colors.indigo },
    ringOffsetColor: { DEFAULT: colors['surface-100'] },
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    spacing,
    width: { ...lengths, screen: '100vw' },
    height: { ...lengths, screen: '100vh', dvh: '100dvh' },
    minWidth: lengths,
    minHeight: { ...lengths, screen: '100vh', dvh: '100dvh' },
    maxWidth: { ...lengths, none: 'none' },
    maxHeight: {
      ...lengths,
      none: 'none',
      // The floating panel always fits the window, with space-8 above and
      // below it (the same gap it keeps from the window's edge)
      'panel-fit': `calc(100dvh - ${spacing['8']} * 2)`,
    },
    flexBasis: lengths,
    borderRadius: { none: '0', ...Object.fromEntries(tokens.radius.tokens.map((t) => [radiusKey(t.name), t.value])) },
    borderWidth,
    outlineWidth: { 0: '0', ring: focus['focus-ring-width'] },
    outlineOffset: { 0: '0', ring: focus['focus-ring-offset'] },
    boxShadow: { none: 'none', ...Object.fromEntries(tokens.shadow.tokens.map((t) => [t.name.replace(/^shadow-/, ''), t.value])) },
    opacity: { 0: '0', 100: '1', ...byName(tokens.opacity.tokens) },
    transitionDuration: { 0: '0s', ...byName(tokens.motion.tokens) },
    // The chat panel slides up over panel-slide, rising by space-6
    keyframes: {
      'panel-in': {
        from: { opacity: '0', transform: `translateY(${spacing['6']})` },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
    },
    animation: { none: 'none', 'panel-in': `panel-in ${byName(tokens.motion.tokens)['panel-slide']} ease-out` },
    // A custom key so CSS can reach the sizes with theme('size.adire-dot')
    size,
  }
}
