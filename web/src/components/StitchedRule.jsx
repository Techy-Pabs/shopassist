// The stitched rule: a dashed line, decorative only. Sand in the chat; the
// homepage's section headings use the stronger line colour.
const tones = { sand: 'border-sand', strong: 'border-line-strong' }

export default function StitchedRule({ tone = 'sand' }) {
  return <span aria-hidden="true" className={`flex-1 border-t border-dashed ${tones[tone]}`} />
}
