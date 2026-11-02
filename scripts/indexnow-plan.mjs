import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { planIndexNow } from './indexnow-manifest.mjs'

// A strictly local review tool. No fetch, GitHub writes or IndexNow submissions.
export function main(args = process.argv.slice(2)) {
  const usage = 'node scripts/indexnow-plan.mjs [--manifest FILE] [--baseline FILE] [--scope kb|site] [--output FILE]'
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage)
    return
  }
  const values = new Map()
  for (let index = 0; index < args.length; index++) {
    const option = args[index]
    assert(
      ['--manifest', '--baseline', '--scope', '--output'].includes(option) && !values.has(option),
      'Unknown or duplicate option',
    )
    const value = args[++index]
    assert(value && !value.startsWith('--'), `${option} requires a value`)
    values.set(option, value)
  }
  const manifest = JSON.parse(fs.readFileSync(values.get('--manifest') ?? 'public/indexnow-manifest.json', 'utf8'))
  const baseline = values.has('--baseline') ? JSON.parse(fs.readFileSync(values.get('--baseline'), 'utf8')) : null
  const plan = planIndexNow({ manifest, baseline, scope: values.get('--scope') ?? baseline?.scope ?? 'kb' })
  const output = path.resolve(values.get('--output') ?? 'indexnow-output/plan.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(plan, null, 2) + '\n')
  fs.renameSync(temporary, output)
  console.log(
    JSON.stringify(
      {
        mode: 'offline-plan',
        initial: plan.initial,
        scope: plan.scope,
        urlCount: plan.urls.length,
        changes: Object.fromEntries(Object.entries(plan.changes).map(([kind, urls]) => [kind, urls.length])),
        digest: plan.digest,
        output,
      },
      null,
      2,
    ),
  )
  return plan
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
