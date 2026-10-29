import { count, dayAndMonth, daysAgo, shortTime, storeDay, weekday } from './format.js'

const now = new Date('2026-10-29T08:00:00Z') // Thursday, 09:00 in Lagos

describe('dates in the store time zone', () => {
  it("names a day from the API by its own date, whatever the browser's zone", () => {
    expect(weekday('2026-10-22')).toBe('Thu')
    expect(dayAndMonth('2026-10-01')).toBe('1 Oct')
  })

  it('finds the day a moment falls on in the store', () => {
    // 23:30 UTC on the 28th is already the 29th in Lagos (UTC+1)
    expect(storeDay('2026-10-28T23:30:00Z', 'Africa/Lagos')).toBe('2026-10-29')
    expect(storeDay('2026-10-28T23:30:00Z', 'UTC')).toBe('2026-10-28')
  })

  it('shows a time today, a weekday this week, and a date before that', () => {
    const lagos = { now, timeZone: 'Africa/Lagos' }
    expect(shortTime('2026-10-28T23:30:00Z', lagos)).toBe('00:30') // today in Lagos
    expect(shortTime('2026-10-28T23:30:00Z', { now, timeZone: 'UTC' })).toBe('Wed') // yesterday in UTC
    expect(shortTime('2026-10-26T10:00:00Z', lagos)).toBe('Mon')
    expect(shortTime('2026-10-20T10:00:00Z', lagos)).toBe('20 Oct')
  })

  it('says how many days ago, in words', () => {
    const lagos = { now, timeZone: 'Africa/Lagos' }
    expect(daysAgo('2026-10-29T07:00:00Z', lagos)).toBe('today')
    expect(daysAgo('2026-10-28T12:00:00Z', lagos)).toBe('yesterday')
    expect(daysAgo('2026-10-26T10:00:00Z', lagos)).toBe('3 days ago')
  })

  it('counts in words', () => {
    expect(count(1, 'customer question')).toBe('1 customer question')
    expect(count(198, 'customer question')).toBe('198 customer questions')
  })
})
