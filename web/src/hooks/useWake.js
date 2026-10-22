import { useCallback, useEffect, useRef, useState } from 'react'

// Render's free tier sleeps after 15 quiet minutes. A sleeping service
// holds the first request open while it wakes, so:
//   - the first /health request is left open (not abandoned and repeated)
//   - after SHOW_WAKING_AFTER without an answer, the waking screen shows
//   - a new attempt starts RETRY_AFTER a request fails
//   - after GIVE_UP_AFTER in total, the unavailable card shows
export const SHOW_WAKING_AFTER = 3_000
export const RETRY_AFTER = 5_000
export const GIVE_UP_AFTER = 90_000
const TICK = 1_000

// state: "checking" (first 3 seconds), "waking", "ready" or "unavailable".
// elapsed: milliseconds since the check started, for the progress bar.
export function useWake(api) {
  const [state, setState] = useState('checking')
  const [elapsed, setElapsed] = useState(0)
  const [attempt, setAttempt] = useState(0) // bumped by retry()
  const done = useRef(false)

  useEffect(() => {
    done.current = false
    const started = Date.now()
    const controller = new AbortController()
    const timers = []
    let ticker = null

    const finish = (result) => {
      if (done.current) return
      done.current = true
      timers.forEach(clearTimeout)
      clearInterval(ticker)
      controller.abort()
      setState(result)
    }

    async function check() {
      const result = await api.health({ signal: controller.signal })
      if (done.current) return
      if (result.ok) return finish('ready')
      // Failed quickly (asleep and refusing, mid deploy, offline): try again
      // a little later, unless that would be past the deadline
      if (Date.now() - started + RETRY_AFTER < GIVE_UP_AFTER) timers.push(setTimeout(check, RETRY_AFTER))
    }

    setState('checking')
    setElapsed(0)
    timers.push(setTimeout(() => !done.current && setState('waking'), SHOW_WAKING_AFTER))
    timers.push(setTimeout(() => finish('unavailable'), GIVE_UP_AFTER))
    ticker = setInterval(() => setElapsed(Date.now() - started), TICK)
    check()

    return () => {
      done.current = true
      timers.forEach(clearTimeout)
      clearInterval(ticker)
      controller.abort()
    }
  }, [api, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, elapsed, retry }
}
