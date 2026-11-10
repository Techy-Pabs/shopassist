# Milestone 7: Guest chat and pointing visitors to the chat

## Goal

The homepage exists to show off the assistant, but visitors don't notice the chat button, and anyone who does must create an account before asking anything. This milestone fixes both:

1. **Point visitors to the chat:** a note beside the chat button, a small badge, and a gentle animation, on desktop and phones.
2. **Guest chat:** visitors can chat straight away without an account, within limits that protect the free AI quota.

Signed-in customers keep everything they have today.

## Approved designs

New mockups in `web/design/mockups/`:

- `Launcher-Desktop.dc.html`: the note "Ask our AI assistant", the "1" badge and the pulsing ring, on desktop.
- `Launcher-Mobile.dc.html`: the same on a phone, beside the round button.
- `Guest-Welcome.dc.html`: the chat opened as a guest.
- `Guest-Limit.dc.html`: the guest limit reached, plus the daily limit message.

The two launcher mockups animate; match their timing.

## Decisions already made

- Visitors go **straight in as a guest**: clicking the chat button opens the chat with no sign-in screen. "Sign in to save your chats" stays available.
- **Limits:** 10 questions per guest, and 15 guest questions a day across all guests together. Abraham is staying on free OpenRouter models (about 50 requests a day, and each chat message uses about 2: one embedding and one reply), so the daily guest cap leaves room for testing and signed-in users. Both limits are settings, so they can be raised later without code changes.
- **No prompt change** in this milestone, so the full quality check isn't needed for the backend slices; run it once before going live anyway, since guest messages go through the same path.

## Backend

### Guest accounts

- A guest is a real row in `users`, so every existing ownership check keeps working. Add an `is_guest` flag. Guests have no email or password: make `email` and the password hash nullable, with a CHECK constraint that non-guests always have both. The role stays `customer`; guests can never be promoted, and the promote command must refuse them.
- `POST /auth/guest` creates a guest and returns a token, exactly like login. Guest tokens expire after `GUEST_TOKEN_HOURS` (default 24). The token is the only key to a guest's chat: lose it and the chat is gone, which the frontend handles gracefully.
- `GET /auth/me` returns `is_guest`, and for guests the number of questions left.
- Guests can use the conversation endpoints like any customer. They can never reach admin endpoints; the existing database role check already guarantees that, and tests must prove it for guest tokens.

### Limits

- **Per guest:** after `GUEST_MESSAGE_LIMIT` customer messages (default 10), sending another returns 429 with a clear code, `guest_limit_reached`. Count saved customer messages in the database, not a counter in memory.
- **Daily across all guests:** after `GUEST_DAILY_LIMIT` guest messages today (default 15, "today" in `STORE_TIMEZONE`), guests get 429 with the code `guest_daily_limit_reached`. Signed-in customers are not affected.
- **Retry** doesn't add a customer message, so it doesn't count against the per-guest limit. It may still only answer the latest unanswered question, as today.
- **Creating guests:** `POST /auth/guest` is rate limited per client IP (`GUEST_CREATE_PER_HOUR`, default 5), so one person can't create endless guests to get around the per-guest limit. The daily cap protects the quota even if they do.
- **Message pace:** guests may send at most a few messages a minute (for example 5), to stop rapid-fire abuse.
- **Client IP behind Render:** Render sits in front of the API as a proxy, so the real client IP arrives in a forwarded header that clients can also forge. Check Render's documentation, configure Uvicorn's proxy settings correctly, and explain in the README which address is used and why it can be trusted.
- **Where rate limit counts live:** in memory is acceptable for now because the free Render plan runs one instance; the counts reset when it restarts. Note in the README that several instances would need a shared store.
- The 429 responses include a `Retry-After` header where it makes sense.

### Cleanup and privacy

- Guests and their conversations are deleted after `GUEST_RETENTION_DAYS` (default 7). A CLI command does it, and `scripts/start.sh` runs it at startup, because the free plan has no scheduled jobs. Deleting cascades to conversations, messages and message sources.
- No IP addresses are stored in the database. Rate limit counts in memory hold them only briefly.

### Admin dashboard

- Conversations and the attention list label guest conversations "Guest" instead of an email.
- The Customers page lists accounts only; guests are counted separately in the Overview ("Guest conversations").
- Guests never appear as admins and can't be promoted.

### Settings

Add to `app/core/config.py`, `.env.example` and the README: `GUEST_CHAT_ENABLED` (default true), `GUEST_MESSAGE_LIMIT` (10), `GUEST_DAILY_LIMIT` (15), `GUEST_TOKEN_HOURS` (24), `GUEST_RETENTION_DAYS` (7), `GUEST_CREATE_PER_HOUR` (5). With guest chat disabled, the frontend falls back to sign-in as today.

## Frontend

### The chat button

- About 2 seconds after the page loads, the note "Ask our AI assistant" slides in beside the button, on desktop and phones, with a dismiss button. It shows once per visit (remembered in sessionStorage) and never again after it's dismissed or the chat is opened.
- The "1" badge shows while the note is showing and the chat hasn't been opened. It's honest: a greeting is waiting in the chat. The button's accessible name includes "1 new message".
- The ring pulses three times, then stops. No animation at all for visitors who ask for reduced motion.
- This replaces the current rule that the invitation appears only after scrolling past the hero. The hero's "In the picture" tag moves so the note never covers it at any common screen size; check 1280x800, 1440x900, 1920x1080 and 390x844.
- The note and badge must not cover the demo strip, the hero buttons or other important content on phones.

### Guest chat

- Opening the chat with no token quietly creates a guest (`POST /auth/guest`) and shows the guest welcome from the mockup, including its greeting and the existing demo note and chips.
- The guest token is stored like the customer token but marked as a guest, so signing in replaces it cleanly.
- The footer shows the questions left ("Guest chat · 7 questions left") and "Sign in to save your chats", which opens the existing sign-in and create-account screen. Signing in starts a fresh chat; the guest chat isn't moved to the account in this milestone.
- Guests have no history button.
- On `guest_limit_reached` and `guest_daily_limit_reached`, show the states from `Guest-Limit.dc.html`, disable the message box, and offer create account and sign in.
- If the guest token has expired, quietly start a new guest, with a short note that the earlier chat ended.
- If guest chat is disabled or `POST /auth/guest` fails, fall back to the sign-in screen as today.

### Accessibility and security

- The note is announced politely to screen readers once, not repeatedly. The dismiss button is a real button with a label, and focus never jumps to the note.
- Everything typed by guests is plain text, as for customers.
- The CSP stays exactly as it is.

## Tests

- Guest creation, the token, `GET /auth/me` for guests, and expiry.
- Guests blocked from every admin endpoint (403), and the promote command refusing guests.
- The per-guest limit (the 11th message refused), the daily limit (signed-in users unaffected), retry not counting, and day boundaries in the store's time zone.
- Guest creation rate limited per IP, and the message pace limit.
- Cleanup deleting old guests with everything that belongs to them, and leaving accounts alone.
- The CHECK constraint: a non-guest without an email or password hash is rejected by the database.
- Frontend: the note's timing, once per visit, dismissal, the badge, reduced motion, guest start, questions left, both limit states, expiry, sign in replacing a guest, and the fallback when guest chat is off. Axe and the CSS guard at desktop and phone sizes, and a real Chrome check.

## Slices

1. **Backend: guest accounts and limits.** Model and migration, `POST /auth/guest`, the limits, IP handling behind Render, settings, tests.
2. **Backend: cleanup and admin labels.** The cleanup command and start script, guests in the admin API and stats.
3. **Frontend: the chat button.** Note, badge, ring, timing, once per visit, hero tag move.
4. **Frontend: guest chat.** Guest start, questions left, limit states, sign in, fallback.
5. **Go live.** One full quality check, deploy, live check of the whole guest journey on desktop and phone, README, and the dashboard showing guests.

Every slice: its own branch, small steps, read every change, tests pass, no commit until approved. Every commit: no `.env` or other secret files staged, and no Co-Authored-By trailer, Claude-Session line or mention of Claude as an author or contributor.

## Done when

- A visitor on a phone sees the note within a few seconds, taps the button and gets an answer without creating an account.
- The 11th guest question is refused politely, and when the daily guest limit is reached, signed-in customers still get answers.
- Guests can never reach the admin dashboard or API, and old guest data is deleted automatically.
- All tests pass, axe shows no violations, and the README explains guest chat, its limits and how to change them.
