import { footer } from '../../config/home.js'
import { store } from '../../config/store.js'

// The footer: on phones the store name and contact details span both
// columns, with Shop and Help side by side; on desktop, four columns.
const heading = 'text-eyebrow-sm uppercase text-sand sm:text-eyebrow'
const link = 'text-surface-100 no-underline hover:text-sand'

function LinkList({ label, items }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5 text-body-small sm:gap-2.5">
      <span className={`${heading} pb-1.5 sm:pb-0`}>{label}</span>
      {items.map((item) => (
        <a key={item.section} href={`#${item.section}`} className={`${link} py-2.5 sm:py-0`}>
          {item.mobileLabel ? (
            <>
              <span className="sm:hidden">{item.mobileLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </>
          ) : (
            item.label
          )}
        </a>
      ))}
    </nav>
  )
}

export default function SiteFooter() {
  return (
    <footer className="mt-14 bg-ink text-surface-100 sm:mt-24">
      <div className="mx-auto box-content grid max-w-page grid-cols-2 gap-x-6 gap-y-7 px-4 pt-10 sm:grid-cols-fit-footer sm:gap-10 sm:px-12 sm:pb-8 sm:pt-16">
        <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:gap-3">
          <span className="font-serif text-brand-md sm:text-brand">{store.name}</span>
          <span className="text-body-small-relaxed text-sand">{footer.tagline}</span>
        </div>
        <LinkList label="Shop" items={footer.shop} />
        <LinkList label="Help" items={footer.help} />
        <div className="col-span-2 flex flex-col gap-1.5 text-body-small-relaxed sm:col-span-1 sm:gap-2.5">
          <span className={`${heading} pb-1 sm:pb-0`}>Contact</span>
          <a href={`mailto:${store.supportEmail}`} className="text-surface-100 hover:text-sand">
            {store.supportEmail}
          </a>
          <span>WhatsApp {store.whatsappNumber}</span>
          <span className="text-sand">{footer.pickup}</span>
        </div>
      </div>
      <div className="mx-4 mt-7 flex flex-col gap-2.5 border-t border-dashed border-ink-muted pb-28 pt-5 text-label-relaxed text-sand sm:mx-auto sm:mt-0 sm:box-content sm:max-w-page sm:flex-row sm:flex-wrap sm:justify-between sm:gap-3 sm:px-12 sm:pb-8 sm:text-label sm:font-normal">
        <div className="flex flex-col gap-1">
          <span>{footer.demo}</span>
          <span>{footer.credit}</span>
        </div>
        <a href={footer.github.href} className="self-start text-surface-100 hover:text-sand">
          {footer.github.label}
        </a>
      </div>
    </footer>
  )
}
