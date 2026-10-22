// Dates and times in the customer's own time zone (the browser's).
// Written out by hand, so the result is the same in every browser and
// locale: "Today, 2:14 pm", "Mon, 9:05 am", "12 Oct, 4:02 pm".
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

export function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function formatTime(date) {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`
}

// "Today", the weekday within the last week, then "12 Oct"
export function formatDay(date, now = new Date()) {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (daysAgo === 0) return 'Today'
  if (daysAgo > 0 && daysAgo < 7) return DAYS[date.getDay()]
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

// The divider above each day's messages
export function formatDivider(date, now = new Date()) {
  return `${formatDay(date, now)}, ${formatTime(date)}`
}

// History groups: "This week" is today and the six days before it
export function isThisWeek(date, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS) < 7
}
