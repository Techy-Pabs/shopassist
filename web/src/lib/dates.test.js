import { formatDay, formatDivider, formatTime, sameDay } from './dates.js'

const now = new Date(2026, 9, 22, 15, 30) // Thu 22 Oct 2026, 3:30 pm (local time)

describe('dates', () => {
  it('formats times with lower case am and pm', () => {
    expect(formatTime(new Date(2026, 9, 22, 14, 14))).toBe('2:14 pm')
    expect(formatTime(new Date(2026, 9, 22, 0, 5))).toBe('12:05 am')
    expect(formatTime(new Date(2026, 9, 22, 12, 0))).toBe('12:00 pm')
    expect(formatTime(new Date(2026, 9, 22, 9, 7))).toBe('9:07 am')
  })

  it('names the day: today, a weekday within a week, then a date', () => {
    expect(formatDay(new Date(2026, 9, 22, 8, 0), now)).toBe('Today')
    expect(formatDay(new Date(2026, 9, 19, 8, 0), now)).toBe('Mon')
    expect(formatDay(new Date(2026, 9, 16, 8, 0), now)).toBe('Fri') // 6 days ago
    expect(formatDay(new Date(2026, 9, 15, 8, 0), now)).toBe('15 Oct') // a week ago
    expect(formatDay(new Date(2025, 11, 31, 8, 0), now)).toBe('31 Dec')
  })

  it('builds the divider label', () => {
    expect(formatDivider(new Date(2026, 9, 22, 14, 14), now)).toBe('Today, 2:14 pm')
    expect(formatDivider(new Date(2026, 9, 12, 16, 2), now)).toBe('12 Oct, 4:02 pm')
  })

  it('compares calendar days, not 24 hour spans', () => {
    expect(sameDay(new Date(2026, 9, 22, 0, 1), new Date(2026, 9, 22, 23, 59))).toBe(true)
    expect(sameDay(new Date(2026, 9, 21, 23, 59), new Date(2026, 9, 22, 0, 1))).toBe(false)
  })
})
