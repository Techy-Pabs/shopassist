import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

// vercel.json is the one place the security headers live. The preview
// server sends the same ones, so `npm run preview` behaves like Vercel.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]))

// The API address is built into the JavaScript, so a wrong or missing one
// stops the build with a clear message instead of making a site that
// calls the wrong place (or the page's own address).
function checkApiUrl(command, url) {
  const fail = (why) => {
    throw new Error(`VITE_API_URL ${why}`)
  }
  if (!url) {
    fail(
      'is not set. For development, copy .env.example to .env.local. For a production build, set it to the API address, ' +
        'for example: VITE_API_URL=https://shopassist-022b.onrender.com npm run build',
    )
  }
  let address
  try {
    address = new URL(url)
  } catch {
    fail(`is not a valid address: "${url}"`)
  }
  if (command !== 'build') return

  // The deployed site is https, and browsers block its calls to http
  // addresses (this also catches .env.local's localhost address)
  if (address.protocol !== 'https:') {
    fail(`must be an https address for a production build, not "${url}". Set it on the command line, which overrides .env.local.`)
  }
  // The CSP only lets the page call the addresses in connect-src
  const csp = securityHeaders['Content-Security-Policy']
  const connectSrc = csp.split(';').map((part) => part.trim().split(/\s+/)).find(([name]) => name === 'connect-src')
  if (!connectSrc?.includes(address.origin)) {
    fail(`(${address.origin}) is not in connect-src in vercel.json, so the browser would block every API call. Add it there first.`)
  }
}

export default defineConfig(({ command, mode }) => {
  if (mode !== 'test') checkApiUrl(command, loadEnv(mode, root, 'VITE_').VITE_API_URL)
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { headers: securityHeaders },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      css: false,
    },
  }
})
