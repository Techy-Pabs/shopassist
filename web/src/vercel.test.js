// web/vercel.json: /admin addresses serve the app (so a refresh works), and
// the security headers stay exactly as they were
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf-8'))
const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]))

describe('vercel.json', () => {
  it('serves the app for /admin and every address under it', () => {
    expect(vercel.rewrites).toEqual([
      { source: '/admin', destination: '/index.html' },
      { source: '/admin/:path*', destination: '/index.html' },
    ])
  })

  it('keeps every security header and the CSP unchanged, on every address', () => {
    expect(vercel.headers).toHaveLength(1)
    expect(vercel.headers[0].source).toBe('/(.*)')
    expect(headers).toEqual({
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; connect-src https://shopassist-022b.onrender.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    })
  })
})
