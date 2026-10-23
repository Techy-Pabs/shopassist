import { store } from '../config/store.js'

// The L&L monogram: decorative, so hidden from screen readers
const variants = {
  header: 'h-avatar w-avatar bg-surface-100 text-indigo text-monogram',
  bubble: 'h-avatar-sm w-avatar-sm bg-indigo text-surface-100 text-monogram-small',
  // Larger in the round launcher on phones, as in the homepage mockup
  launcher: 'h-control w-control bg-surface-100 text-clay text-monogram sm:h-avatar sm:w-avatar sm:text-monogram-launcher',
}

export default function Monogram({ variant }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-pill font-serif ${variants[variant]}`}>
      {store.monogram}
    </span>
  )
}
