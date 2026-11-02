import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/indexnow.yml', import.meta.url), 'utf8')
const jobs = workflow.slice(workflow.indexOf('\njobs:\n'))
const plan = jobs.slice(jobs.indexOf('\n  plan:\n'), jobs.indexOf('\n  submit:\n'))
const submit = jobs.slice(jobs.indexOf('\n  submit:\n'))
const topLevel = workflow.slice(0, workflow.indexOf('\njobs:\n'))
const withoutComments = text => text.replace(/^\s*#.*$/gm, '')

test('workflow is deployment/manual only and manual runs default to a non-submitting plan', () => {
  assert.match(topLevel, /\n  deployment_status:\n/)
  assert.match(topLevel, /\n  workflow_dispatch:\n/)
  assert.doesNotMatch(withoutComments(topLevel), /\n  (?:push|pull_request|pull_request_target|workflow_run|schedule):/)
  assert.match(topLevel, /mode:[\s\S]*?options:\n\s+- plan\n\s+- submit\n\s+default: plan/)
  assert.match(topLevel, /scope:[\s\S]*?options:\n\s+- kb\n\s+- site\n\s+default: kb/)
  assert.match(topLevel, /retry_incomplete:[\s\S]*?type: boolean\n\s+default: false/)
  assert.match(topLevel, /deployment_id:[\s\S]*?type: string/)
  assert.match(topLevel, /approve_plan:[\s\S]*?type: string/)
})

test('read-only plans cannot obtain submission write permissions or submit mode', () => {
  assert.match(topLevel, /permissions:\n  contents: read\n  deployments: read/)
  assert.doesNotMatch(topLevel, /contents: write/)
  assert.match(plan, /github\.repository == 'nervosnetwork\/nervos-official-website'/)
  assert.match(plan, /github\.event_name == 'workflow_dispatch' && inputs\.mode == 'plan'/)
  assert.match(plan, /args=\(--mode plan /)
  assert.doesNotMatch(withoutComments(plan), /contents: write|environment:|--mode submit|--approve-plan/)
})

test('submission requires explicit enablement and a successful Production event or manual submit', () => {
  assert.match(submit, /github\.repository == 'nervosnetwork\/nervos-official-website'/)
  assert.match(submit, /vars\.INDEXNOW_ENABLED == 'true'/)
  assert.match(submit, /github\.event_name == 'deployment_status'/)
  assert.match(submit, /github\.event\.deployment_status\.state == 'success'/)
  assert.match(submit, /github\.event\.deployment\.environment == \(vars\.INDEXNOW_ENVIRONMENT \|\| 'Production'\)/)
  assert.match(submit, /github\.event_name == 'workflow_dispatch' && inputs\.mode == 'submit'/)
  assert.doesNotMatch(withoutComments(submit), /github\.event\.deployment\.production_environment/)
  assert.match(submit, /if \[\[ -z "\$DEPLOYMENT_ID" \]\]; then[\s\S]*?exit 1/)
  assert.match(submit, /args=\(--mode submit --deployment-id "\$DEPLOYMENT_ID" --output indexnow-output\)/)
})

test('manual submit uses reviewer approval while automatic submit uses its production environment', () => {
  assert.match(
    submit,
    /environment: \$\{\{ github\.event_name == 'workflow_dispatch' && 'indexnow-approval' \|\| 'indexnow-production' \}\}/,
  )
  assert.match(topLevel, /configure indexnow-approval for main with[\s\S]*?required reviewers/)
  assert.match(topLevel, /indexnow-production needs No restriction and no reviewer/)
  assert.match(topLevel, /empty GITHUB_REF/)
  assert.match(topLevel, /runner verifies deployed-SHA ancestry[\s\S]*?on main independently/)
})

test('only the serialized submit job has state write permission and runs trusted main code', () => {
  assert.match(submit, /permissions:\n\s+contents: write\n\s+deployments: read/)
  assert.match(submit, /concurrency:\n\s+group: indexnow-production\n\s+cancel-in-progress: false/)
  assert.match(
    submit,
    /uses: actions\/checkout@v4\n\s+with:\n\s+repository: nervosnetwork\/nervos-official-website\n\s+ref: main\n\s+persist-credentials: false/,
  )
  assert.doesNotMatch(submit, /ref:.*\$\{\{/)
  assert.equal((workflow.match(/contents: write/g) || []).length, 1)
})

test('manual inputs are passed as environment values and quoted shell array arguments, not shell expressions', () => {
  const runBodies = [...workflow.matchAll(/        run: \|\n((?:          [^\n]*\n|\n)+)/g)].map(match => match[1])
  assert.equal(runBodies.length, 2)
  for (const body of runBodies) {
    assert.doesNotMatch(body, /\$\{\{/)
    assert.doesNotMatch(body, /\beval\b|\bsource\b|bash -c|sh -c/)
    assert.match(body, /node scripts\/indexnow-deploy\.mjs "\$\{args\[@\]\}"/)
    assert.match(body, /--deployment-id "\$DEPLOYMENT_ID"/)
    assert.match(body, /--scope "\$REQUESTED_SCOPE"/)
    assert.match(body, /"\$RETRY_INCOMPLETE" == 'true'/)
  }
  assert.match(submit, /--approve-plan "\$APPROVE_PLAN"/)
  assert.match(topLevel, /INDEXNOW_STATE_BRANCH:.*'indexnow-state'/)
  assert.match(topLevel, /INDEXNOW_ALLOWED_CREATOR:.*'vercel\[bot\]'/)
  assert.doesNotMatch(workflow, /INDEXNOW_ORIGIN:|INDEXNOW_ENDPOINT:/)
})

test('jobs use Node 22 without dependency hooks and retain only output artifacts even on errors', () => {
  for (const job of [plan, submit]) {
    assert.match(job, /node-version: '22'/)
    assert.match(job, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/)
    assert.match(job, /if: always\(\)\n\s+uses: actions\/upload-artifact@v4/)
    assert.match(job, /path: indexnow-output\//)
    assert.match(job, /retention-days: 90/)
    assert.doesNotMatch(job, /(?:npm|pnpm|yarn) (?:install|ci)|include-hidden-files|path: \./)
  }
})
