// Design tokens needed in JavaScript (most are only used through Tailwind)
import tokens from '../design/tokens.json'

const sizes = Object.fromEntries(tokens.size.tokens.map((t) => [t.name, t.value]))

// Tailwind's `sm:` prefix is (min-width: breakpoint). Mobile is everything else.
export const MOBILE_QUERY = `not all and (min-width: ${sizes['breakpoint-mobile']})`
