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

// A small "i" in a circle, set inline before a line of text
export const InfoIcon = () => (
  <Icon className="mr-1.5 inline-block h-icon-sm w-icon-sm align-text-bottom">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.5" />
  </Icon>
)

// Homepage icons, from the homepage mockups
export const MenuIcon = () => (
  <Icon className="h-icon-menu w-icon-menu">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const ChatIcon = () => (
  <Icon className="h-icon-sm w-icon-sm">
    <path d="M4 5h16v11H9l-5 4z" />
  </Icon>
)

// The delivery and payment strip: drawn in indigo, larger on desktop
const serviceSize = 'h-icon-md w-icon-md shrink-0 text-indigo sm:h-icon-lg sm:w-icon-lg'

export const ServiceIcon = ({ name }) => (
  <Icon className={serviceSize}>
    {name === 'van' && (
      <>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
        <circle cx="7" cy="17.5" r="1.5" />
        <circle cx="17" cy="17.5" r="1.5" />
      </>
    )}
    {name === 'globe' && (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    )}
    {name === 'pin' && (
      <>
        <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    )}
    {name === 'cash' && (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    )}
  </Icon>
)
