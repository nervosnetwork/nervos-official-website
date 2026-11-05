# D-05 production automation and recovery

The implementation includes snapshots, changed-URL planning, deployment gating,
durable receipts and recovery. **Production notification is disabled by default.**
This changes no UI, article URLs, indexability or Google integration. Development
acceptance does not send real IndexNow requests or configure cloud permissions.

## Snapshot and local review

Build/dev generate `public/indexnow-manifest.json` (revision, canonical URLs,
hashes) and `public/indexnow-release.json` (revision and manifest digest).
Production verification reads them through `/api/indexnow/manifest` and
`/api/indexnow/release`, with browser/CDN caching explicitly disabled. The API
supports only GET/HEAD and fails closed if a build snapshot is unavailable.
Generated files are ignored by Git. No body text, credentials or receipts are public.
Eligibility reuses sitemap policy: genuine translations/valid pagination are
included; drafts, future posts, searches, aliases and missing translations are not.

Fingerprints cover Markdown/frontmatter, editorial fields, local image bytes,
shared templates/styles/translations and rendering scripts. They exclude build
dates, filesystem birth times, generated article output and audit-only commit
fields. Remote image URLs are recorded but unchanged remote URLs are not fetched.
Dependency invalidation is conservative: changes can notify related KB lists,
landings and recommendations as well as the edited article; shared template
changes can affect all public pages. This is not a minimal single-article diff.

```sh
pnpm indexnow:manifest
pnpm indexnow:plan --scope kb
```

The plan command is strictly offline and writes `indexnow-output/plan.json`.
Use `--baseline /path/to/baseline.json` to compare a saved baseline. `kb` covers
published KB pages and real translations; `site` covers the entire eligible site.
A local plan is not approval of a future production deployment. Missing baseline
never authorizes submitting the entire site. Changing an established scope
requires an explicitly reviewed state migration, not a silent scope switch.

## Production verification and durable state

The workflow listens to successful GitHub `deployment_status` events, not pushes,
builds or the article build hook. Preview/fork events cannot notify. The runner
independently checks the approved upstream repo, trusted `vercel[bot]` creator,
configured `Production` environment, latest success status and expected HTTPS
project/domain, and proves the deployed revision is already in upstream `main`
history using GitHub's commit comparison. It deliberately ignores `production_environment`: real production
deployments in this integration have returned false for that boolean.

It fetches only fixed-origin `https://www.nervos.org/api/indexnow/release` and
`https://www.nervos.org/api/indexnow/manifest`, verifying
the intended Git revision and content digest. Redirects, wrong MIME, WAF HTML,
stale/different revisions and malformed snapshots fail closed. The release is
checked again before every POST and before advancing the baseline.

The dedicated `indexnow-state` branch contains only `state.json`. Each update
is an atomic non-force Git commit checked against the prior revision. Git history
retains inputs, receipts and snapshots; Actions artifacts (90 days) are only
convenient copies, not the long-term baseline. Inaccessible or corrupt state
fails closed. Deleted URLs remain in the diff against the last fully accepted
production snapshot, not merely the previous Git commit or sitemap date.

The runner saves the full plan and sending intent before notifications, then
persists each batch result. Concurrent submissions are serialized and state
updates use compare-and-swap. A failed persistence operation stops later batches.
Completed deployment replays do not send again. HTTP 200 means endpoint receipt,
not indexing; 202 stays pending. Neither failure nor pending advances the baseline.

## Administrator setup before enabling

1. Merge trusted automation tooling to upstream `main`. Submit jobs always execute
   `main`, never deployment/PR code. No Vercel API token is required.
2. Configure GitHub environment **`indexnow-approval`**, restricted to `main` with
   designated reviewers, for the first manual submission/recovery. Configure
   **`indexnow-production`** with no per-run review or environment secrets and
   allow the integration's SHA-only deployment events. A `main`-only environment
   rule would reject these events because their `GITHUB_REF` can be empty;
   checkout of `main` does not change that event ref. The runner's independent
   main-ancestry, trusted-creator, live-release and approved-baseline checks are
   mandatory gates. YAML names alone do not configure environment protection.
3. Approve the submit job's GitHub token `contents: write` for state persistence.
   Preserve/protect `indexnow-state` from deletion/force updates while allowing
   the workflow writer. `INDEXNOW_STATE_BRANCH` permits a dedicated
   `indexnow-state-<suffix>`, never a source branch. **Exclude this state-only
   branch from Vercel preview builds/deploy hooks.** No remote state branch is
   created by development tests.
4. Confirm production project/environment/creator. `INDEXNOW_ENVIRONMENT` and
   `INDEXNOW_ALLOWED_CREATOR` permit an approved integration change; they are
   security boundaries, not workarounds for failed checks.
5. Verify D-04 access: key file, both JSON endpoints and public pages must be
   reachable externally without login, redirects or WAF challenges. The existing
   key endpoint `/uo84rnu4wkypo8qnqbhqortk5t8jxel2.txt` must return only its key as
   UTF-8 `text/plain`; do not replace the supplied key.
6. Agree the initial scope/list with Dele. Keep `INDEXNOW_ENABLED` absent/false
   until setup and first-plan review are complete. Only exact `true` permits send.

No environments, variables, permissions or live settings are changed by this code.

## First submission and automatic subsequent releases

1. After the intended release is live, manually run the workflow with `mode=plan`,
   the successful production deployment ID and agreed scope. No state write or
   IndexNow POST occurs. Omitted ID selects the newest trusted Production
   deployment, but it still must match the live domain.
2. Review artifact `result.json` with Dele: URLs, scope, revision and `plan.digest`.
3. Once the setup above is confirmed, set `INDEXNOW_ENABLED=true`. Manually run
   `mode=submit` with the same deployment ID/scope and exact `approve_plan` hash;
   complete the protected `indexnow-approval` review. Automatic events cannot
   initialize a missing baseline because they supply no approval hash.
4. Inspect results. Only fully accepted durable outcomes advance the baseline.
   A subsequent empty change set can advance it without sending a POST.

Future successful Production events use the stored scope and accepted baseline
automatically. Google Search Console/Bing sitemap submission and indexing review
remain separate D-03 work; this automation does not guarantee indexing or rank.

## Failure, uncertainty, pending verification or rollback

A crash after POST but before saving may leave an uncertain sending intent.
Automatic retries stop rather than guessing success. Review the state history
and artifact receipt, fix the cause (including key validation for 202), then:

1. Generate/review a fresh plan for the currently live deployment.
2. Manually submit with `retry_incomplete=true` and the exact current
   `approve_plan` digest through the protected approval environment.
3. Durably recorded HTTP 200 URLs are skipped when resuming the same plan.
   Pending/uncertain batches may be resent; acknowledge a timed-out POST may
   already have arrived. A different deployment/plan is a new reviewed attempt.
4. Never edit a receipt to claim success or manually advance its baseline.

Rollbacks compare against the last accepted snapshot, preserving deleted/restored
URLs. The original `pnpm indexnow --urls FILE` remains offline unless both legacy
submit flags are provided, but it does not update automation state: do not mix it
into production automation without reconciling records.

References: [IndexNow protocol](https://www.indexnow.org/documentation),
[GitHub deployment events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status).
