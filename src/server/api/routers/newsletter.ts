import { createTRPCRouter, publicProcedure } from '../trpc'
import { env } from '../../../env.mjs'
import { newsletterSignupInput } from '../../../utils/newsletter'

// document: https://www.twilio.com/docs/sendgrid/api-reference/contacts/add-or-update-a-contact
const SEND_GRID_API_ENDPOINT = `https://api.sendgrid.com/v3/marketing/contacts`
const METHOD = 'PUT'
const TOKEN = env.SENDGRID_API_TOKEN
const SEND_GRID_LIST_ID = env.SENDGRID_LIST_ID

export const newsLetterRouter = createTRPCRouter({
  signup: publicProcedure.input(newsletterSignupInput).mutation(async ({ input: { email, firstName } }) => {
    if (!TOKEN || !SEND_GRID_LIST_ID) {
      return { success: false, error: { message: 'Newsletter service is unavailable', status: 503 } }
    }
    const data = {
      list_ids: [SEND_GRID_LIST_ID],
      // SendGrid preserves omitted fields, so email-only signups cannot erase existing names.
      contacts: [{ email, ...(firstName ? { first_name: firstName } : {}) }],
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(SEND_GRID_API_ENDPOINT, {
        method: METHOD,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      if (res.status !== 202) {
        return {
          success: false,
          error: { message: 'Failed to add user to newsletter', status: res.status },
        }
      }

      // 202 means queued for processing, not confirmed delivery or completed contact import.
      return { success: true, status: 'accepted' as const }
    } catch {
      return {
        success: false,
        error: { message: 'Newsletter service is unavailable', status: controller.signal.aborted ? 504 : 502 },
      }
    } finally {
      clearTimeout(timeout)
    }
  }),
})
