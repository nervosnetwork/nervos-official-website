import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function testsBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return testsBelow(filename)
    return entry.isFile() && /\.test\.(?:mjs|cjs|js)$/.test(entry.name) ? [filename] : []
  })
}

const files = [...testsBelow('scripts'), ...testsBelow('src')].sort()
if (!files.length) throw new Error('No website tests found')
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
