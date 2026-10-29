import fs from 'node:fs'
import path from 'node:path'
import imageSize from 'image-size'

export type KBImageDimensions = Record<string, { width: number; height: number; type: string }>

const headerLimit = 512 * 1024
const inside = (directory: string, filename: string) => filename.startsWith(`${directory}${path.sep}`)

// Images are discovered from the article's local directory, not by matching
// Markdown text. Inline/reference images and sanitized raw HTML share this map.
// Unsupported, missing and external images retain the existing client fallback.
export function getKBImageDimensions(articleId: string, coverImage?: string | null): KBImageDimensions {
  const dimensions: KBImageDimensions = {}
  if (
    typeof articleId !== 'string' ||
    !articleId ||
    articleId === '.' ||
    articleId === '..' ||
    /[/\\\0]/.test(articleId)
  ) {
    return dimensions
  }
  const publicRoot = path.resolve(process.cwd(), 'public')
  const contentRoot = path.join(publicRoot, 'education_hub_articles')
  const directory = path.join(contentRoot, articleId)
  try {
    if ([publicRoot, contentRoot, directory].some(folder => fs.lstatSync(folder).isSymbolicLink())) return dimensions
    const realPublic = fs.realpathSync(publicRoot)
    const realContent = fs.realpathSync(contentRoot)
    const realDirectory = fs.realpathSync(directory)
    if (!inside(realPublic, realContent) || !inside(realContent, realDirectory)) return dimensions

    const walk = (folder: string) => {
      let entries: fs.Dirent[]
      try {
        if (fs.lstatSync(folder).isSymbolicLink()) return
        const realFolder = fs.realpathSync(folder)
        if (realFolder !== realDirectory && !inside(realDirectory, realFolder)) return
        entries = fs.readdirSync(folder, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const filename = path.join(folder, entry.name)
        if (entry.isDirectory()) {
          walk(filename)
          continue
        }
        if (!entry.isFile()) continue
        let descriptor: number | undefined
        try {
          if (!inside(realDirectory, fs.realpathSync(filename))) continue
          descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
          const info = fs.fstatSync(descriptor)
          if (!info.isFile() || !info.size) continue
          // Match image-size's bounded header read, without allowing its path
          // loader to follow a newly introduced leaf symlink.
          const bytes = Buffer.alloc(Math.min(info.size, headerLimit))
          let read = 0
          while (read < bytes.length) {
            const count = fs.readSync(descriptor, bytes, read, bytes.length - read, read)
            if (!count) break
            read += count
          }
          const size = imageSize(bytes.subarray(0, read))
          if (!size.width || !size.height || !size.type) continue
          if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)) continue
          if (size.width < 1 || size.height < 1) continue
          const rotated = size.orientation !== undefined && size.orientation >= 5 && size.orientation <= 8
          const value = {
            width: rotated ? size.height : size.width,
            height: rotated ? size.width : size.height,
            type: size.type,
          }
          const relative = path.relative(directory, filename).split(path.sep).join('/')
          const segments = ['education_hub_articles', articleId, ...relative.split('/')]
          dimensions[`/${segments.map(encodeURIComponent).join('/')}`] = value
          // The current renderer percent-encodes the article ID but preserves
          // raw relative filenames; the catalog cover path is also unescaped.
          // Reserved URL characters must use the encoded key above instead.
          if (!/[?#%\\]/.test(relative)) {
            dimensions[`/education_hub_articles/${encodeURIComponent(articleId)}/${relative}`] = value
          }
          if (!/[?#%\\]/.test(articleId + relative)) dimensions[`/${segments.join('/')}`] = value
        } catch {
          // A corrupt/non-image file is not a reason to hide an article.
        } finally {
          if (descriptor !== undefined) fs.closeSync(descriptor)
        }
      }
    }
    walk(directory)
  } catch {
    // Absent/unreadable folders cannot supply trusted dimensions.
  }
  if (coverImage?.startsWith('/') && !coverImage.startsWith('//')) {
    try {
      const url = new URL(coverImage, 'https://kb.invalid')
      if (url.origin === 'https://kb.invalid') {
        const value = dimensions[url.pathname] ?? dimensions[decodeURI(url.pathname)]
        if (value) dimensions[coverImage] = value
      }
    } catch {
      // Malformed/unknown cover URLs retain the existing image fallback.
    }
  }
  return dimensions
}
