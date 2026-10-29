// Replies from the admin API, as the backend sends them, for tests

export const ADMIN_ME = {
  status: 200, body: { id: 1, email: 'abraham@example.com', role: 'admin', created_at: '2026-10-02T09:00:00Z' },
}

// GET /admin/stats?range=7d: a week from Thursday 22 to Wednesday 28 October
export function statsBody(overrides = {}) {
  return {
    range: '7d',
    time_zone: 'Africa/Lagos',
    since: '2026-10-22T00:00:00+01:00',
    conversations: 48,
    previous_conversations: 39,
    questions: 198,
    answered: 186,
    needs_attention: { total: 5, couldnt_answer: 3, unanswered: 2 },
    knowledge: { documents: 9, last_updated: '2026-10-26T10:00:00Z' },
    customers: 31,
    per_day: [5, 8, 11, 4, 6, 7, 7].map((conversations, i) => ({ day: `2026-10-${22 + i}`, conversations })),
    ...overrides,
  }
}

export const STATS = { status: 200, body: statsBody() }

export function conversation(overrides = {}) {
  return {
    id: 7,
    title: 'Do you sell silk evening gowns?',
    user_id: 3,
    owner_email: 'chioma.o@example.com',
    message_count: 2,
    created_at: '2026-10-28T13:20:00Z',
    last_activity: '2026-10-28T13:22:00Z',
    status: 'needs_attention',
    attention_reason: 'couldnt_answer',
    resolved_at: null,
    ...overrides,
  }
}

// GET /admin/conversations?filter=attention
export function conversationsBody(items) {
  return { items, total: items.length, limit: 5, offset: 0, counts: { all: 48, attention: items.length, resolved: 0 } }
}

export const ATTENTION = {
  status: 200,
  body: conversationsBody([
    conversation(),
    conversation({ id: 8, title: 'Can I change my delivery address?', owner_email: 'tunde.a@example.com', attention_reason: 'unanswered' }),
  ]),
}

export function message(overrides = {}) {
  return { id: 1, role: 'user', content: 'Do you sell silk evening gowns?', created_at: '2026-10-28T13:22:00Z', outcome: null, sources: [], ...overrides }
}

// GET /admin/conversations/7: a question it couldn't answer, then one it
// answered from a document, by a customer with two earlier conversations
export function detailBody(overrides = {}) {
  return {
    conversation: conversation({ message_count: 4 }),
    resolved_by: null,
    messages: [
      message(),
      message({ id: 2, role: 'assistant', outcome: 'no_info', created_at: '2026-10-28T13:22:05Z', content: "I don't have information about a silk evening gown." }),
      message({ id: 3, content: 'Okay. How much is the green lace dress?', created_at: '2026-10-28T13:23:00Z' }),
      message({
        id: 4, role: 'assistant', outcome: 'answered', created_at: '2026-10-28T13:23:05Z',
        content: 'The Green lace panel dress costs ₦48,500.',
        sources: [
          { document_id: 12, document_name: 'products-and-fabrics.md', similarity: 0.81 },
          { document_id: 12, document_name: 'products-and-fabrics.md', similarity: 0.74 },
          { document_id: null, document_name: 'old-price-list.md', similarity: 0.6 },
        ],
      }),
    ],
    customer: {
      id: 3, email: 'chioma.o@example.com', joined: '2026-10-12T09:00:00Z',
      conversation_count: 3, questions_asked: 7, couldnt_answer: 1,
      earlier_conversations: [
        { id: 5, title: 'Delivery to Lekki', last_activity: '2026-10-21T10:00:00Z', status: 'open' },
        { id: 4, title: null, last_activity: '2026-10-14T10:00:00Z', status: 'resolved' },
      ],
    },
    ...overrides,
  }
}

export const DETAIL = { status: 200, body: detailBody() }
