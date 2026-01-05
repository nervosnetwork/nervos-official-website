import fs from 'node:fs'
import path from 'node:path'
import { parseBlog } from './generate-articles/parserBlog.mjs'


const SOURCE_DIR = path.join(process.cwd(), 'public', 'education_hub_articles')
const DST_DIR = path.join(process.cwd(), 'src', 'database', 'articles')

async function main() {

  const folders = fs.readdirSync(SOURCE_DIR)
  const listFileImportList = [];
  const slugVariableList = [];
  let slugIndex = 1;
  for await (const folderName of folders) {
    const fullPath = path.join(SOURCE_DIR, folderName)

    if (fs.statSync(fullPath).isDirectory()) {
      const enMarkdownFile = path.join(fullPath, 'index.md');
      if (fs.existsSync(enMarkdownFile)) {
        const files = fs.readdirSync(fullPath);
        // find .md files
        const mdFiles = files.filter(file => file.endsWith('.md'));
        // console.log(`${folderName}`, mdFiles);
        // const lowercaseArticleName = folderName.toLowerCase();
        const obj = {
          slug: folderName,
        };
        for await (const mdFileName of mdFiles) {
          const lan = mdFileName.split('.')[0]?.split('_')[1] ?? 'en';
          // console.log(`${lowercaseArticleName} ${lan}`)
          const fileBirthTime = fs.statSync(path.join(fullPath, mdFileName)).birthtime.toISOString();
          const fileContent = fs.readFileSync(path.join(fullPath, mdFileName), 'utf8');
          const blog = await parseBlog(fileContent, folderName, fileBirthTime);
          // console.log({ blog })
          obj[lan] = blog
        }
        console.log(`slug ${folderName} done`)
        fs.mkdirSync(path.join(DST_DIR, folderName), { recursive: true });
        fs.writeFileSync(path.join(DST_DIR, folderName, 'index.ts'), slugFileTemplate(JSON.stringify(obj, null, 2)));
        const slugVarName = `slug${slugIndex++}`
        slugVariableList.push(slugVarName)
        listFileImportList.push(`import { slug as ${slugVarName} } from './${folderName}';`)
      }
    }
  }
  fs.writeFileSync(path.join(DST_DIR, 'list.ts'), listFileTemplate(listFileImportList, slugVariableList));
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

