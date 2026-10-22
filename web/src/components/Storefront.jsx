import { storefront, store } from '../config/store.js'
import StitchedRule from './StitchedRule.jsx'

// Product photo placeholders alternate between two token colours
const tintClass = { indigo: 'bg-indigo-tint', sand: 'bg-sand' }

export default function Storefront() {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-sand px-4 py-5 sm:px-12">
        <a href="#" className="font-serif text-brand text-ink no-underline">
          {store.name}
        </a>
        <nav aria-label="Main" className="flex flex-wrap gap-x-7 gap-y-2 text-body-small font-medium">
          {storefront.nav.map((item) => (
            <a key={item} href="#" className="text-ink no-underline">
              {item}
            </a>
          ))}
        </nav>
        <a href="#" className="text-body-small font-semibold text-ink no-underline">
          {storefront.bagLabel}
        </a>
      </header>

      {/* box-content: the page width is the content's, padding outside it, as in the mockups */}
      <main className="mx-auto box-content max-w-page px-4 pb-16 pt-12 sm:px-12">
        <section className="flex flex-wrap items-center gap-12">
          <div className="flex min-w-0 shrink grow basis-hero-copy-basis flex-col gap-5">
            <p className="m-0 text-eyebrow uppercase text-ink-muted">{storefront.eyebrow}</p>
            <h1 className="m-0 font-serif text-heading-welcome sm:text-display-hero">{storefront.heroTitle}</h1>
            <p className="m-0 max-w-hero-text text-body-lead text-ink-muted">{storefront.heroText}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#"
                className="inline-flex h-control-lg items-center rounded-sm bg-indigo px-6 text-body font-semibold text-surface-100 no-underline hover:text-surface-100"
              >
                {storefront.primaryAction}
              </a>
              <a
                href="#"
                className="inline-flex h-control-lg items-center rounded-sm border border-line-strong px-6 text-body font-semibold text-ink no-underline"
              >
                {storefront.secondaryAction}
              </a>
            </div>
          </div>
          <div
            role="img"
            aria-label="Product photograph placeholder"
            className="adire box-border flex h-hero-media shrink grow basis-hero-media-basis items-end rounded-sm p-4"
          >
            <span className="rounded-sm bg-surface-100 px-2 py-1 text-caption text-ink">[Hero photograph]</span>
          </div>
        </section>

        <div className="mb-6 mt-12 flex items-center gap-4">
          <h2 className="m-0 font-serif text-heading">{storefront.sectionTitle}</h2>
          <StitchedRule />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {storefront.products.map((product) => (
            <a key={product.name} href="#" className="flex flex-col gap-2 text-ink no-underline">
              <div
                className={`flex h-product-image items-center justify-center rounded-sm text-caption font-normal text-ink-muted ${tintClass[product.tint]}`}
              >
                [Product photo]
              </div>
              <span className="text-body font-semibold">{product.name}</span>
              <span className="text-body-small text-ink-muted">[PRICE]</span>
            </a>
          ))}
        </div>
      </main>
    </>
  )
}
