import Monogram from './Monogram.jsx'

// Bubble widths: the bubble-mobile token on mobile, bubble-desktop above.
// As in the mockups, the width is the text's, with the padding outside it.
const width = 'box-content max-w-bubble-mobile sm:max-w-bubble-desktop'
// Folded tag: three large corners and a small one nearest the sender.
// whitespace-pre-wrap keeps the reply's line breaks.
const text = 'm-0 whitespace-pre-wrap break-words px-4 py-3 text-body'

// Message text is always rendered as text: React escapes it, so "<b>" or
// "<script>" in a reply shows literally and is never turned into HTML.
export default function MessageBubble({ role, content, spaced }) {
  const gap = spaced ? 'mt-4' : '' // a change of sender: 8 + 16 = space-6
  if (role === 'user') {
    return (
      <p className={`${text} ${width} ${gap} self-end rounded-lg rounded-br-sm bg-indigo text-surface-100`}>
        {content}
      </p>
    )
  }
  return (
    <div className={`flex items-end gap-2 ${gap}`}>
      <Monogram variant="bubble" />
      <p className={`${text} ${width} rounded-lg rounded-bl-sm border border-sand bg-surface-raised text-ink`}>
        {content}
      </p>
    </div>
  )
}
