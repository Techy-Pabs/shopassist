// The homepage's words, products and photos. Store facts (delivery, pickup,
// payment, sizes, returns) must match the assistant's knowledge base, so the
// page and the chat never disagree. Products and prices are illustrative.

// Photos live in public/images as WebP, 640 and 1280 wide (see CREDITS.md).
// width and height are the 1280 version's, so the browser knows the shape.
const photo = (file, height, alt) => ({ file, width: 1280, height, alt })

export const photos = {
  hero: photo('hero-kaftan', 1600, 'A man in a black kaftan and matching cap, both edged with gold embroidery, wearing dark glasses'),
  heroInset: photo('hero-linen', 1536, 'Undyed linen cloth, close up'),
  women: photo('collection-women', 1067, 'A woman with long braids in a mustard top, holding an open paper fan'),
  men: photo('collection-men', 1067, 'A man in a blue kaftan with blue embroidery down the front'),
  accessories: photo('collection-accessories', 1067, 'Two woven raffia bags hanging by their handles'),
  laceDress: photo('product-lace-dress', 1600, 'A smiling woman in a green dress with white lace panels and pink trim, and a red velvet head wrap'),
  whiteKaftan: photo('product-white-kaftan', 1600, 'A man in glasses wearing a long sleeved white kaftan with pleated stitching across the chest'),
  stripeShirt: photo('product-stripe-shirt', 1600, 'A man in an open brown, cream and orange striped shirt over a white vest'),
  marketTote: photo('product-market-tote', 1600, 'Two woven raffia bucket bags in cream, flecked with indigo and purple'),
}

// Each section's id, for the menu and footer links
export const sections = {
  newIn: 'new-in',
  collections: 'collections',
  women: 'women',
  men: 'men',
  accessories: 'accessories',
  fabrics: 'fabrics',
  care: 'fabric-care',
  help: 'help',
  delivery: 'delivery',
  sizing: 'sizing',
  returns: 'returns',
}

export const menu = [
  { label: 'New in', section: sections.newIn },
  { label: 'Women', section: sections.women },
  { label: 'Men', section: sections.men },
  { label: 'Accessories', section: sections.accessories },
  { label: 'Our fabrics', section: sections.fabrics },
  { label: 'Help', section: sections.help },
]

// The strip at the very top: this is a demo, and the assistant is the point
export const demo = {
  lead: 'Portfolio demo.',
  text: "Loom & Lane is a fictional store built to show ShopAssist, an AI customer support assistant. Its knowledge base is limited to this demo store's delivery, returns, sizing and product details.",
  action: 'Try the assistant',
}

// The bar above the header. `short` is the wording on mobile; items
// without one are left out there.
export const announcements = [
  { text: 'Lagos delivery in 1 to 2 business days', short: 'Lagos delivery in 1 to 2 business days' },
  { text: 'Free pickup in Lekki Phase 1', short: 'Free pickup in Lekki' },
  { text: 'Pay on delivery in Lagos' },
  { text: 'Free delivery over ₦100,000', short: 'Free delivery over ₦100,000' },
]

export const hero = {
  eyebrow: 'The dry season edit',
  title: 'Cloth made for Lagos days',
  text: 'Breathable cotton and linen, hand dyed adire and woven stripes, cut for heat and made to be worn often.',
  primary: { label: 'Shop new in', section: sections.newIn },
  secondary: { label: 'Explore our fabrics', section: sections.fabrics },
  // The outfit in the main photo
  inPicture: { label: 'In the picture', name: 'Gold stitch black kaftan', price: '₦54,000' },
}

export const services = [
  { icon: 'van', title: 'Lagos in 1 to 2 days', text: 'Business days, to your door.' },
  { icon: 'globe', title: 'Across Nigeria', text: 'Other states in 3 to 5 business days.' },
  { icon: 'pin', title: 'Free pickup', text: 'From our Lekki Phase 1 point, ready within 24 hours.' },
  { icon: 'cash', title: 'Pay on delivery', text: 'In Lagos, for orders under ₦150,000.' },
]

export const collections = [
  { id: sections.women, name: 'Women', text: 'Wrap dresses, kaftans, wide trousers', photo: photos.women, pattern: 'adire' },
  { id: sections.men, name: 'Men', text: 'Camp shirts, kaftans, drawstring trousers', photo: photos.men, pattern: 'pinstripe' },
  { id: sections.accessories, name: 'Accessories', text: 'Woven totes, head wraps, scarves', photo: photos.accessories, pattern: 'weave' },
]

export const products = [
  { name: 'Green lace panel dress', material: 'Cotton with lace trim', price: '₦48,500', isNew: true, photo: photos.laceDress, pattern: 'adire-lg' },
  { name: 'White pleat kaftan', material: 'Cotton with pleated stitching', price: '₦52,000', isNew: true, photo: photos.whiteKaftan, pattern: 'pinstripe' },
  { name: 'Brown stripe shirt', material: 'Woven cotton stripe', price: '₦34,000', photo: photos.stripeShirt, pattern: 'aso' },
  { name: 'Woven market tote', material: 'Hand woven raffia', price: '₦18,500', photo: photos.marketTote, pattern: 'weave' },
]

export const fabrics = {
  eyebrow: 'Our fabrics',
  title: 'Cloth with a story in every fold',
  text: 'Our adire is tied and dyed in indigo by hand, so the pattern shifts a little from piece to piece. Our linen is washed before it is cut, so it is soft from the first wear.',
  careTitle: 'Caring for your pieces',
  care: [
    { title: 'Wash cold, inside out', text: 'Keeps indigo deep and stripes crisp.' },
    { title: 'Dry in the shade', text: 'Strong sun fades hand dyed cloth.' },
    { title: 'Iron while slightly damp', text: 'Linen relaxes faster and creases less.' },
  ],
}

export const help = {
  sizing: {
    title: 'Between sizes?',
    text: 'We use UK sizes, and our dresses run slim. If you are between two sizes, go one size up.',
  },
  returns: {
    title: 'Returns and exchanges',
    text: 'Full price pieces can be returned within 14 days. Sale pieces can be exchanged for another size, and exchanges are free within Lagos.',
  },
  question: {
    title: 'Still have a question?',
    text: 'Our assistant answers questions about delivery, sizing and returns, any time of day.',
  },
}

export const footer = {
  tagline: 'Cotton, linen and adire, made for Lagos weather.',
  shop: [
    { label: 'New in', section: sections.newIn },
    { label: 'Women', section: sections.women },
    { label: 'Men', section: sections.men },
    { label: 'Accessories', section: sections.accessories },
  ],
  help: [
    { label: 'Delivery', section: sections.delivery },
    { label: 'Returns and exchanges', mobileLabel: 'Returns', section: sections.returns },
    { label: 'Size guide', section: sections.sizing },
    { label: 'Fabric care', section: sections.care },
  ],
  pickup: 'Pickup point: Lekki Phase 1, Lagos',
  demo: 'Loom & Lane is a demo store for the ShopAssist portfolio project. Products and prices are illustrative.',
  github: { label: 'View the project on GitHub', href: 'https://github.com/Techy-Pabs/shopassist' },
  credit:
    'Photos from Unsplash by igwe francis, Shedrack Salami, Boubacar Mohamed Touré, Irewolede, Steward Masweneng, Anzor alem (Empire tbb on Unsplash) and Annie Spratt.',
}
