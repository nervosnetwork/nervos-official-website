/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const component = fs.readFileSync(path.join(__dirname, 'KnowledgeFooter.tsx'), 'utf8')
const styles = fs.readFileSync(path.join(__dirname, 'footer-v2.module.scss'), 'utf8')

test('footer follows the Figma frame and keeps status feedback out of layout', () => {
  assert.match(component, /className=\{styles\.socialRule\}/)
  assert.match(component, /\{status && \(/)
  assert.match(styles, /\.footer\s*\{[\s\S]*?height:\s*445px/)
  assert.match(styles, /\.socialRule\s*\{[\s\S]*?width:\s*50px[\s\S]*?margin-top:\s*24px/)
  assert.match(styles, /\.subscribe \.status\s*\{[\s\S]*?position:\s*absolute/)
})
