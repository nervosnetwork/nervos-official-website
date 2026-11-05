import { useEffect } from 'react'
import Script from 'next/script'
import { useRouter } from 'next/router'
import { GA_ENABLED, GA_MEASUREMENT_ID, trackGAPageView } from '../../utils/ga'

export function GoogleAnalytics() {
  const router = useRouter()
  useEffect(() => {
    if (router.isReady) trackGAPageView(router.asPath)
  }, [router.isReady, router.asPath])
  return GA_ENABLED ? (
    <Script
      id="nervos-ga4"
      strategy="afterInteractive"
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
    />
  ) : null
}
