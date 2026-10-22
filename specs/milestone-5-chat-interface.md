# ShopAssist: Milestone 5 Spec (Chat Interface)

## Goal
A polished React chat widget for Loom & Lane customers, built exactly from
the approved mockups and the Loom & Lane design system, deployed on Vercel
and calling the live API on Render.

## Sources of truth
- web/design/mockups/*.dc.html: the eight approved screens. Match layout,
  spacing, colours, type and copy exactly.
- web/design/tokens.json: the Loom & Lane design system tokens. Every colour,
  font, spacing, size and radius in the frontend comes from these; no other
  values. Version 2 adds the values the mockups use that version 1 lacked,
  each marked "extra": true (approved in Milestone 5). The version 1
  entries are unchanged.
- web/design/README.md: the brand rules (voice, folded tag bubbles, adire band,
  stitched rule, borders not shadows, focus ring).

## Stack
React with Vite, JavaScript (no TypeScript), Tailwind CSS configured from
web/design/tokens.json, Google Fonts (Fraunces, Manrope). Vitest and React
Testing Library for tests, with fetch mocked (no extra mocking library).
Hosted on Vercel. Code lives in web/. Node 22 LTS, installed in WSL with
nvm (there is no Node in WSL today, and Docker Hub downloads are
unreliable here, so a Node container is not relied on).

## web/ stays self-contained
web/ communicates with the backend only through the HTTP API, never imports
backend code, and has its own package.json, README section, tests and
build, so it can be moved to its own repository later without changes.
The design files (tokens, brand rules and mockups) live inside it, in
web/design/, and nothing in web/ refers to a file outside web/.

## In scope
- A minimal static Loom & Lane storefront page (header, hero, three product
  cards with placeholder photos and [PRICE]) hosting the chat widget
- The launcher (clay pill and invitation bubble) and the chat panel:
  floating 380x620 panel on desktop, full screen below 640px wide
- Sign in and create account, inside the panel
- Welcome screen with five suggested question chips that send the question
- Conversation view: bubbles, typing indicator, send disabled while waiting
- Waking up screen, unavailable (502) card with Try again, history list,
  new conversation
- Backend changes listed below
- Tests, accessibility, README, deployment

## Out of scope
Admin dashboard (Milestone 6), guest chat without an account, streaming
replies, real product data, payments, TypeScript, display names on
accounts, AI generated conversation titles, rate limiting, automated pixel
comparison of screenshots.

## Backend changes (FastAPI, first slice)
- CORS: an ALLOWED_ORIGINS setting (comma separated). Local default
  http://localhost:5173. Production: the Vercel address. Never "*" (the
  setting rejects it). No credentials (the API uses an Authorization
  header, not cookies). Only the methods and headers the frontend needs:
  GET, POST and DELETE; Authorization and Content-Type. Vercel preview
  deployments have their own addresses and are not allowed; only the
  production address is.
- Conversation titles: when a message is sent to an untitled conversation,
  set its title from that message, cut to 60 characters at a word
  boundary, with "…" added only when the text was cut. The History mockup
  shows short summaries ("Returning a sale dress"); real titles will be the
  customer's first words instead. That difference is accepted.
- GET /conversations also returns updated_at (time of the latest message,
  or the conversation's creation time if it has none) and
  last_message_preview (the latest message, cut to 80 characters at a word
  boundary with "…" when cut; null if there are no messages), computed in
  one query, newest activity first. A limit query parameter (default 50,
  maximum 100) caps the list; the response stays a plain list.
- Plain text replies: a prompt rule tells the assistant to write plain
  text with no Markdown (no asterisks, headings or tables), so the
  frontend can show replies exactly as written. Checked with a quality
  re-run of at most 5 requests.
- Tests for all of the above.

## Copy and content decisions
- Welcome heading: "Hello, how can we help?" Accounts have no names, so
  the mockup's "Hello Adaeze" is not used.
- A chip sends exactly its label, so the bubble shows what was tapped.
- Create account (not mocked): the same form as sign in, with the button
  "Create account and start chatting". Creating an account signs in.
- The store's contact details live in one frontend config file. The
  WhatsApp number is a placeholder, so it is shown as text and "WhatsApp
  us" is not a wa.me link until a real number is configured.
- Unmocked desktop screens (sign in, welcome, waking, error, history) use
  the mobile layouts inside the 380x620 panel, with the desktop control
  sizes from the Main mockup (44px controls instead of 48px).
- On mobile the launcher is the pill alone, without the invitation bubble.
  The invitation bubble shows until the panel has been opened once in the
  tab.

## Behaviour
- API address from VITE_API_URL.
- Auth: the JWT is kept in sessionStorage (cleared when the tab closes).
  Any 401 on a call made with a token clears it and returns to sign in
  with "Your session ended. Please sign in again." A 401 from the sign in
  call itself is a wrong email or password, shown as such. If a message
  was being sent, its text is kept and put back in the input after
  signing in again.
- Conversations are created lazily: the first message creates one, so
  opening the panel never creates empty conversations. "New conversation"
  returns to the welcome screen. The current conversation's id is kept in
  sessionStorage, so reopening the panel in the same tab resumes it.
- Waking: on opening the panel, call /health. A cold Render service holds
  the request open while it wakes, so the first request is left open. If
  there is no answer within 3 seconds, show the waking screen. A new
  attempt starts every 5 seconds only after a request fails. After 90
  seconds in total, show the unavailable card. The five segment progress
  bar shows the time elapsed.
- Sending: show the customer bubble immediately, disable send, show the
  typing indicator. The input stays usable (placeholder "Wait for the
  reply, or type your next question"; the send button's label is "Send,
  available once the reply arrives"). On 201, show the reply. On 502, show
  the unavailable card with Try again, which resends the same text. On
  422, show the server's message under the input.
- Opening a past conversation loads its messages oldest first.
- AI replies are rendered as plain text only. Never use
  dangerouslySetInnerHTML or any HTML rendering of message content.
  Line breaks in replies are preserved.
- New messages scroll into view, unless the customer has scrolled up.
- Dates and times use the customer's browser time zone. The conversation
  shows one divider per day, such as "Today, 2:14 pm". History groups
  conversations into "This week" (the last 7 days) and "Earlier", and
  dates them "Today", then the weekday within a week ("Mon"), then
  "12 Oct".

## Accessibility
Real buttons, links, inputs and labels as in the mockups; keyboard usable
throughout; Escape closes the panel and focus returns to the launcher;
focus moves into the panel when it opens; 2px solid indigo focus ring with
2px offset; new replies announced with aria-live="polite"; respects
prefers-reduced-motion; all touch targets at least 44px.
- On mobile the full screen panel is a modal dialog (role="dialog",
  aria-modal="true") that keeps focus inside. On desktop it is a non-modal
  dialog over a still usable page, without a focus trap.
- The typing indicator and new reply announcements share one polite live
  region, so screen readers don't read them twice.
- The sign in and create account tabs follow the tabs pattern, including
  arrow keys.

## Security
- No HTML rendering of message content (see Behaviour).
- vercel.json sets a Content Security Policy: scripts only from the site,
  fonts and font styles from Google Fonts, and connections only to the
  API address.

## Quota
A friendlier public site means more chats against the roughly 25 customer
messages a day the free models allow, so the unavailable card will appear
more often. There is still no rate limiting (declined earlier).

## Tests (minimum, Vitest, API mocked, no network)
- Sign in success stores the token; wrong password shows the error
- A 401 on any call returns to sign in with the session message
- Sending shows the bubble, the typing indicator, then the reply
- A 502 shows the unavailable card; Try again resends
- A reply containing <b>tags</b> or <script> is shown as literal text
- A suggestion chip sends its question
- Escape closes the panel and focus returns to the launcher

## Visual check
Screenshots of the built screens are compared side by side with the
mockups at 1280x800 and 390x844. Automated pixel comparison is out of
scope (it would need Playwright's browser downloads).

## Build order (one slice at a time)
1. Backend changes (CORS, titles, list fields with a limit, plain text
   prompt rule) with tests and the quality re-run
2. web/ scaffold: Node in WSL, Vite, React, Tailwind from tokens, fonts,
   storefront page and launcher, matching the mockups
3. API client, sign in and create account, session handling
4. Chat: welcome, conversation, typing, sending, unavailable card, waking
5. History and new conversation
6. Tests, accessibility pass, README section for the frontend
7. Deploy to Vercel, set ALLOWED_ORIGINS on Render, add the live link

## Done when
- The live Vercel site matches the approved mockups on desktop and mobile
- A customer can register, chat with real answers, and reopen past
  conversations
- All backend and frontend tests pass
- README explains how to run, test and deploy the frontend
