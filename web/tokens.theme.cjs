// Builds the Tailwind theme from the Loom & Lane design tokens.
//
// The theme REPLACES Tailwind's defaults (colours, spacing, sizes, type,
// radius, shadows, durations), so a class like `bg-red-500` or `p-9` simply
// doesn't exist: every value used in the interface comes from tokens.json.
//
// CommonJS, like tailwind.config.cjs: Tailwind reloads its config by
// clearing Node's require cache, which ES modules ignore. Loading the tokens
// with require also makes Tailwind watch tokens.json, so editing it updates
// a running dev server.

// The tokens live inside web/ (web/design/tokens.json), so web/ is
// self-contained and can move to its own repository unchanged.
function loadTokens() {
  return require('./design/tokens.json')
}

// The admin dashboard's own design system (ShopAssist's look, not the store's)
function loadAdminTokens() {
  return require('./design/admin-tokens.json')
}

// The admin tokens as Tailwind theme entries, every name given the admin
// prefix ("sa-"): the colour "accent" is bg-sa-accent, "space-4" is p-sa-4
function adminEntries(admin) {
  const named = (entries) => Object.fromEntries(entries.map(([key, value]) => [admin.tailwindPrefix + key, value]))
  const styles = admin.type.groups.flatMap((group) => group.styles)
  return {
    colors: named(admin.color.tokens.map((t) => [t.name, t.value.light])),
    fontFamily: named(Object.entries(admin.type.families).map(([name, family]) => [name, fontStack(family)])),
    fontSize: named(styles.map((s) => [s.name, typeStyle(s)])),
    letterSpacing: named(styles.filter((s) => s.letterSpacing).map((s) => [s.name, s.letterSpacing])),
    spacing: named(admin.spacing.tokens.map((t) => [spacingKey(t.name), t.value])),
    size: named(admin.size.tokens.map((t) => [t.name, t.value])),
    borderRadius: named(admin.radius.tokens.map((t) => [radiusKey(t.name), t.value])),
    boxShadow: named(admin.shadow.tokens.map((t) => [t.name.replace(/^shadow-/, ''), t.value])),
    borderWidth: named(admin.border.tokens.map((t) => [t.name.replace(/^border-/, ''), t.value])),
  }
}

// Adds the admin entries, refusing any name the store's theme already has
function withAdmin(store, admin, kind) {
  const clash = Object.keys(admin).filter((key) => key in store)
  if (clash.length) throw new Error(`Admin token names collide with the store's ${kind}: ${clash.join(', ')}`)
  return { ...store, ...admin }
}

function typeStyle(s) {
  return [
    s.fontSize,
    { lineHeight: s.lineHeight, fontWeight: String(s.fontWeight), ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}) },
  ]
}

const byName = (tokens, value = (t) => t.value) =>
  Object.fromEntries(tokens.map((t) => [t.name, value(t)]))

// "space-4" -> "4", "space-1-5" -> "1.5", so p-4 is 16px and p-1.5 is 6px,
// following Tailwind's usual 4px steps.
const spacingKey = (name) => name.replace(/^space-/, '').replace('-', '.')

// "radius-sm" -> "sm"
const radiusKey = (name) => name.replace(/^radius-/, '')

const fontStack = (family) => family.split(',').map((f) => f.trim())

// tokens: the store's (tokens.json). admin, optional: the admin dashboard's
// (admin-tokens.json), added under its prefix.
function buildTheme(tokens, admin = null) {
  const extra = admin ? adminEntries(admin) : {}
  const add = (store, kind) => (admin ? withAdmin(store, extra[kind], kind) : store)

  const colors = add(byName(tokens.color.tokens, (t) => t.value.light), 'colors')

  const fontFamily = add(Object.fromEntries(
    Object.entries(tokens.type.families).map(([name, family]) => [name, fontStack(family)]),
  ), 'fontFamily')

  const styles = tokens.type.groups.flatMap((group) => group.styles)
  const fontSize = add(Object.fromEntries(styles.map((s) => [s.name, typeStyle(s)])), 'fontSize')
  // Only the weights the type styles use: 400, 500 and 600
  const weightNames = { 400: 'normal', 500: 'medium', 600: 'semibold' }
  const fontWeight = Object.fromEntries(
    [...new Set(styles.map((s) => s.fontWeight))].map((w) => [weightNames[w] ?? String(w), String(w)]),
  )
  const letterSpacing = add(Object.fromEntries(
    styles.filter((s) => s.letterSpacing).map((s) => [s.name, s.letterSpacing]),
  ), 'letterSpacing')

  const spacing = add({
    0: '0',
    ...Object.fromEntries(tokens.spacing.tokens.map((t) => [spacingKey(t.name), t.value])),
  }, 'spacing')
  const size = add(byName(tokens.size.tokens), 'size')

  // Keywords that describe a relationship, not a design value
  const keywords = { auto: 'auto', full: '100%', min: 'min-content', max: 'max-content', fit: 'fit-content' }
  const lengths = { ...spacing, ...size, ...keywords }

  // "border" is the default width (the `border` class); "border-frame" -> "frame"
  const borderWidth = add({
    0: '0',
    ...Object.fromEntries(tokens.border.tokens.map((t) => [t.name.replace(/^border-?/, '') || 'DEFAULT', t.value])),
  }, 'borderWidth')
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
    borderRadius: add({ none: '0', ...Object.fromEntries(tokens.radius.tokens.map((t) => [radiusKey(t.name), t.value])) }, 'borderRadius'),
    borderWidth,
    outlineWidth: { 0: '0', ring: focus['focus-ring-width'] },
    outlineOffset: { 0: '0', ring: focus['focus-ring-offset'] },
    boxShadow: add({ none: 'none', ...Object.fromEntries(tokens.shadow.tokens.map((t) => [t.name.replace(/^shadow-/, ''), t.value])) }, 'boxShadow'),
    opacity: { 0: '0', 100: '1', ...byName(tokens.opacity.tokens) },
    transitionDuration: { 0: '0s', ...byName(tokens.motion.tokens) },
    // The chat panel slides up over panel-slide, rising by space-6
    keyframes: {
      'panel-in': {
        from: { opacity: '0', transform: `translateY(${spacing['6']})` },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
      // The typing dots brighten in turn: each is bright for a third of the cycle
      ...Object.fromEntries(
        [1, 2, 3].map((dot) => {
          const dim = byName(tokens.opacity.tokens)['dot-fade-3']
          // Bright in the middle of its third: 17%, 50%, 83%
          const brightAt = `${Math.round(((dot - 0.5) / 3) * 100)}%`
          return [`typing-${dot}`, { '0%, 100%': { opacity: dim }, [brightAt]: { opacity: '1' } }]
        }),
      ),
    },
    animation: {
      none: 'none',
      'panel-in': `panel-in ${byName(tokens.motion.tokens)['panel-slide']} ease-out`,
      ...Object.fromEntries(
        [1, 2, 3].map((dot) => [`typing-${dot}`, `typing-${dot} ${byName(tokens.motion.tokens)['typing-cycle']} ease-in-out infinite`]),
      ),
    },
    // A custom key so CSS can reach the sizes with theme('size.adire-dot')
    size,
    // Added to Tailwind's numbered columns (grid-cols-2 stays): grids that fit
    // as many columns as their minimum width allows, as in the homepage mockups
    extend: {
      gridTemplateColumns: Object.fromEntries(
        ['service', 'collection', 'product', 'card', 'footer'].map((name) => {
          const min = size[`grid-${name}`]
          // A missing token would quietly give "minmax(undefined, 1fr)"
          if (!min) throw new Error(`tokens.json has no size token grid-${name}`)
          return [`fit-${name}`, `repeat(auto-fit, minmax(${min}, 1fr))`]
        }),
      ),
    },
  }
}

module.exports = { buildTheme, loadTokens, loadAdminTokens }
