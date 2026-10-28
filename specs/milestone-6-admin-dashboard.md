# Milestone 6: Admin dashboard

## Goal

Give a store owner a web dashboard to see how the assistant is doing, read customer conversations, find the questions it couldn't answer, manage the knowledge it answers from, and see who uses it. The dashboard belongs to ShopAssist, not to any one store, so it has its own neutral look and shows the store's name.

The guiding idea: the dashboard should tell the owner **what to fix**, not just show a log. The loop is: a customer asks something the assistant can't answer, the owner sees it flagged, uploads a document that covers it, and the assistant answers next time.

## Approved designs

The mockups are in `web/design/mockups/admin/`:

- `Main.dc.html`: Overview
- `Conversations.dc.html`: Conversations, list with the thread open
- `Knowledge.dc.html`: Knowledge, documents and upload
- `Knowledge-Preview.dc.html`: Document preview and delete confirmation
- `Customers.dc.html`: Customers
- `Mobile-Overview.dc.html`: Overview on a phone

All numbers, names and emails in them are sample data. Placeholders in square brackets, such as `[FILE TYPES]` and `[MAX SIZE]`, must be filled from the real configuration.

The designs were informed by the patterns of real products: Intercom's help desk (list beside conversation, filters, speed), Intercom's Knowledge area (one place for every source the AI uses), Shopify's admin and Polaris (index tables, consistent page structure, empty states) and Help Scout's reports (every number leads to the conversations behind it, every metric explains itself). We follow their principles, not their visual design.

## Decisions already made

- **Look:** ShopAssist's own design system, separate from Loom & Lane. IBM Plex Sans for text, IBM Plex Mono for figures, a cool off-white ground, white surfaces, a deep green accent, amber for "needs attention", red only for destructive actions and "unanswered".
- **Devices:** designed for desktop, usable on a phone. On a phone the sidebar becomes a menu and tables scroll inside their own box.
- **Location:** the dashboard lives in the existing `web/` app at `/admin`. The chat site stays at `/`. Everything stays inside `web/` so it can still be split into its own repo later.
- **Three new backend features are in scope:** answer outcomes ("Couldn't answer"), answer sources ("Answered from"), and resolving conversations.

## New backend features

### 1. Answer outcome

Each assistant message gets an `outcome`: `answered` or `no_info`. Existing messages keep `NULL`, which the dashboard shows with no label.

How we detect `no_info`, and why:

- The prompt already tells the assistant to say it doesn't have the information when the store information doesn't cover a question. We make that wording fixed: when it can't answer, the reply must begin with the exact phrase "I don't have information". Claude Code shows the exact prompt change before and after.
- A reply is `no_info` if it begins with that phrase (ignoring case and leading spaces). It is also `no_info` if retrieval found no chunk above the similarity cut-off and the reply contains the phrase anywhere.
- This is a **heuristic**: a good guess, not a certainty. A model may occasionally word a refusal differently. That is acceptable for a dashboard label, and the README must say so plainly. We do not ask the model to output a hidden tag, because a customer could trick the model into emitting it, and because free models follow formatting instructions unreliably.
- Because the prompt changes, the full quality check must pass again before this slice is committed.

### 2. Answer sources

Each assistant message records which knowledge documents its retrieved chunks came from.

- New table `message_sources`: `id`, `message_id` (cascade delete with the message), `document_id` (nullable, set to NULL if the document is later deleted), `document_name` (a snapshot of the file name at answer time), `similarity` (the best similarity from that document).
- One row per document, not per chunk. Only documents that were actually included in the prompt are recorded.
- If a document is deleted later, the dashboard still shows its name, unlinked.

### 3. Resolving conversations

- `conversations` gets `resolved_at` (nullable timestamp) and `resolved_by` (nullable user id, set to NULL if that user is deleted).
- A new customer message in a resolved conversation clears `resolved_at`, because the conversation needs attention again.
- **Needs attention** means: not resolved, and either the latest customer message has no reply (unanswered), or the conversation contains a `no_info` reply after its last resolution.

All three changes are Alembic migrations. Review each generated migration before applying it, including CHECK constraints, which autogenerate misses.

## Admin API

Read the existing admin endpoints first and **extend them rather than duplicating them**. Every endpoint requires an admin; the role is checked from the database on every request, as it is today.

- `GET /admin/stats?range=today|7d|30d`: conversations in the range, customer questions, questions answered, needs attention count (split into couldn't answer and unanswered), knowledge document count with the latest update time, customer count, and conversations per day for the chart. Include the previous period's conversation count for the "up from" line.
- `GET /admin/conversations?filter=all|attention|resolved&q=&limit=&offset=`: newest first, with the customer email, title, last activity, message count and status. `q` searches question text and customer email, with a parameterised query.
- `GET /admin/conversations/{id}`: the conversation, its messages with `outcome` and `sources`, and a customer summary (account date, conversation count, questions asked, couldn't-answer count, a few earlier conversations).
- `POST /admin/conversations/{id}/resolve` and `POST /admin/conversations/{id}/reopen`.
- `GET /admin/users?q=&limit=&offset=`: email, role, conversation count, last active, joined. Never return password hashes.
- The existing knowledge endpoints (list, upload, preview, delete) stay. Add whatever the Knowledge page needs, such as section count and uploader, without breaking existing tests. Built-in documents cannot be deleted through the API; confirm the existing rule.

Each new endpoint has tests for: success as an admin, 401 with no token, 403 as a customer, 404 for an unknown id, and validation errors.

## Frontend

### Structure

- **Routing:** add React Router so `/` is the chat site and `/admin/...` is the dashboard, with pages `/admin`, `/admin/conversations`, `/admin/conversations/:id`, `/admin/knowledge` and `/admin/customers`.
- **Vercel:** add a rewrite in `web/vercel.json` so a direct visit or refresh on any `/admin/...` address serves the app instead of a 404. The CSP stays as strict as it is.
- **Design tokens:** a separate `web/design/admin-tokens.json` for ShopAssist. Its Tailwind names are prefixed so they can never collide with the Loom & Lane tokens. The tokens-only rule and the CSS guard test apply to the admin too.
- **Fonts:** IBM Plex Sans and IBM Plex Mono from Google Fonts, loaded only on admin pages. The CSP already allows Google Fonts.

### Auth

- Admins sign in with the existing `/auth/login`. After sign in the dashboard calls `/auth/me` and shows the dashboard only if the role is admin. A customer who signs in sees a clear "This area is for store admins" page with a link back to the store.
- This frontend check is only for a good experience. **The backend is the real gate**: every admin endpoint still rejects non-admins.
- The token is stored the same way as in the chat, and a 401 sends the admin back to sign in.

### Pages

Build each page to match its mockup.

- **Overview:** the date range switch, four key numbers that link to their detail pages, the conversations-per-day chart with an accessible text description, the needs-attention list, and the "upload a document" prompt.
- **Conversations:** list beside thread, with the customer panel. Filter tabs, search, and the "Mark as resolved" / "Reopen" button. Each assistant reply shows "Couldn't answer" when its outcome is `no_info`, and "Answered from" with its document names. "Add to knowledge" goes to the Knowledge page. On a phone the list and the thread are separate screens.
- **Knowledge:** the documents table with filters and search, drag-and-drop upload using the existing upload endpoint and its limits, the success message, the preview panel showing the document in sections, and delete with the confirmation from the mockup. Uploading and deleting show progress and clear errors.
- **Customers:** the table with search and paging.
- **Every page:** loading states, empty states (for example "No conversations need your attention"), and error states with a retry.

### Security

- **Customer messages are untrusted text.** Showing them in an admin dashboard is a classic route for stored XSS, where an attacker types a script into the chat hoping it runs in the admin's browser. Render all message and document text as plain text, never as HTML, and never use `dangerouslySetInnerHTML`. Add a test with a message containing `<script>` and `<img onerror>` that confirms it appears as text.
- Uploaded document previews are untrusted too, and the same rule applies.
- No secrets in the frontend. The admin uses the same `VITE_API_URL`.

### Accessibility

Same standard as the chat: real buttons and links, labels on every input, visible focus, 44px targets on phones, tables with proper headers, the delete confirmation as an accessible dialog that traps and returns focus, the chart described in text, and axe with no violations on every page at desktop and phone sizes.

## Slices

1. **Backend: outcomes, sources and resolving.** Migrations, detection, recording sources, resolve and reopen, the prompt phrase change, tests, and the full quality check.
2. **Backend: admin API.** Stats, conversations list and detail, users, knowledge additions, with tests.
3. **Frontend foundation.** Router, admin tokens and fonts, the layout and sidebar, the admin sign-in and role gate, the Vercel rewrite, and the CSS guard for admin classes.
4. **Overview page.**
5. **Conversations page.**
6. **Knowledge page.**
7. **Customers page, phone layouts and accessibility pass.**
8. **Deploy and document.** Live check on Vercel and Render, README section with screenshots, and the roadmap updated.

Every slice: its own branch, small steps, read every change, tests pass, no AI requests unless the slice needs them, and no commit until approved. Every commit: no `.env` or other secret files staged, and no Co-Authored-By trailer, Claude-Session line or mention of Claude as an author or contributor.

## Done when

- An admin can sign in at `/admin` on the live site, see the overview, find a conversation the assistant couldn't answer, see which documents it used, upload a document that covers the gap, and mark the conversation resolved.
- A customer account cannot see any admin page or call any admin endpoint.
- All backend and frontend tests pass, the quality check passes, and axe shows no violations on every admin page at both sizes.
- The README explains the dashboard, the outcome heuristic and its limits, and how to make someone an admin.
