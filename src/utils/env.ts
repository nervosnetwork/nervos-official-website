import { PRODUCTION_SITE_ORIGIN } from './sharing-urls'

export const IS_PROD = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
// Used by the existing sharing metadata and legacy article cover metadata.
// Do not derive public sharing links from a preview hostname or a relative '/'.
export const BASE_URL = PRODUCTION_SITE_ORIGIN
