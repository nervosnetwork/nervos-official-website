import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as sass from 'sass'
import postcss from 'postcss'

const root = fileURLToPath(new URL('../../', import.meta.url))
const exports = {}
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/breakpoints.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports },
)

test('browser queries and Sass share mobile, tablet and desktop boundaries', () => {
  assert.equal(exports.MOBILE_QUERY, '(max-width: 767px)')
  assert.equal(exports.TABLET_QUERY, '(min-width: 768px) and (max-width: 1023px)')
  assert.equal(exports.DESKTOP_QUERY, '(min-width: 1024px)')
  assert.equal(exports.BELOW_DESKTOP_QUERY, '(max-width: 1023px)')
  const css = sass.compileString(
    `@use 'src/styles/breakpoints' as screens;
    .contract { mobile: screens.$mobileMax; tablet: screens.$tabletMin; tablet-end: screens.$tabletMax; desktop: screens.$desktopMin; }`,
    { loadPaths: [root], logger: sass.Logger.silent },
  ).css
  assert.match(css, /mobile: 767px/)
  assert.match(css, /tablet: 768px/)
  assert.match(css, /tablet-end: 1023px/)
  assert.match(css, /desktop: 1024px/)
})

test('compiled shared navigation, KB and legacy layouts add no other viewport width breakpoints', () => {
  for (const file of [
    'components/Header/index.module.scss',
    'components/Header/knowledge-header.module.scss',
    'components/KnowledgeHub/home-v2.module.scss',
    'components/KnowledgeHub/pages-v2.module.scss',
    'components/KnowledgeHub/article-v2.module.scss',
    'components/KnowledgeHub/footer-v2.module.scss',
    'pages/media-kit/index.module.scss',
    'pages/foundation/index.module.scss',
    'pages/journey/Section.module.scss',
  ]) {
    const css = postcss.parse(
      sass.compile(path.join(root, 'src', file), {
        loadPaths: [root],
        logger: sass.Logger.silent,
      }).css,
    )
    css.walkAtRules('media', rule => {
      for (const query of rule.params.split(/\)\s*(?:and|,)\s*/)) {
        if (!query.includes('width')) continue
        const widths = [...query.matchAll(/(\d+)px/g)].map(match => Number(match[1]))
        assert.ok(
          widths.every(width => [767, 768, 1023, 1024].includes(width)),
          `${file}: ${rule.params}`,
        )
      }
    })
  }
})
