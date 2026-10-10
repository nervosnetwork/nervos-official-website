# Knowledge Base newsletter signup

Updated: 2026-09-28.

## Shared list and existing implementation

Both the **Blockchain Signal** form and the **Be a part of the journey** footer form now call the existing `newsLetter.signup` tRPC mutation. They use the same server-only `SENDGRID_API_TOKEN` and `SENDGRID_LIST_ID` as the original website footer. No second list, new email provider, fake first name, or client-side SendGrid credentials were introduced.

The original footer still sends `{ email, firstName }`. Its component and layout are unchanged. The API now also accepts email-only `{ email }` requests from the two KB forms.

## Validation and request handling

- Email is trimmed, checked with the shared Zod email validator, and limited to 254 characters on the client and server.
- Optional first names are trimmed and limited to SendGrid's 50-character limit. If missing or blank, `first_name` is **omitted**, not sent as an empty string. This preserves an existing contact's name when the email-only form is used. SendGrid documents that omitted fields retain their existing values. [SendGrid contact API](https://www.twilio.com/docs/sendgrid/api-reference/contacts/add-or-update-a-contact)
- Native required/email validation remains enabled. While submitting, the input and button are disabled and a ref guard rejects duplicate rapid submissions before React rerenders. Automatic mutation retries are disabled; failures can be retried explicitly.
- Both forms provide loading and accessible success/error feedback without changing their initial layout. The form resets only when the server reports acceptance. Failures retain the entered email and provide a retry/contact message.
- The server request has a 10-second timeout. Missing configuration, provider errors, network failures, and timeout failures return a generic error, without echoing credentials, input values, or provider response bodies.

## Meaning of success

The SendGrid endpoint responds with **202 Accepted** when the contact upsert is queued asynchronously. It does not confirm completed import or email delivery. The UI therefore says **“Thanks! Your signup request was received.”** and analytics records `outcome: accepted`, not a confirmed subscription or delivery. This follows the existing site's provider flow; it does not add a welcome email, double opt-in, or alter SendGrid's suppression/unsubscribe settings. [SendGrid asynchronous processing](https://www.twilio.com/docs/sendgrid/api-reference/contacts/add-or-update-a-contact)

The two placements share the same mailing list. Their different visual labels do not create distinct subscriptions, mailing schedules, or editorial feeds. SendGrid campaign content and cadence remain controlled outside this integration.

## Analytics and privacy

`kb_newsletter_submit` records a real attempt and `kb_newsletter_result` records `accepted` or `error`, with `placement: signal | footer`. These Umami events never include the email, first name, error detail, or request body. The existing production-only tracking switch remains unchanged. The former `kb_newsletter_submit_preview` is no longer emitted; its historical preview clicks must not be counted as subscriptions.

## Verification

Tests use mocked tRPC/SendGrid responses and synthetic addresses. No real subscription or marketing request was sent during implementation, and no secret values were inspected.

```sh
node --test src/server/api/routers/newsletter.test.mjs src/components/KnowledgeHub/newsletter.test.mjs src/components/KnowledgeHub/analytics-footer.test.mjs
```

Deployment still requires valid server-side SendGrid configuration. Final contact-import and campaign-delivery behavior should be checked by an authorized operator in SendGrid; local mocked tests cannot verify the live account's settings.
