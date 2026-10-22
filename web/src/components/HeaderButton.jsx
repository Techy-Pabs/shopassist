// A control-sized icon button on the indigo header (history, back, close)
export default function HeaderButton({ label, onClick, buttonRef, children }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-control w-control shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-surface-100"
    >
      {children}
    </button>
  )
}
