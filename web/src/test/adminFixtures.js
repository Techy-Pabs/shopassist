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
