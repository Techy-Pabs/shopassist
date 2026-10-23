// A homepage photo in a frame patterned like the mockup's placeholder, so
// the cloth pattern shows while the photo loads. The browser picks the 640
// or 1280 wide file from `sizes` (how wide the photo shows on screen).
// Photos on the first screen load at once; the rest only when scrolled near.
export default function Photo({ photo, pattern, sizes, firstScreen = false, className = '', imageClassName = '', children }) {
  const src = (width) => `/images/${photo.file}-${width}.webp`
  return (
    <div className={`overflow-hidden ${pattern} ${className}`}>
      <img
        src={src(640)}
        srcSet={`${src(640)} 640w, ${src(1280)} 1280w`}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        loading={firstScreen ? 'eager' : 'lazy'}
        fetchPriority={firstScreen ? 'high' : undefined}
        decoding="async"
        className={`block h-full w-full object-cover ${imageClassName}`}
      />
      {children}
    </div>
  )
}
