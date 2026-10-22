import { store } from '../config/store.js'
import { CloseIcon } from './Icons.jsx'
import Monogram from './Monogram.jsx'

// The indigo header, then the adire band (the one band on each screen)
export default function PanelHeader({ titleId, subtitle, onClose, children }) {
  return (
    <>
      {/* shrink-0: the header never gives up space, so the close button stays
          reachable however short the window is; the content below scrolls */}
      <div className="flex shrink-0 items-center gap-3 bg-indigo py-3 pl-4 pr-2 text-surface-100">
        <Monogram variant="header" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={titleId} className="m-0 font-serif text-title-chat">
            {store.name}
          </h2>
          <span className="text-caption font-normal text-indigo-tint">{subtitle}</span>
        </div>
        {children}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-control w-control cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-surface-100"
        >
          <CloseIcon />
        </button>
      </div>
      <div aria-hidden="true" className="adire h-adire-tile shrink-0" />
    </>
  )
}
