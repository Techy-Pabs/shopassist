// Simple line icons in the current colour, with the thin stroke the brand
// rules ask for. Sizes come from the icon tokens via className.
function Icon({ children, className = 'h-icon w-icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {children}
    </svg>
  )
}

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)
