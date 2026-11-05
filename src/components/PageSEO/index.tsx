import Head from 'next/head'
import Router from 'next/router'
import { useEffect } from 'react'
import type { PageSEO as PageSEOData } from '../../utils/page-seo'

export function serializeStructuredData(value: unknown): string {
  // JSON-LD is script raw text: HTML escaping is not sufficient to stop a
  // title containing </script> from closing the element. Keep JSON parseable.
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function PageSEO({
  seo,
  fallbackLanguage = 'en',
  navigationKey,
}: {
  seo?: PageSEOData
  fallbackLanguage?: string
  navigationKey?: string
}) {
  const language = seo?.language ?? fallbackLanguage

  useEffect(() => {
    // Next's router resets lang to the URL locale after navigation. Content may still be English.
    const setLanguage = () => {
      document.documentElement.lang = language
    }
    setLanguage()
    Router.events.on('routeChangeComplete', setLanguage)
    return () => Router.events.off('routeChangeComplete', setLanguage)
  }, [language, fallbackLanguage, navigationKey])

  if (!seo) return null

  return (
    <Head>
      <link rel="canonical" href={seo.canonical} key="canonical" />
      {seo.alternates.map(alternate => (
        <link
          rel="alternate"
          hrefLang={alternate.language}
          href={alternate.url}
          key={`alternate-${alternate.language}`}
        />
      ))}
      {seo.structuredData?.length ? (
        <script
          type="application/ld+json"
          key="structured-data"
          dangerouslySetInnerHTML={{
            __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': seo.structuredData }),
          }}
        />
      ) : null}
    </Head>
  )
}
