import Monogram from './Monogram.jsx'

// Three dots that brighten in turn. With reduced motion they stay still at
// the mockup's shades. Hidden from screen readers: the chat's live region
// announces "Loom & Lane is typing" instead, so it isn't read twice.
const dots = [
  { rest: 'opacity-100', motion: 'motion-safe:animate-typing-1' },
  { rest: 'opacity-dot-fade-2', motion: 'motion-safe:animate-typing-2' },
  { rest: 'opacity-dot-fade-3', motion: 'motion-safe:animate-typing-3' },
]

export default function TypingIndicator({ spaced }) {
  return (
    <div aria-hidden="true" data-testid="typing" className={`flex items-end gap-2 ${spaced ? 'mt-4' : ''}`}>
      <Monogram variant="bubble" />
      <div className="flex gap-1.5 rounded-lg rounded-bl-sm border border-sand bg-surface-raised p-4">
        {dots.map((dot, index) => (
          <span key={index} className={`h-dot w-dot rounded-pill bg-line-strong ${dot.rest} ${dot.motion}`} />
        ))}
      </div>
    </div>
  )
}
