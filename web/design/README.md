Loom & Lane is a Lagos fashion and lifestyle brand. The interface should feel warm and editorial, like a well printed fashion magazine: cream paper, deep ink, and the indigo of adire cloth, with clay as the warm accent.

## Content fundamentals

- Write the way a friendly shop assistant in Lekki speaks: warm, short, and direct. Use "we" for the store and "you" for the customer.
- Use sentence case everywhere, including buttons ("Ask Loom & Lane", "Try again").
- Write prices in naira with the symbol and commas: ₦3,500, never "3500 naira".
- Never promise what the store information does not say. When unsure, say so and give the support contacts.
- No emoji in interface copy.
- Example welcome line: "Hi, I'm here to help with orders, delivery, returns and sizing. What would you like to know?"

## Visual foundations

**Colour.** Set every page and chat panel on `surface-100`. Put assistant bubbles, inputs and cards on `surface-raised`. Set text in `ink`, and timestamps and hints in `ink-muted`. Use `indigo` for the customer's own bubbles, the chat header band and primary buttons, always with `surface-100` text. Use `clay` for the launcher button, links and small highlights only; never fill large areas with it. Use `danger` only for error messages, always with words.

**Type.** Set headings in Fraunces: `display` for the storefront hero, `heading` for section titles, `title` for the chat header. Set everything people read at length, including every chat message, in Manrope `body`. Use `label` for buttons and chips, `caption` for timestamps.

**Spacing.** Pad bubbles with `space-4`. Separate bubbles from the same sender with `space-2`, and a change of sender with `space-6`. Use `space-4` side gutters in the chat panel at every width.

**Radius and the folded tag.** Every chat bubble uses `radius-lg` on three corners and `radius-sm` on the corner nearest its sender, like a folded garment tag: bottom right for the customer, bottom left for the assistant. Use `radius-pill` for the launcher and suggestion chips only.

**Borders, not shadows.** Separate areas with a 1px `sand` line or the stitched rule: a 1px dashed `sand` line with 4px dashes and 4px gaps. Give controls a 1px `line-strong` border. Use no drop shadows, except one soft shadow on the floating chat panel so it lifts off the storefront.

**The adire band.** The chat header carries a strip of `indigo` with a grid of `surface-100` dots, after adire resist dye cloth. Keep it to one band per screen.

**Focus.** Show keyboard focus as a 2px solid `indigo` ring with 2px offset on every control.

**Motion.** Keep it calm: the chat panel slides up over 200ms; the typing indicator is three dots that fade in turn. Respect reduced motion settings.

## Iconography

There is no logo file yet. Set the name "Loom & Lane" in Fraunces `title`, and use the "L&L" monogram, set in Fraunces inside an `indigo` circle with `surface-100` letters, as the assistant's avatar. Use simple line icons at 1.5px stroke in `ink`, and no emoji.
