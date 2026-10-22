import { store } from '../config/store.js'

const SEGMENTS = 5

// Shown while the API wakes up. The progress bar shows time elapsed out of
// the total wait (it can't know how far the server has got).
export default function WakingScreen({ elapsed, total }) {
  const filled = Math.min(SEGMENTS, Math.floor((elapsed / total) * SEGMENTS) + 1)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div aria-hidden="true" className="flex h-waking-ring w-waking-ring items-center justify-center rounded-pill bg-indigo">
          <div className="adire h-waking-ring-inner w-waking-ring-inner rounded-pill" />
        </div>
        <div className="flex max-w-waking-text flex-col gap-2 text-center">
          <h3 className="m-0 font-serif text-heading text-ink">Getting the assistant ready</h3>
          <p className="m-0 text-body text-ink-muted">After a quiet spell this can take up to a minute. Thanks for waiting.</p>
        </div>
        <div
          role="progressbar"
          aria-label="Time waited"
          aria-valuemin={0}
          aria-valuemax={SEGMENTS}
          aria-valuenow={filled}
          className="flex w-waking-progress gap-1.5"
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={`h-progress-bar flex-1 rounded-pill ${i < filled ? 'bg-indigo' : 'bg-sand'}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-dashed border-sand px-6 pb-8 pt-4">
        <p className="m-0 text-center text-body-small text-ink-muted">
          In a hurry? Email <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a> or WhatsApp{' '}
          {store.whatsappUrl ? <a href={store.whatsappUrl}>{store.whatsappNumber}</a> : store.whatsappNumber}.
        </p>
      </div>
    </div>
  )
}
