import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'

import { AppRoutes } from '../../Root.jsx'
import {
  ADMIN_ME, DOCUMENTS, LIMITS, STATS, UPLOADED, adminDocument, documentDetail, documentsBody, statsBody,
} from '../../test/adminFixtures.js'
import { callsTo, deferred, fakeFetch } from '../../test/fakeApi.js'
import { setMobile } from '../../test/setup.js'
import { ADMIN_TOKEN_KEY } from '../session.jsx'
import { splitSection } from './KnowledgePage.jsx'

let location
function Where() {
  location = useLocation()
  return null
}
const here = () => location.pathname + location.search

const DOCUMENT_9 = { status: 200, body: documentDetail() }
const BUILT_IN_2 = { status: 200, body: documentDetail({ ...adminDocument(), size_bytes: null }) }

function open(path = '/admin/knowledge', routes = {}) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'admin-token')
  const fetch = fakeFetch({
    'GET /auth/me': ADMIN_ME,
    'GET /admin/stats': STATS,
    'GET /admin/conversations': { status: 200, body: { items: [], total: 0, limit: 5, offset: 0, counts: { all: 0, attention: 0, resolved: 0 } } },
    'GET /admin/knowledge/documents': DOCUMENTS,
    'GET /admin/knowledge/limits': LIMITS,
    'GET /admin/knowledge/documents/9': DOCUMENT_9,
    'GET /admin/knowledge/documents/2': BUILT_IN_2,
    ...routes,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes fetchImpl={fetch} />
      <Where />
    </MemoryRouter>,
  )
  return { fetch, user }
}

const table = () => screen.findByRole('table')
const rowFor = async (name) => (await screen.findByRole('link', { name })).closest('tr')
const fileInput = () => document.querySelector('input[type="file"]')
const markdown = (name = 'gift-wrapping.md', text = '# Gift wrapping\n\nWe wrap orders.') => new File([text], name, { type: 'text/markdown' })
const listQuery = (fetch) => new URL(callsTo(fetch, 'GET', '/admin/knowledge/documents').at(-1)[0]).searchParams
const uploads = (fetch) => callsTo(fetch, 'POST', '/admin/knowledge/documents')
const ADDED = { status: 201, body: { ...UPLOADED, id: 12, source: 'returns-faq.md', size_bytes: 300, embedding_requests: 1 } }

describe('the documents table', () => {
  it('shows each document with its source, sections, date and uploader', async () => {
    open()
    await table()

    const uploaded = await rowFor('gift-wrapping.md')
    expect(within(uploaded).getByText('Uploaded')).toBeInTheDocument()
    expect(uploaded).toHaveTextContent('2')
    await waitFor(() => expect(uploaded).toHaveTextContent('abraham@example.com'))
    expect(within(uploaded).getByRole('link', { name: 'gift-wrapping.md' })).toHaveAttribute('href', '/admin/knowledge?document=9')
    expect(within(uploaded).getByRole('button', { name: 'Delete gift-wrapping.md' })).toBeInTheDocument()

    const builtIn = await rowFor('products-and-fabrics.md')
    expect(within(builtIn).getByText('Built in')).toBeInTheDocument()
    expect(within(builtIn).queryByRole('button')).not.toBeInTheDocument() // built in documents can't be deleted here
    expect(within(builtIn).getByRole('link', { name: 'Preview products-and-fabrics.md' })).toHaveAttribute('href', '/admin/knowledge?document=2')
    expect(screen.getByText('Showing 3 of 3 documents')).toBeInTheDocument()
  })

  it('has proper column headers', async () => {
    open()
    const headers = within(await table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Document', 'Source', 'Sections', 'Updated', 'Actions'])
  })

  it('tabs show the counts, follow the address, and work from the keyboard', async () => {
    const { fetch, user } = open()
    await table()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['All3', 'Built in2', 'Uploaded1'])

    await user.click(screen.getByRole('tab', { name: /Uploaded/ }))
    expect(here()).toBe('/admin/knowledge?source=uploaded')
    await waitFor(() => expect(listQuery(fetch).get('source_type')).toBe('upload'))

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: /Built in/ })).toHaveFocus()
    expect(here()).toBe('/admin/knowledge?source=built-in')
    await waitFor(() => expect(listQuery(fetch).get('source_type')).toBe('folder'))
    await user.keyboard('{Home}')
    expect(here()).toBe('/admin/knowledge')
  })

  it('search waits for typing to pause, and is kept in the address', async () => {
    const { fetch, user } = open('/admin/knowledge?source=uploaded')
    await table()
    const before = callsTo(fetch, 'GET', '/admin/knowledge/documents').length

    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'gift')
    expect(callsTo(fetch, 'GET', '/admin/knowledge/documents')).toHaveLength(before)

    await waitFor(() => expect(listQuery(fetch).get('q')).toBe('gift'))
    expect(callsTo(fetch, 'GET', '/admin/knowledge/documents')).toHaveLength(before + 1)
    expect(here()).toBe('/admin/knowledge?source=uploaded&q=gift')
  })

  it('no results says so, and offers to clear the search', async () => {
    const { user } = open('/admin/knowledge?q=kaftan', { 'GET /admin/knowledge/documents': { status: 200, body: documentsBody([]) } })
    expect(await screen.findByText('No documents match “kaftan”')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(here()).toBe('/admin/knowledge')
  })

  it.each([
    ['/admin/knowledge?source=uploaded', 'No uploaded documents yet'],
    ['/admin/knowledge', 'No documents yet'],
  ])('%s with nothing in it says "%s"', async (path, text) => {
    open(path, { 'GET /admin/knowledge/documents': { status: 200, body: documentsBody([]) } })
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('loading, then an error with Try again', async () => {
    let calls = 0
    const reply = deferred()
    const { user } = open('/admin/knowledge', { 'GET /admin/knowledge/documents': () => (++calls === 1 ? reply.promise : DOCUMENTS) })
    expect(await screen.findByText('Loading documents…')).toHaveAttribute('role', 'status')
    await act(async () => reply.resolve({ status: 500, body: { detail: 'Something went wrong.' } }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load the documents")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await table()).toBeInTheDocument()
  })
})

describe('uploading', () => {
  it('shows the real limits from the API', async () => {
    open()
    const sentence = (await screen.findByText('Drop a file here')).parentElement
    await waitFor(() => expect(sentence).toHaveTextContent('Drop a file here or use Upload document. PDF, DOCX, TXT or MD files, up to 5 MB.'))
  })

  it('the button opens the file picker', async () => {
    const { user } = open()
    await table()
    const click = vi.spyOn(fileInput(), 'click')

    await user.click(screen.getByRole('button', { name: 'Upload document' }))
    expect(click).toHaveBeenCalledOnce()
  })

  it('shows progress, blocks a second upload, then says it was added and refreshes the table', async () => {
    const reply = deferred()
    let listCalls = 0
    const { fetch, user } = open('/admin/knowledge', {
      'POST /admin/knowledge/documents': () => reply.promise,
      'GET /admin/knowledge/documents': () => (++listCalls === 1 ? DOCUMENTS : { status: 200, body: documentsBody([adminDocument({ ...UPLOADED, id: 12, source: 'returns-faq.md' }), ...DOCUMENTS.body.items]) }),
    })
    await table()

    await user.upload(fileInput(), markdown('returns-faq.md'))

    const progress = await screen.findByRole('progressbar', { name: 'Uploading returns-faq.md' })
    expect(progress.closest('[role="status"]')).toHaveTextContent('Uploading and reading returns-faq.md…')
    const button = screen.getByRole('button', { name: 'Uploading…' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await user.upload(fileInput(), markdown('another.md')) // blocked while the first is uploading
    expect(uploads(fetch)).toHaveLength(1)
    expect(uploads(fetch)[0][1].body.get('file').name).toBe('returns-faq.md')

    await act(async () => reply.resolve(ADDED))

    expect(await screen.findByText(/was added/)).toHaveTextContent('returns-faq.md was added. The assistant can use it from now on.')
    expect(screen.getByRole('button', { name: 'Upload document' })).not.toHaveAttribute('aria-disabled', 'true')
    const row = await rowFor('returns-faq.md')
    expect(row).toHaveClass('bg-sa-accent-faint') // the new one stands out
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/was added/)).not.toBeInTheDocument()
  })

  it('drag and drop uploads too', async () => {
    const { fetch } = open('/admin/knowledge', { 'POST /admin/knowledge/documents': ADDED })
    await table()
    const zone = screen.getByText(/Drop a file here/).closest('div')

    fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveClass('border-sa-accent')
    fireEvent.drop(zone, { dataTransfer: { files: [markdown('returns-faq.md')] } })

    expect(await screen.findByText(/was added/)).toBeInTheDocument()
    expect(uploads(fetch)).toHaveLength(1)
    expect(zone).not.toHaveClass('border-sa-accent')
  })

  it.each([
    ['a type it can\'t read', () => new File(['x'], 'photo.png', { type: 'image/png' }), "photo.png wasn't added. The assistant can read PDF, DOCX, TXT or MD files only."],
    ['a file over the size limit', () => new File([new Uint8Array(6 * 1024 * 1024)], 'catalogue.pdf', { type: 'application/pdf' }), "catalogue.pdf wasn't added. It's 6 MB, over the 5 MB limit."],
    ['an empty file', () => new File([], 'empty.md'), "empty.md wasn't added. The file is empty."],
  ])('the browser turns away %s first, without asking the server', async (_, makeFile, message) => {
    const { fetch } = open()
    await table()
    fireEvent.change(fileInput(), { target: { files: [makeFile()] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(uploads(fetch)).toHaveLength(0)
  })

  it('one file at a time', async () => {
    const { fetch } = open()
    await table()
    fireEvent.drop(screen.getByText(/Drop a file here/).closest('div'), { dataTransfer: { files: [markdown('a.md'), markdown('b.md')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload one file at a time.')
    expect(uploads(fetch)).toHaveLength(0)
  })

  it.each([
    [409, 'A document with exactly this content is already in the knowledge base.'],
    [413, 'This file has more than 50 pages. Split it into smaller files.'],
    [415, "This file isn't a real PDF."],
    [422, 'No text could be extracted from this file.'],
    [502, 'The embedding service is unavailable right now, so the document was not added. Nothing was saved; please try again later.'],
  ])("the server's %i message is shown clearly", async (status, detail) => {
    const { user } = open('/admin/knowledge', { 'POST /admin/knowledge/documents': { status, body: { detail } } })
    await table()
    await user.upload(fileInput(), markdown('returns-faq.md'))

    expect(await screen.findByRole('alert')).toHaveTextContent(`returns-faq.md wasn't added. ${detail}`)
    expect(screen.getByRole('button', { name: 'Upload document' })).not.toHaveAttribute('aria-disabled', 'true') // ready to try again
  })

  it('without the limits, says the server still checks, and still uploads', async () => {
    const { fetch, user } = open('/admin/knowledge', {
      'GET /admin/knowledge/limits': { status: 500, body: { detail: 'Something went wrong.' } },
      'POST /admin/knowledge/documents': ADDED,
    })
    expect(await screen.findByText(/the server still checks each file/)).toBeInTheDocument()

    await user.upload(fileInput(), markdown('returns-faq.md'))
    expect(await screen.findByText(/was added/)).toBeInTheDocument()
    expect(uploads(fetch)).toHaveLength(1)
  })

  it("afterwards the overview's document count is up to date", async () => {
    let added = false
    const { user } = open('/admin/knowledge', {
      'POST /admin/knowledge/documents': () => {
        added = true
        return ADDED
      },
      'GET /admin/stats': () => ({ status: 200, body: statsBody({ knowledge: { documents: added ? 10 : 9, last_updated: new Date().toISOString() } }) }),
    })
    await table()
    await user.upload(fileInput(), markdown('returns-faq.md'))
    await screen.findByText(/was added/)

    await user.click(screen.getByRole('link', { name: /Overview/ }))

    const card = await screen.findByRole('link', { name: /Knowledge documents/ })
    expect(card).toHaveTextContent('Knowledge documents10last updated today')
  })
})

describe('the preview', () => {
  it('?document=ID opens the document in its sections', async () => {
    open('/admin/knowledge?document=9')
    const dialog = await screen.findByRole('dialog', { name: 'gift-wrapping.md' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(dialog).toHaveTextContent('Uploadedby abraham@example.com, '))
    expect(dialog).toHaveTextContent('2 sections')
    expect(dialog).toHaveTextContent('1.2 KB')
    const sections = within(dialog).getAllByRole('article')
    expect(sections).toHaveLength(2)
    expect(within(sections[0]).getByRole('heading', { level: 3 })).toHaveTextContent('Section 1 · Gift wrapping > What we offer')
    expect(sections[0]).toHaveTextContent('We wrap any order in adire cloth for ₦2,000.')
    expect(within(sections[1]).getByText(/Add a note at checkout/).textContent).toBe('Add a note at checkout.\nWe confirm by email.')
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('opening from a row moves focus in, keeps Tab inside, and Escape closes it back to the row', async () => {
    const { user } = open()
    const link = await screen.findByRole('link', { name: 'Preview gift-wrapping.md' })
    await user.click(link)

    const dialog = await screen.findByRole('dialog', { name: 'gift-wrapping.md' })
    const close = within(dialog).getByRole('button', { name: 'Close preview' })
    expect(close).toHaveFocus()
    expect(here()).toBe('/admin/knowledge?document=9')

    await screen.findAllByRole('article')
    await user.tab() // Delete, the last control
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveFocus()
    await user.tab() // round to the first again
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(here()).toBe('/admin/knowledge')
    expect(link).toHaveFocus()
  })

  it('the close button closes it too', async () => {
    const { user } = open('/admin/knowledge?source=uploaded&document=9')
    await user.click(await screen.findByRole('button', { name: 'Close preview' }))
    expect(here()).toBe('/admin/knowledge?source=uploaded')
  })

  it('a built in document has no Delete, and says why', async () => {
    open('/admin/knowledge?document=2')
    const dialog = await screen.findByRole('dialog', { name: 'products-and-fabrics.md' })
    await within(dialog).findAllByRole('article')

    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(dialog).toHaveTextContent("Built in documents come from the store's setup and are changed by your developer.")
  })

  it('an unknown or deleted document says so', async () => {
    open('/admin/knowledge?document=99', { 'GET /admin/knowledge/documents/99': { status: 404, body: { detail: 'Document not found' } } })
    const dialog = await screen.findByRole('dialog', { name: 'Document not found' })
    expect(dialog).toHaveTextContent('It may have been deleted.')
  })

  it('loading, then an error with Try again', async () => {
    let calls = 0
    const reply = deferred()
    const { user } = open('/admin/knowledge?document=9', { 'GET /admin/knowledge/documents/9': () => (++calls === 1 ? reply.promise : DOCUMENT_9) })
    expect(await screen.findByText('Loading the document…')).toHaveAttribute('role', 'status')
    await act(async () => reply.resolve({ status: 500, body: { detail: 'Something went wrong.' } }))

    const dialog = await screen.findByRole('dialog', { name: "We couldn't load this document" })
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('dialog', { name: 'gift-wrapping.md' })).toBeInTheDocument()
  })

  it('document text is plain text: <script> and <img onerror> show as text', async () => {
    const script = '<script>window.hacked = true</script>'
    const img = '<img src=x onerror="window.hacked = true">'
    open('/admin/knowledge?document=9', {
      'GET /admin/knowledge/documents/9': {
        status: 200,
        body: documentDetail({
          source: `${img}.md`,
          sections: [{ chunk_index: 0, content: `${script} > ${img}\n\n${script} and ${img}` }],
        }),
      },
    })
    const dialog = await screen.findByRole('dialog', { name: `${img}.md` })

    expect(within(dialog).getByText(`${script} and ${img}`)).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(`Section 1 · ${script} > ${img}`)
    expect(document.querySelector('[role="dialog"] script, [role="dialog"] img')).toBeNull()
    expect(window.hacked).toBeUndefined()
  })

  it('splits a section into its heading and text', () => {
    expect(splitSection('Sizing > UK sizes\n\nWe use UK sizes.')).toEqual({ heading: 'Sizing > UK sizes', text: 'We use UK sizes.' })
    expect(splitSection('Just some text')).toEqual({ heading: null, text: 'Just some text' })
  })
})

describe('deleting', () => {
  it('asks first, in a dialog that keeps focus and cancels with Escape, back to the button', async () => {
    const { fetch, user } = open()
    const button = await screen.findByRole('button', { name: 'Delete gift-wrapping.md' })
    await user.click(button)

    const dialog = screen.getByRole('alertdialog', { name: 'Delete gift-wrapping.md?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/The assistant stops using it straight away.*This can't be undone./)
    const keep = within(dialog).getByRole('button', { name: 'Keep document' })
    expect(keep).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Delete document' })).toHaveFocus()
    await user.tab()
    expect(keep).toHaveFocus() // Tab stays inside

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(callsTo(fetch, 'DELETE', '/admin/knowledge/documents/9')).toHaveLength(0)

    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Keep document' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('once confirmed: pending, then the table updates and focus goes to the page heading', async () => {
    const reply = deferred()
    let deleted = false
    const { fetch, user } = open('/admin/knowledge', {
      'DELETE /admin/knowledge/documents/9': async () => {
        const r = await reply.promise
        deleted = true
        return r
      },
      'GET /admin/knowledge/documents': () => ({ status: 200, body: documentsBody(DOCUMENTS.body.items.filter((d) => !deleted || d.id !== 9)) }),
    })
    await user.click(await screen.findByRole('button', { name: 'Delete gift-wrapping.md' }))
    const confirm = screen.getByRole('button', { name: 'Delete document' })
    await user.click(confirm)

    expect(confirm).toHaveTextContent('Deleting…')
    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    await user.click(confirm)
    expect(callsTo(fetch, 'DELETE', '/admin/knowledge/documents/9')).toHaveLength(1)
    await user.keyboard('{Escape}') // can't cancel half way
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => reply.resolve({ status: 204, body: null }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByText(/was deleted/)).toHaveTextContent('gift-wrapping.md was deleted. The assistant no longer uses it.')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'gift-wrapping.md' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Knowledge' })).toHaveFocus())
  })

  it('from the preview: closes the preview afterwards', async () => {
    const { user } = open('/admin/knowledge?document=9', { 'DELETE /admin/knowledge/documents/9': { status: 204, body: null } })
    const dialog = await screen.findByRole('dialog', { name: 'gift-wrapping.md' })
    const remove = await within(dialog).findByRole('button', { name: 'Delete' })
    await user.click(remove)
    await user.keyboard('{Escape}') // cancel goes back to the preview's Delete
    expect(remove).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(remove)
    await user.click(screen.getByRole('button', { name: 'Delete document' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(here()).toBe('/admin/knowledge')
    expect(await screen.findByText(/was deleted/)).toBeInTheDocument()
  })

  it.each([
    [409, "This document comes from the knowledge folder. Remove or change the file in knowledge/ instead; it can't be deleted here."],
    [500, 'Something went wrong.'],
  ])('a %i says why, and keeps the dialog open', async (status, detail) => {
    const { user } = open('/admin/knowledge', { 'DELETE /admin/knowledge/documents/9': { status, body: { detail } } })
    await user.click(await screen.findByRole('button', { name: 'Delete gift-wrapping.md' }))
    await user.click(screen.getByRole('button', { name: 'Delete document' }))

    const dialog = screen.getByRole('alertdialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(detail)
    expect(within(dialog).getByRole('button', { name: 'Delete document' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: 'gift-wrapping.md' })).toBeInTheDocument()
  })
})

describe('on a phone', () => {
  beforeEach(() => setMobile(true))

  it('the table scrolls inside its own box, which the keyboard can reach', async () => {
    open()
    const box = await screen.findByRole('region', { name: 'Documents table' })
    // relative: the table's hidden labels are absolutely positioned, and must
    // be contained by the box, or they widen the page on a phone
    expect(box).toHaveClass('overflow-x-auto', 'relative')
    expect(box).toHaveAttribute('tabindex', '0')
    expect(within(box).getByRole('table')).toHaveClass('min-w-sa-table-min')
  })

  it('no drop zone; the limits show under a full width Upload button', async () => {
    open()
    expect(await screen.findByText('PDF, DOCX, TXT or MD files, up to 5 MB.')).toBeInTheDocument()
    expect(screen.queryByText(/Drop a file here/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload document' })).toHaveClass('h-sa-touch', 'w-full')
  })

  it('the preview is a full screen panel', async () => {
    open('/admin/knowledge?document=9')
    const dialog = await screen.findByRole('dialog', { name: 'gift-wrapping.md' })
    expect(dialog).toHaveClass('inset-0')
    expect(dialog).not.toHaveClass('w-sa-preview')
    expect(within(dialog).getByRole('button', { name: 'Close preview' })).toHaveClass('h-sa-touch')
  })
})
