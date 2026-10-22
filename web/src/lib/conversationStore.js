// The current conversation's id, kept for the tab, so reopening the panel
// resumes it. Cleared when it can't be loaded (for example after signing
// in as someone else).
const KEY = 'loomlane.conversationId'

export function loadConversationId() {
  try {
    const value = window.sessionStorage.getItem(KEY)
    return value ? Number(value) : null
  } catch {
    return null
  }
}

export function saveConversationId(id) {
  try {
    if (id) window.sessionStorage.setItem(KEY, String(id))
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // Without storage, the conversation lasts until the page reloads
  }
}
