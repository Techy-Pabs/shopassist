import StitchedRule from './StitchedRule.jsx'

// "Today, 2:14 pm" between two stitched rules, above each day's messages
export default function DateDivider({ label }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <StitchedRule />
      <span className="text-caption text-ink-muted">{label}</span>
      <StitchedRule />
    </div>
  )
}
