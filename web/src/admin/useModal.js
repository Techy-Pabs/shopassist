import { useLayoutEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'

// A modal dialog's keyboard rules. When it opens, focus moves into it (to
// initialFocus, or its first control); Tab and Shift+Tab stay inside it;
// Escape calls onClose; and when it closes, focus returns to what opened
// it (or to fallback(), if that's gone). Put the returned ref on the
// dialog element.
export function useModal(onClose, { initialFocus, fallback } = {}) {
  const dialog = useRef(null)
  const handlers = useRef({ onClose, fallback })
  handlers.current = { onClose, fallback }

  useLayoutEffect(() => {
    const box = dialog.current
    const opener = document.activeElement
    const controls = () => [...box.querySelectorAll(FOCUSABLE)]
    ;(initialFocus?.current ?? controls()[0] ?? box).focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        handlers.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = controls()
      if (!items.length) {
        event.preventDefault()
        return
      }
      const [first, last] = [items[0], items[items.length - 1]]
      const inside = box.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault()
        first.focus()
      }
    }
    box.addEventListener('keydown', onKeyDown)
    return () => {
      box.removeEventListener('keydown', onKeyDown)
      const back = opener && opener !== document.body && opener.isConnected ? opener : handlers.current.fallback?.()
      back?.focus()
    }
    // Once per opening: the dialog mounts when it opens
  }, [])

  return dialog
}
