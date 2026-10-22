import { store } from '../config/store.js'
import HeaderButton from './HeaderButton.jsx'
import { BackIcon, CloseIcon, HistoryIcon } from './Icons.jsx'
import Monogram from './Monogram.jsx'

// The adire band under every header: the one band on each screen
const Band = () => <div aria-hidden="true" className="adire h-adire-tile shrink-0" />

// shrink-0 on the headers: they never give up space, so they and their
// buttons stay at the top however short the window; the area below scrolls.

export default function PanelHeader({ titleId, subtitle, onClose, onHistory, historyRef }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 bg-indigo py-3 pl-4 pr-2 text-surface-100">
        <Monogram variant="header" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={titleId} className="m-0 font-serif text-title-chat">
            {store.name}
          </h2>
          <span className="text-caption font-normal text-indigo-tint">{subtitle}</span>
        </div>
        {onHistory && (
          <HeaderButton label="Conversation history" onClick={onHistory} buttonRef={historyRef}>
            <HistoryIcon />
          </HeaderButton>
        )}
        <HeaderButton label="Close chat" onClick={onClose}>
          <CloseIcon />
        </HeaderButton>
      </div>
      <Band />
    </>
  )
}

// The history header: back to the chat, the title, close
export function HistoryHeader({ titleId, onBack, onClose, backRef }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-1 bg-indigo px-2 py-3 text-surface-100">
        <HeaderButton label="Back to chat" onClick={onBack} buttonRef={backRef}>
          <BackIcon />
        </HeaderButton>
        <h2 id={titleId} className="m-0 flex-1 font-serif text-title-chat">
          Your conversations
        </h2>
        <HeaderButton label="Close chat" onClick={onClose}>
          <CloseIcon />
        </HeaderButton>
      </div>
      <Band />
    </>
  )
}
