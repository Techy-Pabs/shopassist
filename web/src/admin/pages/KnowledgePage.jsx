import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { store } from '../../config/store.js'
import { useIsMobile } from '../../hooks/useIsMobile.js'
import { FilterTabs, SearchBox } from '../controls.jsx'
import { count, fileSize, fileTypes, startedAt, updatedAt } from '../format.js'
import { DismissIcon, DoneIcon, DropIcon, TrashIcon, UploadIcon } from '../icons.jsx'
import { useAdminSession } from '../session.jsx'
import { useStoreStats } from '../storeStats.jsx'
import { useLoad } from '../useLoad.js'
import { useModal } from '../useModal.js'
import { PageHeader } from './Pages.jsx'

// The tabs, as the address names them (?source=uploaded), with the API's
// name for each (source_type) and the count it goes with
const SOURCES = [
  { value: 'all', label: 'All', api: 'all', count: 'all' },
  { value: 'built-in', label: 'Built in', api: 'folder', count: 'folder' },
  { value: 'uploaded', label: 'Uploaded', api: 'upload', count: 'upload' },
]
// The most the API sends at once: a store's knowledge is a few dozen documents
const LIMIT = 100

const BUILT_IN_NOTE = "Built in documents come from the store's setup and are changed by your developer."

const panel = 'rounded-sa-lg border border-sa-line bg-sa-surface'
const outlineButton =
  'inline-flex cursor-pointer items-center justify-center gap-sa-2 rounded-sa-md border border-sa-line-strong bg-sa-surface px-sa-4 font-sa-sans text-sa-body font-medium text-sa-ink aria-disabled:cursor-default aria-disabled:text-sa-ink-muted'
const primaryButton =
  'inline-flex cursor-pointer items-center justify-center gap-sa-2 rounded-sa-md border-0 bg-sa-accent px-sa-4 font-sa-sans text-sa-body font-semibold text-sa-surface aria-disabled:cursor-default'

function SourceBadge({ document }) {
  const chip = 'whitespace-nowrap rounded-sa-pill px-sa-2 py-sa-0.5 text-sa-caption font-semibold'
  return document.source_type === 'upload'
    ? <span className={`${chip} bg-sa-accent-tint text-sa-accent`}>Uploaded</span>
    : <span className={`${chip} bg-sa-surface-sunken text-sa-ink-soft`}>Built in</span>
}

// The browser's own check, so an obvious mistake says so at once. The
// server checks again (and more: real file contents, pages, length), and
// its answer is the rule.
function problemWith(file, limits) {
  if (file.size === 0) return 'The file is empty.'
  if (!limits) return null
  const dot = file.name.lastIndexOf('.')
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase()
  if (!limits.accepted_types.includes(extension)) {
    return `The assistant can read ${fileTypes(limits.accepted_types)} files only.`
  }
  if (file.size > limits.max_file_bytes) {
    return `It's ${fileSize(file.size)}, over the ${fileSize(limits.max_file_bytes)} limit.`
  }
  return null
}

function limitsText(limits) {
  if (limits.status === 'ready') return `${fileTypes(limits.data.accepted_types)} files, up to ${fileSize(limits.data.max_file_bytes)}.`
  if (limits.status === 'error') return "We couldn't load the upload limits; the server still checks each file."
  return 'Checking which files you can upload…'
}

// A chunk starts with its place in the document ("Gift wrapping > What we
// offer"), then a blank line, then its text
export function splitSection(content) {
  const at = content.indexOf('\n\n')
  const first = at === -1 ? '' : content.slice(0, at)
  if (!first || first.includes('\n')) return { heading: null, text: content }
  return { heading: first, text: content.slice(at + 2) }
}

// What's happening with an upload or a delete, above the table
function Banner({ banner, onDismiss }) {
  if (!banner) return null
  const dismiss = (
    <button type="button" aria-label="Dismiss" onClick={onDismiss}
      className="flex h-sa-control w-sa-control shrink-0 cursor-pointer items-center justify-center rounded-sa-md border-0 bg-transparent text-current">
      <DismissIcon />
    </button>
  )
  const row = 'flex flex-wrap items-center gap-sa-3 rounded-sa-lg border px-sa-4 py-sa-3'
  if (banner.kind === 'uploading') {
    return (
      <div role="status" className={`${row} flex-col items-stretch border-sa-line bg-sa-surface`}>
        <span>
          Uploading and reading <strong className="font-semibold">{banner.name}</strong>… This takes a few seconds while the assistant learns it.
        </span>
        <progress aria-label={`Uploading ${banner.name}`} className="h-sa-1.5 w-full accent-sa-accent" />
      </div>
    )
  }
  if (banner.kind === 'error') {
    return (
      <div role="alert" className={`${row} border-sa-danger-line bg-sa-danger-wash text-sa-danger-ink`}>
        <span className="min-w-0 grow basis-sa-panel-basis">
          {banner.name ? <><strong className="font-semibold">{banner.name}</strong> wasn&apos;t added. </> : null}
          {banner.message}
        </span>
        {dismiss}
      </div>
    )
  }
  return (
    <div role="status" className={`${row} border-sa-accent-line bg-sa-accent-tint`}>
      <span className="text-sa-accent"><DoneIcon /></span>
      <span className="min-w-0 grow basis-sa-panel-basis">
        <strong className="font-semibold">{banner.name}</strong>
        {banner.kind === 'added' ? ' was added. The assistant can use it from now on.' : ' was deleted. The assistant no longer uses it.'}
      </span>
      <span className="text-sa-accent">{dismiss}</span>
    </div>
  )
}

function DocumentsTable({ list, request, highlight, timeZone, phone, previewLink, onDelete, onClearSearch, ids }) {
  const message = 'flex flex-col gap-sa-1 px-sa-4 py-sa-6'
  const items = list.status === 'ready' ? list.data.items : []
  let body
  if (list.status === 'loading') body = <p role="status" className="m-0 px-sa-4 py-sa-6 text-sa-ink-muted">Loading documents…</p>
  else if (list.status === 'error') {
    body = (
      <div role="alert" className={`${message} gap-sa-3`}>
        <p className="m-0 font-semibold">We couldn&apos;t load the documents</p>
        <p className="m-0 text-sa-small text-sa-ink-muted">{list.message}</p>
        <button type="button" onClick={list.retry} className={`${outlineButton} h-sa-control-lg self-start`}>Try again</button>
      </div>
    )
  } else if (items.length === 0) {
    const [title, text] = request.q
      ? [`No documents match “${request.q}”`, 'Try other words, or search for a file name.']
      : request.source === 'uploaded'
        ? ['No uploaded documents yet', 'Upload a document to teach the assistant something new.']
        : request.source === 'built-in'
          ? ['No built in documents', BUILT_IN_NOTE]
          : ['No documents yet', 'Upload a document to teach the assistant about the store.']
    body = (
      <div className={message}>
        <p className="m-0 font-semibold">{title}</p>
        <p className="m-0 text-sa-small text-sa-ink-muted">{text}</p>
        {request.q && <button type="button" onClick={onClearSearch} className={`${outlineButton} mt-sa-2 h-sa-control-lg self-start`}>Clear search</button>}
      </div>
    )
  } else {
    const cell = 'px-sa-4 py-sa-3'
    const control = phone ? 'h-sa-touch' : 'h-sa-control-md'
    body = (
      // Scrolls sideways inside its own box on narrow screens (focusable, so
      // the keyboard can scroll it too). Relative, so the hidden labels in the
      // table (position: absolute) stay inside the box; otherwise they widen
      // the whole page on a phone.
      <div role="region" aria-label="Documents table" tabIndex={0} className="relative overflow-x-auto">
        <table className="w-full min-w-sa-table-min border-collapse text-left">
          <thead>
            <tr className="bg-sa-surface-muted text-sa-caption text-sa-ink-muted">
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Document</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Source</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 text-right font-semibold">Sections</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold">Updated</th>
              <th scope="col" className="px-sa-4 py-sa-2.5 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className={`border-t border-sa-line-soft ${d.id === highlight ? 'bg-sa-accent-faint' : ''}`}>
                <td className={cell}>
                  <Link to={previewLink(d.id)} data-preview={d.id} className="break-all font-semibold text-sa-ink">{d.source}</Link>
                </td>
                <td className={cell}><SourceBadge document={d} /></td>
                <td className={`${cell} text-right font-sa-mono`}>{d.chunk_count}</td>
                <td className={`${cell} text-sa-ink-muted`}>
                  {timeZone && updatedAt(d.updated_at, { timeZone })}
                  {d.source_type === 'upload' && d.uploaded_by_email && ` · ${d.uploaded_by_email}`}
                </td>
                <td className="whitespace-nowrap px-sa-3 py-sa-1.5 text-right">
                  <Link to={previewLink(d.id)} className={`inline-flex ${control} items-center px-sa-2.5 align-middle font-medium`}>
                    Preview<span className="sr-only"> {d.source}</span>
                  </Link>
                  {d.source_type === 'upload' ? (
                    <button type="button" aria-label={`Delete ${d.source}`} onClick={() => onDelete(d)}
                      className={`inline-flex ${phone ? 'h-sa-touch w-sa-touch' : 'h-sa-control-md w-sa-control-md'} cursor-pointer items-center justify-center rounded-sa-md border-0 bg-transparent align-middle text-sa-danger hover:bg-sa-danger-wash`}>
                      <TrashIcon />
                    </button>
                  ) : (
                    <span aria-hidden="true" className={`inline-block ${phone ? 'w-sa-touch' : 'w-sa-control-md'} align-middle`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${request.source}`} tabIndex={items.length ? undefined : 0}>
      {body}
    </div>
  )
}

// The document in its sections, as a panel over the page. Its text is
// untrusted (anyone with admin access can upload it): plain text only.
function Preview({ id, timeZone, phone, onClose, onDelete, fallback }) {
  const loaded = useLoad(/^\d+$/.test(id) ? `/admin/knowledge/documents/${id}` : null)
  const close = useRef(null)
  const dialog = useModal(onClose, { initialFocus: close, fallback })
  const titleId = useId()

  // The page behind doesn't scroll while the panel is open
  useEffect(() => {
    document.body.classList.add('overflow-hidden')
    return () => document.body.classList.remove('overflow-hidden')
  }, [])

  const notFound = !/^\d+$/.test(id) || loaded.httpStatus === 404
  const d = loaded.status === 'ready' ? loaded.data : null
  const title = d ? d.source : notFound ? 'Document not found' : loaded.status === 'error' ? "We couldn't load this document" : 'Document preview'
  const side = phone ? 'px-sa-4' : 'px-sa-6'

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-sa-overlay" />
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`fixed z-40 flex flex-col bg-sa-surface outline-none ${phone ? 'inset-0' : 'inset-y-0 right-0 w-sa-preview max-w-full border-l border-sa-line'}`}>
        <div className={`flex items-start gap-sa-3 border-b border-sa-line ${side} pb-sa-4 pt-sa-5`}>
          <div className="flex min-w-0 flex-1 flex-col gap-sa-1.5">
            <h2 id={titleId} className="m-0 break-all text-sa-heading-lg">{title}</h2>
            {d && (
              <div className="flex flex-wrap items-center gap-sa-2 text-sa-small text-sa-ink-muted">
                <SourceBadge document={d} />
                {timeZone && (
                  <span>
                    {d.source_type === 'upload'
                      ? `by ${d.uploaded_by_email ?? 'an admin'}, ${startedAt(d.created_at, { timeZone })}`
                      : `updated ${startedAt(d.updated_at, { timeZone })}`}
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span>{count(d.chunk_count, 'section')}</span>
                {d.size_bytes != null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{fileSize(d.size_bytes)}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button ref={close} type="button" aria-label="Close preview" onClick={onClose}
            className={`flex ${phone ? 'h-sa-touch w-sa-touch' : 'h-sa-control-lg w-sa-control-lg'} shrink-0 cursor-pointer items-center justify-center rounded-sa-md border-0 bg-transparent text-sa-ink hover:bg-sa-surface-muted`}>
            <DismissIcon />
          </button>
        </div>

        <div className={`flex min-h-0 flex-1 flex-col gap-sa-4 overflow-y-auto ${side} py-sa-5`}>
          {notFound && <p className="m-0 text-sa-ink-muted">There&apos;s no document at this address. It may have been deleted.</p>}
          {!notFound && loaded.status === 'loading' && <p role="status" className="m-0 text-sa-ink-muted">Loading the document…</p>}
          {!notFound && loaded.status === 'error' && (
            <div role="alert" className="flex flex-col gap-sa-3">
              <p className="m-0 text-sa-ink-muted">{loaded.message}</p>
              <button type="button" onClick={loaded.retry} className={`${outlineButton} h-sa-control-lg self-start`}>Try again</button>
            </div>
          )}
          {d && (
            <>
              <p className="m-0 text-sa-ink-muted">
                The assistant reads this document in sections. Each section is searched on its own when a customer asks a question.
              </p>
              {d.sections.length === 0 && <p className="m-0">This document has no sections yet.</p>}
              {d.sections.map((section) => {
                const { heading, text } = splitSection(section.content)
                return (
                  <article key={section.chunk_index} className="flex flex-col gap-sa-2 rounded-sa-lg border border-sa-line p-sa-4">
                    <h3 className="m-0 break-words font-sa-mono text-sa-caption font-medium text-sa-ink-muted">
                      Section {section.chunk_index + 1}{heading && ` · ${heading}`}
                    </h3>
                    <p className="m-0 whitespace-pre-wrap break-words">{text}</p>
                  </article>
                )
              })}
            </>
          )}
        </div>

        {d && (
          <div className={`flex flex-wrap items-center justify-between gap-sa-3 border-t border-sa-line ${side} py-sa-3.5`}>
            {d.source_type === 'upload' ? (
              <>
                <span className="text-sa-small text-sa-ink-muted">Replace it by deleting it and uploading a new version.</span>
                <button type="button" onClick={() => onDelete(d)}
                  className={`inline-flex ${phone ? 'h-sa-touch' : 'h-sa-control-lg'} cursor-pointer items-center gap-sa-2 rounded-sa-md border border-sa-danger bg-sa-surface px-sa-3.5 font-sa-sans text-sa-body font-medium text-sa-danger hover:bg-sa-danger-wash`}>
                  <TrashIcon />
                  Delete
                </button>
              </>
            ) : (
              <span className="text-sa-small text-sa-ink-muted">{BUILT_IN_NOTE}</span>
            )}
          </div>
        )}
      </section>
    </>
  )
}

// "Delete gift-wrapping.md?": an alert dialog over everything else
function ConfirmDelete({ confirm, onCancel, onConfirm, phone }) {
  const keep = useRef(null)
  const dialog = useModal(onCancel, { initialFocus: keep })
  const ids = useId()
  const pending = confirm.status === 'pending'
  const button = phone ? 'h-sa-touch' : 'h-sa-control-lg'
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-sa-overlay" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-sa-4">
        <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={`${ids}-title`} aria-describedby={`${ids}-body`} tabIndex={-1}
          className="flex w-sa-dialog max-w-full flex-col gap-sa-3 rounded-sa-lg border border-sa-danger-line bg-sa-danger-wash p-sa-4 outline-none">
          <div className="flex flex-col gap-sa-1">
            <h2 id={`${ids}-title`} className="m-0 break-all text-sa-lead font-semibold text-sa-danger-ink">Delete {confirm.name}?</h2>
            <p id={`${ids}-body`} className="m-0">
              The assistant stops using it straight away, and customers who ask about what it covers will be pointed to your
              support team. This can&apos;t be undone.
            </p>
          </div>
          {confirm.error && <p role="alert" className="m-0 text-sa-small font-medium text-sa-danger-ink">{confirm.error}</p>}
          <div className="flex flex-wrap justify-end gap-sa-2">
            <button ref={keep} type="button" onClick={onCancel} className={`${outlineButton} ${button}`}>Keep document</button>
            <button type="button" onClick={onConfirm} aria-disabled={pending}
              className={`inline-flex ${button} cursor-pointer items-center rounded-sa-md border-0 bg-sa-danger px-sa-4 font-sa-sans text-sa-body font-semibold text-sa-surface aria-disabled:cursor-default`}>
              {pending ? 'Deleting…' : 'Delete document'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function readRequest(params) {
  const source = SOURCES.some((s) => s.value === params.get('source')) ? params.get('source') : 'all'
  return { source, q: (params.get('q') ?? '').trim(), document: params.get('document') }
}

export default function KnowledgePage() {
  const phone = useIsMobile()
  const { api } = useAdminSession()
  const { timeZone } = useStoreStats()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const request = readRequest(params)
  const ids = useId()

  // The address keeps the tab, the search and the open document
  const latest = useRef(params)
  latest.current = params
  const go = useCallback((changes, options) => {
    const next = new URLSearchParams(latest.current)
    for (const [key, value] of Object.entries(changes)) {
      if (value && !(key === 'source' && value === 'all')) next.set(key, value)
      else next.delete(key)
    }
    const text = next.toString()
    navigate(`/admin/knowledge${text ? `?${text}` : ''}`, options)
  }, [navigate])
  const linkWith = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) next.set(key, value)
    return `/admin/knowledge?${next.toString()}`
  }
  const onSearch = useCallback((q) => go({ q }, { replace: true }), [go])

  const apiSource = SOURCES.find((s) => s.value === request.source).api
  const list = useLoad(`/admin/knowledge/documents?source_type=${apiSource}&limit=${LIMIT}${request.q ? `&q=${encodeURIComponent(request.q)}` : ''}`)
  const limits = useLoad('/admin/knowledge/limits')
  const counts = useRef(null)
  if (list.status === 'ready') counts.current = list.data.counts

  const [banner, setBanner] = useState(null)
  const [highlight, setHighlight] = useState(null)
  const [dragging, setDragging] = useState(false)
  const uploading = useRef(false)
  const fileInput = useRef(null)

  async function upload(files) {
    if (uploading.current) return // one upload at a time
    const chosen = [...(files ?? [])]
    if (chosen.length === 0) return
    if (chosen.length > 1) {
      setBanner({ kind: 'error', name: null, message: 'Upload one file at a time.' })
      return
    }
    const [file] = chosen
    const problem = problemWith(file, limits.status === 'ready' ? limits.data : null)
    if (problem) {
      setBanner({ kind: 'error', name: file.name, message: problem })
      return
    }
    uploading.current = true
    setBanner({ kind: 'uploading', name: file.name })
    const form = new FormData()
    form.append('file', file)
    const result = await api.request('POST', '/admin/knowledge/documents', { form })
    uploading.current = false
    if (result.ok) {
      setBanner({ kind: 'added', name: result.data.source })
      setHighlight(result.data.id)
      list.refresh()
    } else if (result.kind !== 'session-ended') {
      setBanner({ kind: 'error', name: file.name, message: result.message })
    }
  }

  // Deleting: { id, name, status, error } while the confirmation is open
  const [confirm, setConfirm] = useState(null)
  const focusHeading = useRef(false)
  const askToDelete = (d) => setConfirm({ id: d.id, name: d.source, status: 'idle', error: null })
  const cancelDelete = () => setConfirm((c) => (c?.status === 'pending' ? c : null))
  async function confirmDelete() {
    if (!confirm || confirm.status === 'pending') return
    setConfirm({ ...confirm, status: 'pending', error: null })
    const result = await api.request('DELETE', `/admin/knowledge/documents/${confirm.id}`)
    // 404: someone else deleted it first, which is what was asked for
    if (result.ok || result.status === 404) {
      setConfirm(null)
      if (request.document === String(confirm.id)) go({ document: null })
      setBanner({ kind: 'deleted', name: confirm.name })
      setHighlight(null)
      focusHeading.current = true
      list.refresh()
    } else if (result.kind !== 'session-ended') {
      // Including 409: the API refuses to delete a built in document
      setConfirm({ ...confirm, status: 'idle', error: result.message })
    }
  }
  // After a delete the button that opened it is gone: focus the page heading
  useEffect(() => {
    if (focusHeading.current && list.status === 'ready') {
      focusHeading.current = false
      document.querySelector('main h1')?.focus()
    }
  }, [list.data, list.status])

  const uploadButton = (
    <>
      <button type="button" aria-disabled={banner?.kind === 'uploading'} onClick={() => !uploading.current && fileInput.current?.click()}
        className={`${primaryButton} ${phone ? 'h-sa-touch w-full' : 'h-sa-control-lg'}`}>
        <UploadIcon />
        {banner?.kind === 'uploading' ? 'Uploading…' : 'Upload document'}
      </button>
      <input ref={fileInput} type="file" hidden accept={limits.status === 'ready' ? limits.data.accepted_types.join(',') : undefined}
        onChange={(event) => {
          upload(event.target.files)
          event.target.value = '' // so the same file can be chosen again
        }} />
    </>
  )

  const total = counts.current?.all
  return (
    <div className={`flex flex-col ${phone ? 'gap-sa-3' : 'gap-sa-5'}`}>
      <PageHeader title="Knowledge" srOnly={phone}
        description={`Everything the assistant knows about ${store.name}. It answers only from these documents.`}>
        {uploadButton}
      </PageHeader>

      {phone ? (
        <p className="m-0 text-sa-small text-sa-ink-muted">{limitsText(limits)}</p>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            upload(event.dataTransfer.files)
          }}
          className={`flex flex-wrap items-center justify-center gap-x-sa-4 gap-y-sa-3 rounded-sa-lg border-sa-dashed border-dashed px-sa-5 py-sa-5.5 text-center ${
            dragging ? 'border-sa-accent bg-sa-accent-wash' : 'border-sa-line-strong bg-sa-surface-muted'
          }`}
        >
          <span className="text-sa-accent"><DropIcon /></span>
          <span><strong className="font-semibold">Drop a file here</strong> or use Upload document. {limitsText(limits)}</span>
        </div>
      )}

      <Banner banner={banner} onDismiss={() => setBanner(null)} />

      <section aria-label="Documents" className={`${panel} overflow-hidden`}>
        <div className={`flex flex-wrap items-center gap-sa-3 border-b border-sa-line ${phone ? 'p-sa-3' : 'px-sa-4 py-sa-3'}`}>
          <FilterTabs options={SOURCES} value={request.source} counts={counts.current} ids={ids} phone={phone} label="Filter documents"
            onChange={(source) => go({ source })} />
          <div className={phone ? 'w-full' : 'ml-auto'}>
            <SearchBox q={request.q} onSearch={onSearch} label="Search documents" placeholder="Search documents"
              size={phone ? 'h-sa-control-xl w-full' : 'h-sa-control-md w-sa-search-sm max-w-full'} />
          </div>
        </div>
        <DocumentsTable
          list={list}
          request={request}
          highlight={highlight}
          timeZone={timeZone}
          phone={phone}
          ids={ids}
          previewLink={(id) => linkWith({ document: id })}
          onDelete={askToDelete}
          onClearSearch={() => go({ q: null })}
        />
        {list.status === 'ready' && list.data.items.length > 0 && (
          <div className="flex flex-wrap justify-between gap-sa-2 border-t border-sa-line px-sa-4 py-sa-3 text-sa-small text-sa-ink-muted">
            <span>Showing {list.data.items.length} of {count(total ?? list.data.total, 'document')}</span>
            <span>{BUILT_IN_NOTE}</span>
          </div>
        )}
      </section>

      {request.document && (
        <Preview
          key={request.document}
          id={request.document}
          timeZone={timeZone}
          phone={phone}
          onClose={() => go({ document: null })}
          onDelete={askToDelete}
          fallback={() => document.querySelector(`[data-preview="${request.document}"]`) ?? document.querySelector('main h1')}
        />
      )}
      {confirm && <ConfirmDelete confirm={confirm} onCancel={cancelDelete} onConfirm={confirmDelete} phone={phone} />}
    </div>
  )
}
