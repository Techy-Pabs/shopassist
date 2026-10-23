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

export const launcher = {
  label: 'Ask Loom & Lane',
  invitation: 'Questions about delivery or sizing? Ask us here.',
}
