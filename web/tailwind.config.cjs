// CommonJS, so token edits reach a running dev server (see tokens.theme.cjs)
const { buildTheme, loadAdminTokens, loadTokens } = require('./tokens.theme.cjs')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Not "extend": the token theme replaces Tailwind's defaults entirely. The
  // admin dashboard's tokens are added with the "sa-" prefix.
  theme: buildTheme(loadTokens(), loadAdminTokens()),
  plugins: [],
}
