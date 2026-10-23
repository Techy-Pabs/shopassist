// Design tokens needed in JavaScript (most are only used through Tailwind)
import tokens from '../design/tokens.json'

const sizes = Object.fromEntries(tokens.size.tokens.map((t) => [t.name, t.value]))

// Tailwind's `sm:` prefix is (min-width: breakpoint). Mobile is everything else.
export const MOBILE_QUERY = `not all and (min-width: ${sizes['breakpoint-mobile']})`

// The same breakpoint the other way round: desktop, for responsive image sizes
export const DESKTOP_QUERY = `(min-width: ${sizes['breakpoint-mobile']})`

const spacing = Object.fromEntries(tokens.spacing.tokens.map((t) => [t.name, t.value]))

// The chat keeps following new messages while the customer is within this
// distance of the bottom (space-6); scrolled further up, it stays put
export const STICK_TO_BOTTOM_WITHIN = parseFloat(spacing['space-6'])
