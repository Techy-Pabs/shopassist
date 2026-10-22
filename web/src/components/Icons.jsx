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

export const SendIcon = () => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)

// The alert icon is drawn in the danger colour by its parent
export const AlertIcon = () => (
  <Icon className="h-icon w-icon shrink-0">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.5" />
  </Icon>
)

export const HistoryIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

export const BackIcon = () => (
  <Icon>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon className="h-icon-sm w-icon-sm">
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
