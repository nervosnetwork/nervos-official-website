import fs from 'node:fs'
import path from 'node:path'
import { parseBlog } from './generate-articles/parserBlog.mjs'
import i18nConfig from '../next-i18next.config.js'

const SOURCE_DIR = path.join(process.cwd(), 'public', 'education_hub_articles')
const DST_DIR = path.join(process.cwd(), 'src', 'database', 'articles')
const sourceIndex = /^index(?:[_-]([a-z]{2}))?\.md$/

async function main() {
  const folders = fs.readdirSync(SOURCE_DIR).sort()
  const listFileImportList = []
  const slugVariableList = []
  let slugIndex = 1
  for await (const folderName of folders) {
    const fullPath = path.join(SOURCE_DIR, folderName)

    if (fs.lstatSync(fullPath).isDirectory()) {
      const enMarkdownFile = path.join(fullPath, 'index.md')
      if (fs.existsSync(enMarkdownFile)) {
        const files = fs.readdirSync(fullPath)
        // Auxiliary Markdown is not an article rendition. In particular, never
        // parse README/custom files as English or permit them to choose an engine.
        const mdFiles = files
          .filter(file => {
            const match = sourceIndex.exec(file)
            return match && match[1] !== 'en' && i18nConfig.i18n.locales.includes(match[1] ?? 'en')
          })
          .sort()
        // console.log(`${folderName}`, mdFiles);
        // const lowercaseArticleName = folderName.toLowerCase();
        const obj = {
          slug: folderName,
        }
        const languages = new Set()
        for await (const mdFileName of mdFiles) {
          const lan = sourceIndex.exec(mdFileName)[1] ?? 'en'
          if (languages.has(lan)) throw new Error(`${folderName}: duplicate ${lan} article rendition`)
          languages.add(lan)
          if (!fs.lstatSync(path.join(fullPath, mdFileName)).isFile())
            throw new Error(`${folderName}/${mdFileName}: article source must be a regular file`)
          // console.log(`${lowercaseArticleName} ${lan}`)
          const fileBirthTime = fs.statSync(path.join(fullPath, mdFileName)).birthtime.toISOString()
          const fileContent = fs.readFileSync(path.join(fullPath, mdFileName), 'utf8')
          const blog = await parseBlog(fileContent, folderName, fileBirthTime)
          // console.log({ blog })
          obj[lan] = blog
        }
        console.log(`slug ${folderName} done`)
        fs.mkdirSync(path.join(DST_DIR, folderName), { recursive: true })
        fs.writeFileSync(path.join(DST_DIR, folderName, 'index.ts'), slugFileTemplate(JSON.stringify(obj, null, 2)))
        const slugVarName = `slug${slugIndex++}`
        slugVariableList.push(slugVarName)
        listFileImportList.push(`import { slug as ${slugVarName} } from './${folderName}';`)
      }
    }
  }
  fs.writeFileSync(path.join(DST_DIR, 'list.ts'), listFileTemplate(listFileImportList, slugVariableList))
  console.log('done')
}

main()

function listFileTemplate(importList, slugList) {
  return `${importList.join('\n')}


export const slugs = [
  ${slugList.join(',\n  ')}
];
`
}
function slugFileTemplate(jsonStr) {
  return `
  export const slug = ${jsonStr}
`
}
