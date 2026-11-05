import { z } from 'zod'

// Shared validation for the email-only KB forms and the existing named signup form.
export const newsletterSignupInput = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().max(50).optional(),
})
