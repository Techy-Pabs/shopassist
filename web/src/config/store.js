// Everything specific to the store lives here, so the widget can serve a
// different store by changing this file (and the API's knowledge base).
export const store = {
  name: 'Loom & Lane',
  monogram: 'L&L',
  supportEmail: 'support@loomandlane.example',
  // A placeholder number: shown as text only. Set whatsappUrl (for example
  // "https://wa.me/234...") once a real number exists to make it a link.
  whatsappNumber: '+234 800 000 0000',
  whatsappUrl: null,
  supportHours: 'Monday to Saturday, 9am to 6pm',
}

// Placeholder storefront content, as in the mockups (no real product data)
export const storefront = {
  nav: ['New in', 'Women', 'Men', 'Accessories', 'Pickup in Lekki'],
  bagLabel: 'Bag (2)',
  eyebrow: 'New season',
  heroTitle: 'Linen for long Lagos afternoons',
  heroText:
    'Breathable pieces in cotton and linen. Delivered within Lagos in 1 to 2 business days, or ready for free pickup in Lekki Phase 1.',
  primaryAction: 'Shop new in',
  secondaryAction: 'Delivery and returns',
  sectionTitle: 'Just arrived',
  products: [
    { name: 'Adire wrap dress', tint: 'indigo' },
    { name: 'Linen camp shirt', tint: 'sand' },
    { name: 'Woven tote', tint: 'indigo' },
  ],
}

export const launcher = {
  label: 'Ask Loom & Lane',
  invitation: 'Questions about delivery or sizing? Ask us here.',
}
