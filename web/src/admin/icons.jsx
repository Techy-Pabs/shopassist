// The admin dashboard's line icons, from the admin mockups. Decorative:
// every one sits next to text or inside a labelled button.
function Icon({ children, className = 'h-sa-icon w-sa-icon shrink-0', strokeWidth = '1.6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      {children}
    </svg>
  )
}

export const OverviewIcon = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Icon>
)

export const ConversationsIcon = () => (
  <Icon>
    <path d="M4 5h16v11H9l-5 4z" />
  </Icon>
)

export const KnowledgeIcon = () => (
  <Icon>
    <path d="M5 4h10l4 4v12H5z" />
    <path d="M15 4v4h4M8 12h8M8 16h6" />
  </Icon>
)

export const CustomersIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
    <path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.7 3 2.5 3.5 5.2" />
  </Icon>
)

export const OpenStoreIcon = () => (
  <Icon>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </Icon>
)

export const SignOutIcon = () => (
  <Icon>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </Icon>
)

export const MenuIcon = () => (
  <Icon className="h-sa-icon-lg w-sa-icon-lg">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon className="h-sa-icon-lg w-sa-icon-lg">
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const WarningIcon = () => (
  <Icon className="h-sa-icon-sm w-sa-icon-sm shrink-0" strokeWidth="1.8">
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17v.5" />
  </Icon>
)

export const ChevronIcon = () => (
  <Icon strokeWidth="1.8">
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const DocumentIcon = () => (
  <Icon className="h-sa-icon-lg w-sa-icon-lg shrink-0">
    <path d="M5 4h10l4 4v12H5z" />
    <path d="M15 4v4h4M8 12h8M8 16h6" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon className="h-sa-icon-sm w-sa-icon-sm shrink-0" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon className="h-sa-icon-sm w-sa-icon-sm shrink-0" strokeWidth="1.8">
    <path d="M5 12l5 5L20 7" />
  </Icon>
)

export const ReopenIcon = () => (
  <Icon className="h-sa-icon-sm w-sa-icon-sm shrink-0" strokeWidth="1.8">
    <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />
  </Icon>
)

export const BackIcon = () => (
  <Icon strokeWidth="1.8">
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)
