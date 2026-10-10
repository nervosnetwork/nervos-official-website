import { useRef, useState, type FormEvent } from 'react'
import { api } from '../../utils/api'
import { newsletterSignupInput } from '../../utils/newsletter'
import { trackKBEvent } from './analytics'

export function useNewsletterSignup(placement: 'signal' | 'footer') {
  const { mutateAsync } = api.newsLetter.signup.useMutation({ retry: false })
  const pending = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [isInvalid, setIsInvalid] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending.current) return
    const form = event.currentTarget
    const input = newsletterSignupInput.safeParse({ email: new FormData(form).get('email') })
    if (!input.success) {
      setStatus('Please enter a valid email address.')
      setIsError(true)
      setIsInvalid(true)
      return
    }

    pending.current = true
    setIsSubmitting(true)
    setIsError(false)
    setIsInvalid(false)
    setStatus('Submitting…')
    trackKBEvent('kb_newsletter_submit', { placement })
    try {
      const result = await mutateAsync({ email: input.data.email })
      if (!result.success) throw new Error('Newsletter signup was not accepted')
      setStatus('Thanks! Your signup request was received.')
      form.reset()
      trackKBEvent('kb_newsletter_result', { placement, outcome: 'accepted' })
    } catch {
      setIsError(true)
      setStatus('Unable to submit. Please try again or contact media@nervos.org.')
      trackKBEvent('kb_newsletter_result', { placement, outcome: 'error' })
    } finally {
      pending.current = false
      setIsSubmitting(false)
    }
  }

  return { onSubmit, isSubmitting, status, isError, isInvalid }
}
