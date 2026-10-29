import { useEffect } from 'react'

// IBM Plex Sans and Mono, loaded only while an admin page is showing (the
// store's pages never download them). The CSP already allows Google Fonts.
export const PLEX_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&display=swap'

// While the dashboard is showing: its fonts, and its page background
// (body[data-app="admin"] in index.css)
export function useAdminLook() {
  useEffect(() => {
    const fonts = document.createElement('link')
    fonts.rel = 'stylesheet'
    fonts.href = PLEX_FONTS_URL
    fonts.dataset.admin = 'fonts'
    document.head.appendChild(fonts)
    document.body.dataset.app = 'admin'
    return () => {
      fonts.remove()
      delete document.body.dataset.app
    }
  }, [])
}

// The tab's title, for each admin page
export function usePageTitle(title) {
  useEffect(() => {
    document.title = `${title} · ShopAssist admin`
  }, [title])
}
