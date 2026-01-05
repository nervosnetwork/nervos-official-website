import sizeOf from 'image-size'
import matter from 'gray-matter'
import { remark } from 'remark'
import html from 'remark-html'
import { DOMParser } from '@xmldom/xmldom'
import path from 'node:path'

const DOMAIN = process.env.NEXT_BASE_URL || process.env.VERCEL_URL
const BASE_URL = DOMAIN ? `https://${DOMAIN}` : '/'
export async function parseBlog(fileContent, slug, fileBirthTime) {
  const { data, content } = matter(fileContent)

  let coverImage = undefined
  let coverImageURL = typeof data.coverImage === 'string' ? data.coverImage : undefined
  if (coverImageURL != null) {
    const isExternalLink = /^(https?:)?\/\//.test(coverImageURL)
    if (!isExternalLink) {
      // Some places need to include the full path to the protocol, such as `twitter:image`.
      const prefix = BASE_URL ?? ''
      coverImageURL = `/education_hub_articles/${slug}/${coverImageURL}`
      coverImage = {
        fullPath: `${prefix}${coverImageURL}`,
        src: coverImageURL,
      }
      try {
        coverImage = {
          ...coverImage,
          ...sizeOf(path.join(process.cwd(), 'public', coverImageURL)),
        }
      } catch {
        console.warn('failed to fetch image size')
      }
    } else {
      // TODO: support external link
    }
  }
  // const date = typeof data.date === 'string' ? fixDate(data.date) : fileBirthTime
  const date = getDate(slug, data, fileBirthTime)
  const readingTime = Math.round(content.length / 1300).toString()

  const list = Array.isArray(data.author) ? data.author : [data.author]
  const authors = list // { name: string; avatar?: string }[]
    .filter(item => !!item)
    .map(author => {
      if (typeof author === 'string') {
        // string authors
        if (author.startsWith('github:')) {
          // github author
          const name = author.substring('github:'.length)
          return { name, avatar: `https://avatars.githubusercontent.com/${name}` }
        } else {
          // default string author
          return { name: author }
        }
      } else {
        // object authors
        const name = author.name
        return { name, avatar: `https://avatars.githubusercontent.com/${name}` }
      }
    })

  if (authors.length === 0) {
    // add default author if no authors found
    authors.push({ name: 'Nervos', avatar: '/images/nervos_avatar.svg' })
  }

  const title = getStringValue(data.title)
  const subtitle = getStringValue(data.subtitle)
  const excerpt = getStringValue(data.excerpt) ?? (await getBlogExcerpt(content))
  const category = getStringValue(data.category)
  const link = getStringValue(data.link)
  const pageView = 0

  const blog = omitNullValue({
    slug,
    title: title ?? slug,
    subtitle,
    content,
    date,
    coverImage,
    readingTime,
    authors,
    excerpt,
    category,
    link,
    pageView,
  })

  return blog;
}

function getStringValue(data) {
  return typeof data === 'string' ? data : undefined
}

async function getBlogExcerpt(content) {
  const contentHTML = await markdownToHtml(content)
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<html><body>${contentHTML}</body></html>`, 'text/html')
  return (doc.documentElement.textContent ?? content).substring(0, 200)
}

function omitNullValue(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null))
}

async function markdownToHtml(markdown) {
  const result = await remark().use(html).process(markdown)
  return result.toString()
}

const mapToCorrectDate = {
  // What_Does_Determinism_Mean_in_Blockchain_(explainCKBot) with date 2024-22-12T15:00:00.000Z
  "2024-22-12T15:00:00.000Z": "2024-12-22T15:00:00.000Z",
  // What_is_a_Block_Builder_in_Blockchain_(explainCKBot) with date 2025-27-01T15:00:00.000Z
  "2025-27-01T15:00:00.000Z": "2025-01-27T15:00:00.000Z",
  // ultimate_guide_to_rgb_rgbpp_and_client_side_validation with date 2024-09-2616:00:00.000Z
  "2024-09-2616:00:00.000Z": "2024-09-26T16:00:00.000Z",
}

function getDate(slugName, data, defaultDateStr) {
  const originDate = typeof data.date === 'string' ? data.date : defaultDateStr
  let fixedDateStr = originDate.replace(" T", "T");
  if (mapToCorrectDate[fixedDateStr]) {
    fixedDateStr = mapToCorrectDate[fixedDateStr]
  }
  checkDate(slugName, fixedDateStr)
  return fixedDateStr;
}

function checkDate(slugName, dateStr) {
  const date = new Date(dateStr)
  // if is not valid log
  if (isNaN(date.getTime())) {
    console.warn(`[Invalid date] for blog ${slugName} with date ${dateStr}`)
  }

}