import { useEffect, useId, useRef, useState } from 'react'

import { SearchIcon } from './icons.jsx'

// How long typing pauses before a search runs
export const SEARCH_DELAY = 300

// A search box. onSearch runs once typing pauses (the page puts the search
// in the address, replacing the history entry, so Back doesn't step
// through every letter). size: the box's height and width classes.
export function SearchBox({ q, onSearch, label, placeholder, size }) {
  const [text, setText] = useState(q)
  const id = useId()

  // Back and forward change the address: show what it says
  useEffect(() => {
    setText((current) => (current.trim() === q ? current : q))
  }, [q])

  useEffect(() => {
    if (text.trim() === q) return undefined
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [text, q, onSearch])

  return (
    <div
      className={`flex ${size} items-center gap-sa-2 rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-3 text-sa-ink-muted focus-within:outline focus-within:outline-ring focus-within:outline-offset-ring focus-within:outline-sa-accent`}
    >
      <SearchIcon />
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 border-0 bg-transparent font-sa-sans text-sa-body text-sa-ink focus-visible:outline-0"
      />
    </div>
  )
}

// Filter tabs over a list: arrow keys, Home and End move between them (and
// choose the tab, so the list follows). Only the chosen tab is in the Tab
// order. The list is the panel with id `${ids}-panel`.
export function FilterTabs({ options, value, counts, onChange, ids, label, phone }) {
  const tabs = useRef({})
  function onKeyDown(event) {
    const at = options.findIndex((o) => o.value === value)
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: options.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    const next = options[(to + options.length) % options.length].value
    onChange(next)
    tabs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex shrink-0 gap-sa-1 overflow-x-auto">
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => (tabs.current[option.value] = element)}
            id={`${ids}-tab-${option.value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${ids}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`flex ${phone ? 'h-sa-touch' : 'h-sa-control'} shrink-0 cursor-pointer items-center gap-sa-1 rounded-sa-pill border px-sa-2.5 font-sa-sans text-sa-small ${
              on ? 'border-sa-ink bg-sa-ink font-medium text-sa-surface' : 'border-sa-line bg-sa-surface text-sa-ink hover:border-sa-line-strong'
            }`}
          >
            {option.label}
            {counts && <span className={on ? 'font-sa-mono' : 'font-sa-mono text-sa-ink-muted'}>{counts[option.count ?? option.value]}</span>}
          </button>
        )
      })}
    </div>
  )
}
