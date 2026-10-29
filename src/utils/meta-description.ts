const MAX_DESCRIPTION_LENGTH = 155

// Metadata only: never shorten the visible article summary or source copy.
export function metaDescription(value?: string | null): string {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/gu, ' ').trim()
  const characters = Array.from(text)
  if (characters.length <= MAX_DESCRIPTION_LENGTH) return text

  const prefix = characters.slice(0, MAX_DESCRIPTION_LENGTH).join('')
  // Older browsers must still render the page without a Segmenter polyfill.
  if (typeof Intl.Segmenter !== 'function') {
    if (characters[MAX_DESCRIPTION_LENGTH] === ' ') return prefix.trimEnd()
    const boundary = prefix.lastIndexOf(' ')
    return boundary > 0 ? prefix.slice(0, boundary) : prefix
  }

  let result = ''
  let length = 0
  // An explicit locale keeps server/client segmentation consistent. Unicode
  // word boundaries also handle text that does not separate words with spaces.
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'word' }).segment(text)) {
    const size = Array.from(segment).length
    if (length + size > MAX_DESCRIPTION_LENGTH) break
    result += segment
    length += size
  }
  // An overlong unbroken token has no usable word boundary within the limit.
  return result.trimEnd() || prefix
}
