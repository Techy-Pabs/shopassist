// Dates and counts in the dashboard's plain words. timeZone is the store's,
// as the API names it (time_zone in /admin/stats): the API is the one place
// that sets it (STORE_TIMEZONE).

// "2026-10-29": the day a moment falls on in the store's time zone
export function storeDay(moment, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(moment),
  )
}

// Whole days from one "YYYY-MM-DD" to another
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

// A day from the API ("2026-10-29") is already the store's date, so it is
// read and formatted as UTC: no time zone can move it to another day
const dayFormat = (options) => (day) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${day}T00:00:00Z`))
export const weekday = dayFormat({ weekday: 'short' }) // "Thu"
export const dayAndMonth = dayFormat({ day: 'numeric', month: 'short' }) // "29 Oct"

// When something last happened, as a list shows it: "14:22" today,
// "Mon" this week, "29 Oct" before that
export function shortTime(moment, { timeZone, now = new Date() }) {
  const age = daysBetween(storeDay(moment, timeZone), storeDay(now, timeZone))
  if (age === 0) {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(moment))
  }
  const day = storeDay(moment, timeZone)
  return age > 0 && age < 7 ? weekday(day) : dayAndMonth(day)
}

// "today", "yesterday", "3 days ago"
export function daysAgo(moment, { timeZone, now = new Date() }) {
  const age = daysBetween(storeDay(moment, timeZone), storeDay(now, timeZone))
  if (age <= 0) return 'today'
  if (age === 1) return 'yesterday'
  return `${age} days ago`
}

// "1 question", "2 questions"
export const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
