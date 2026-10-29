# D-05 IndexNow deployment handoff

The repository provides the public verification file and an opt-in notification
command. Automatic production deployment integration is still pending. The
command is not called by `dev`, `build` or the article deployment webhook.
Tests use mocked requests and never send real notifications. The implementation
changes no UI, article addresses or indexing rules.

## Verification file

Publish `/uo84rnu4wkypo8qnqbhqortk5t8jxel2.txt` on `https://www.nervos.org`.
The UTF-8 file contains the key supplied in handoff table 16, with a final newline.
Next serves it with `text/plain; charset=utf-8`. This is a public verification key,
not an application secret.

Before enabling notifications, verify an external GET returns 200, without a
redirect, login page or WAF challenge. D-04's production access check still applies.

## Prepare and preview changed URLs

Supply a JSON array of absolute production URLs. Include newly published, updated
and deleted URLs for the release being deployed; do not include preview URLs,
credentials or fragments. Existing article canonical paths remain authoritative.
Deleted URLs are deliberately allowed even if absent from the new sitemap.

```json
[
  "https://www.nervos.org/knowledge-base/what_is_fiber"
]
```

Run the preview from the website repository, using the reviewed input artifact:

```sh
pnpm indexnow --urls /path/to/changed-urls.json
```

This default mode makes **no network requests**, removes duplicate URLs and emits
a JSON plan. Each batch contains at most 10,000 URLs. An empty array does nothing.

The current command does not discover changes or persist a production checkpoint.
The deployment integration must supply that input. Compare against the last
successfully notified production release, not just the previous commit or build.
Do not compare only sitemap URLs and `lastmod`: this project's article date can
remain unchanged when its body or images change. Include source/content metadata
and relevant assets in the comparison, and retain deleted URLs from the baseline.
For the first run, explicitly review the initial batch with Dele; do not silently
treat a missing baseline as permission to submit the entire site.

## Submit only after production is live

Only after the intended release is serving on `www.nervos.org`, run:

```sh
pnpm indexnow --urls /path/to/changed-urls.json --submit --production-deployed
```

Both flags are required for sending. `--production-deployed` is the caller's
explicit confirmation, not an automated deployment check. The command first
checks the live key file, then POSTs sequential batches to the fixed IndexNow
endpoint. Redirects are rejected and each request has a 15-second timeout.

- HTTP 200 means accepted by the endpoint, not indexed.
- HTTP 202 means accepted with key validation pending, not indexed.
- Other responses or network failures stop execution with a nonzero exit code.
  For a POST failure, the JSON receipt preserves accepted batches, the failed
  batch and planned batches that were not sent. If key verification fails, every
  batch remains planned and no POST is sent. There is no automatic retry.

Capture stdout on success and stderr on failure as deployment artifacts. Inspect
the receipt before retrying; retry failed/unsent URLs after fixing the cause and
respect rate limits. For 202, check key accessibility and the pending validation
before advancing the notification checkpoint. A transport timeout may mean the
endpoint received the batch even though the caller did not receive its response.

## Remaining production integration

Sonny and the deployment administrator must identify the actual production-success
event, validate the deployed revision/domain, generate the changed-URL artifact
and attach the command there. A webhook's acceptance of a build request is **not**
deployment completion. Do not attach notifications to every push, build or preview.

Persist the input, per-batch receipt and last successfully notified production
baseline. A failed or pending run must remain recoverable rather than silently
advancing that baseline. Confirm D-04 access, then perform the first approved
notification and record the response. Dele handles the initial/ongoing marketing
URL batches described in the handoff; this does not replace the separate
Google Search Console/Bing sitemap submission in D-03.

Protocol reference: [IndexNow documentation](https://www.indexnow.org/documentation).
