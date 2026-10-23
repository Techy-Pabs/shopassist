import { useEffect, useRef } from 'react'

import { collections, fabrics, help, hero, photos, products, sections, services } from '../../config/home.js'
import { DESKTOP_QUERY } from '../../design.js'
import { ChatIcon, ServiceIcon } from '../Icons.jsx'
import StitchedRule from '../StitchedRule.jsx'
import Photo from './Photo.jsx'
import SiteFooter from './SiteFooter.jsx'
import SiteHeader from './SiteHeader.jsx'

// The Loom & Lane homepage, from the Home-Desktop and Home-Mobile mockups.
// Mobile first: the classes without a prefix are the phone layout, `sm:`
// the desktop one. Products and collections aren't links: there is no shop
// behind the page.

// The page's content width: the page token, with the padding outside it
const page = 'mx-auto box-content max-w-page px-4 sm:px-12'

const button =
  'inline-flex h-control-xl items-center justify-center rounded-sm px-7 text-body font-semibold no-underline'

function SectionHeading({ id, children }) {
  return (
    <div className="mb-5 flex items-center gap-3 sm:mb-7 sm:gap-4">
      <h2 id={id} className="m-0 font-serif text-heading sm:text-heading-section">
        {children}
      </h2>
      <StitchedRule tone="strong" />
    </div>
  )
}

// Tells the page when the visitor has scrolled past the hero (and back)
function useScrolledPast(ref, onChange) {
  useEffect(() => {
    if (!onChange) return undefined
    if (typeof IntersectionObserver !== 'function') {
      onChange(true) // can't tell, so don't hold anything back
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => onChange(!entry.isIntersecting && entry.boundingClientRect.top < 0))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref, onChange])
}

function Hero({ onPastHero }) {
  const ref = useRef(null)
  useScrolledPast(ref, onPastHero)
  return (
    <section ref={ref} className="mx-auto box-content flex max-w-page flex-col gap-5 px-4 pb-10 pt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-14 sm:px-12 sm:pb-18 sm:pt-16">
      <div className="flex min-w-0 flex-col gap-5 sm:shrink sm:grow sm:basis-home-copy-basis sm:gap-6">
        <p className="m-0 mt-2 text-eyebrow-sm uppercase text-clay sm:mt-0 sm:text-eyebrow">{hero.eyebrow}</p>
        <h1 className="m-0 font-serif text-display-home-sm sm:text-display-home">{hero.title}</h1>
        <p className="m-0 text-body-lead-sm text-ink-muted sm:max-w-home-text sm:text-body-lead-lg">{hero.text}</p>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
          <a href={`#${hero.primary.section}`} className={`${button} bg-indigo text-surface-100 hover:text-surface-100`}>
            {hero.primary.label}
          </a>
          <a href={`#${hero.secondary.section}`} className={`${button} border border-line-strong text-ink`}>
            {hero.secondary.label}
          </a>
        </div>
      </div>

      {/* On phones the photos come first, above the heading */}
      <div className="relative order-first h-home-hero-height-sm min-w-0 sm:order-none sm:h-home-hero-height sm:shrink sm:grow sm:basis-home-media-basis">
        <Photo
          photo={photos.hero}
          pattern="adire-lg"
          sizes={`${DESKTOP_QUERY} 34vw, 82vw`}
          firstScreen
          className="absolute right-0 top-0 h-home-hero-photo-height-sm w-home-hero-photo-width-sm rounded-sm sm:h-home-hero-photo-height sm:w-home-hero-photo-width"
          imageClassName="object-top"
        />
        <Photo
          photo={photos.heroInset}
          pattern="aso"
          sizes={`${DESKTOP_QUERY} 20vw, 46vw`}
          firstScreen
          className="absolute bottom-0 left-0 box-content h-home-hero-inset-height-sm w-home-hero-inset-width-sm rounded-sm border-frame-sm border-surface-100 sm:h-home-hero-inset-height sm:w-home-hero-inset-width sm:border-frame"
        />
        <p className="absolute bottom-6 right-6 m-0 hidden flex-col gap-0.5 rounded-lg rounded-br-sm border border-sand bg-surface-raised px-4.5 py-3.5 text-ink sm:flex">
          <span className="text-caption font-semibold text-ink-muted">{hero.inPicture.label}</span>
          <span className="font-serif text-title-chat">{hero.inPicture.name}</span>
          <span className="text-body-small">{hero.inPicture.price}</span>
        </p>
      </div>
    </section>
  )
}

function Services() {
  return (
    <section id={sections.delivery} aria-label="Delivery and payment" className="border-y border-dashed border-line-strong bg-surface-raised">
      <ul className={`${page} m-0 grid list-none grid-cols-2 gap-x-4 py-2 sm:mx-auto sm:grid-cols-fit-service sm:gap-6 sm:py-7`}>
        {services.map((service, index) => (
          <li
            key={service.title}
            className={`flex flex-col gap-1.5 py-4 sm:flex-row sm:items-start sm:gap-3.5 sm:border-t-0 sm:py-0 ${
              index >= 2 ? 'border-t border-dashed border-sand' : ''
            }`}
          >
            <ServiceIcon name={service.icon} />
            <span className="flex flex-col gap-1.5 sm:gap-0.5">
              <span className="text-body-small font-semibold sm:text-body">{service.title}</span>
              <span className="text-label font-normal text-ink-muted sm:text-body-small">{service.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Collections() {
  return (
    <section id={sections.collections} aria-labelledby="collections-heading" className={`${page} pt-12 sm:pt-20`}>
      <SectionHeading id="collections-heading">Shop by collection</SectionHeading>
      <ul className="m-0 flex list-none flex-col gap-4 p-0 sm:grid sm:grid-cols-fit-collection sm:gap-6">
        {collections.map((collection) => (
          <li
            key={collection.id}
            id={collection.id}
            className="flex overflow-hidden rounded-sm border border-sand bg-surface-raised sm:flex-col"
          >
            <Photo
              photo={collection.photo}
              pattern={collection.pattern}
              sizes={`${DESKTOP_QUERY} 31vw, 29vw`}
              className="w-collection-image-sm shrink-0 sm:h-collection-image sm:w-auto"
            />
            <div className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-4.5 sm:px-5">
              <h3 className="m-0 font-serif text-title sm:text-title-lg">{collection.name}</h3>
              <p className="m-0 text-label font-normal text-ink-muted sm:text-body-small">{collection.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function JustArrived() {
  return (
    <section id={sections.newIn} aria-labelledby="new-in-heading" className={`${page} pt-12 sm:pt-20`}>
      <SectionHeading id="new-in-heading">Just arrived</SectionHeading>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-6 p-0 sm:grid-cols-fit-product sm:gap-x-6 sm:gap-y-7">
        {products.map((product) => (
          <li key={product.name} className="flex flex-col gap-2 sm:gap-2.5">
            <Photo
              photo={product.photo}
              pattern={product.pattern}
              sizes={`${DESKTOP_QUERY} 22vw, 46vw`}
              className="relative h-product-image-md rounded-sm sm:h-product-image-lg"
            >
              {product.isNew && (
                <span className="absolute left-2 top-2 rounded-sm bg-surface-100 px-1.5 py-0.75 text-badge-sm text-ink sm:left-3 sm:top-3 sm:px-2 sm:py-1 sm:text-caption sm:font-semibold">
                  New
                </span>
              )}
            </Photo>
            <div className="flex flex-col gap-2 sm:gap-0.5">
              <h3 className="m-0 text-body-small font-semibold sm:text-body">{product.name}</h3>
              <p className="m-0 hidden text-label font-normal text-ink-muted sm:block">{product.material}</p>
              <p className="m-0 text-body-small sm:mt-1 sm:text-body">{product.price}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Fabrics() {
  return (
    <section id={sections.fabrics} aria-labelledby="fabrics-heading" className="mt-14 bg-indigo text-surface-100 sm:mt-24">
      <div aria-hidden="true" className="adire h-adire-tile" />
      <div className="mx-auto box-content flex max-w-page flex-col gap-4.5 px-4 py-12 sm:flex-row sm:flex-wrap sm:items-start sm:gap-14 sm:px-12 sm:py-18">
        <div className="flex min-w-0 flex-col gap-4.5 sm:shrink sm:grow sm:basis-fabrics-basis sm:gap-5">
          <p className="m-0 text-eyebrow-sm uppercase text-indigo-tint sm:text-eyebrow">{fabrics.eyebrow}</p>
          <h2 id="fabrics-heading" className="m-0 font-serif text-heading-feature-sm sm:text-heading-feature">
            {fabrics.title}
          </h2>
          <p className="m-0 text-body-lead-sm text-indigo-tint sm:max-w-home-text sm:text-body-feature">{fabrics.text}</p>
        </div>
        <div id={sections.care} className="flex min-w-0 flex-col sm:shrink sm:grow sm:basis-fabrics-basis">
          <h3 className="m-0 mb-4.5 mt-4 text-eyebrow-sm uppercase text-indigo-tint sm:mb-2 sm:mt-0 sm:text-eyebrow">
            {fabrics.careTitle}
          </h3>
          <ol className="m-0 list-none p-0">
            {fabrics.care.map((step, index) => (
              <li
                key={step.title}
                className={`flex gap-3.5 border-t border-dashed border-indigo-tint py-4 sm:gap-4 sm:py-4.5 ${
                  index === fabrics.care.length - 1 ? 'border-b' : ''
                }`}
              >
                <span aria-hidden="true" className="w-7 shrink-0 font-serif text-title sm:w-8 sm:text-title-lg">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-body font-semibold sm:text-body-lg sm:font-semibold">{step.title}</span>
                  <span className="text-body-small text-indigo-tint">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div aria-hidden="true" className="adire h-adire-tile" />
    </section>
  )
}

const card = 'flex flex-col gap-3 rounded-sm border border-sand bg-surface-raised p-6 sm:gap-4 sm:p-8'
const cardTitle = 'm-0 font-serif text-heading-card-sm sm:text-heading'
const cardText = 'm-0 text-body-card-sm text-ink-muted sm:text-body-card'

function Help({ onAsk }) {
  return (
    <section id={sections.help} aria-label="Help" className={`${page} grid gap-4 pt-12 sm:grid-cols-fit-card sm:gap-6 sm:pt-22`}>
      <div id={sections.sizing} className={card}>
        <h2 className={cardTitle}>{help.sizing.title}</h2>
        <p className={cardText}>{help.sizing.text}</p>
      </div>
      <div id={sections.returns} className={card}>
        <h2 className={cardTitle}>{help.returns.title}</h2>
        <p className={cardText}>{help.returns.text}</p>
      </div>
      <div className="check rounded-sm border border-sand p-5 sm:p-8">
        <div className="flex flex-col gap-3 rounded-sm bg-surface-raised p-5 sm:gap-4 sm:p-6">
          <h2 className={cardTitle}>{help.question.title}</h2>
          <p className={cardText}>{help.question.text}</p>
          <button
            type="button"
            onClick={onAsk}
            aria-haspopup="dialog"
            className="flex h-control-lg cursor-pointer items-center justify-center gap-2.5 rounded-sm border-0 bg-indigo px-5 font-sans text-body font-semibold text-surface-100 sm:self-start"
          >
            <ChatIcon />
            Ask Loom &amp; Lane
          </button>
        </div>
      </div>
    </section>
  )
}

// onAsk opens the chat; onPastHero(true or false) follows the scroll
export default function HomePage({ onAsk, onPastHero }) {
  return (
    <>
      <SiteHeader onAsk={onAsk} />
      <main>
        <Hero onPastHero={onPastHero} />
        <Services />
        <Collections />
        <JustArrived />
        <Fabrics />
        <Help onAsk={onAsk} />
      </main>
      <SiteFooter />
    </>
  )
}
