import { fileURLToPath } from 'node:url'
import { currentKBLegacyRedirects } from './config/kb-legacy-redirects.mjs'
import { INDEXNOW_KEY } from './config/indexnow.mjs'

const i18nConfig = (await import('./next-i18next.config.js')).default

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import('./src/env.mjs'))

/** @type {import("next").NextConfig} */
const config = {
  // Isolate a second local validation server from the active preview.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // Keep data URLs intact so legacy client navigation can be migrated once.
  // Do not infer public /en aliases from raw middleware URLs: Vercel also adds
  // that prefix internally to canonical English requests.
  skipMiddlewareUrlNormalize: true,
  transpilePackages: ['react-tweet'],

  pageExtensions: ['tsx', 'ts', 'jsx', 'js'].map(suffix => `page.${suffix}`),

  /**
   * If you have the "experimental: { appDir: true }" setting enabled, then you
   * must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: i18nConfig.i18n,

  images: {
    formats: ['image/avif', 'image/webp'],
    // Include article/card widths so small slots do not fetch a 1920px source.
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 200, 256, 320, 384, 480],
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 3840],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'user-images.githubusercontent.com',
      },
    ],
  },

  webpack(config) {
    // Opt in to a cacheable SVG file instead of embedding it in both HTML and
    // JavaScript. Keep the existing SVGR optimization and component imports.
    // Clone Next's loader so its server paths, assetPrefix and hashing stay intact.
    const imageRule = config.module.rules.find(rule => rule.loader === 'next-image-loader')
    if (!imageRule) throw new Error('SVG URL imports require Next static image imports')
    const svgUrlQuery = /^\?url$/
    config.module.rules.push({
      ...imageRule,
      test: /\.svg$/i,
      resourceQuery: { and: [imageRule.resourceQuery, svgUrlQuery] },
      loader: undefined,
      options: undefined,
      use: [
        { loader: imageRule.loader, options: imageRule.options },
        { loader: fileURLToPath(new URL('./scripts/svg-static-loader.cjs', import.meta.url)) },
      ],
    })

    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      resourceQuery: { not: [svgUrlQuery] },
      use: ['@svgr/webpack'],
    })

    // https://dhanrajsp.me/snippets/customize-css-loader-options-in-nextjs
    const oneOf = config.module.rules.find(rule => typeof rule.oneOf === 'object')
    if (oneOf) {
      const moduleSassRule = oneOf.oneOf.find(rule => regexEqual(rule.test, /\.module\.(scss|sass)$/))
      if (moduleSassRule) {
        // Get the config object for css-loader plugin
        const cssLoader = moduleSassRule.use.find(({ loader }) => loader.includes('css-loader'))
        if (cssLoader) {
          cssLoader.options = {
            ...cssLoader.options,
            modules: {
              ...cssLoader.options.modules,
              mode: 'local',
            },
          }
        }
      }
    }

    return config
  },
  redirects: async () => {
    const ARCHIVE_URL = 'https://archive.nervos.org'
    const archivedPages = ['/blog', '/blog/:slug', '/trailblazer', '/developer/grants', '/godwoken'].map(source => ({
      source,
      destination: `${ARCHIVE_URL}${source}`,
      permanent: false,
    }))
    const roadmap = {
      source: `/about/roadmap`,
      destination: `/journey`,
      permanent: true,
    }
    const ckbAliases = i18nConfig.i18n.locales.map(locale => ({
      source: `/${locale}/ckb`,
      destination: `${locale === i18nConfig.i18n.defaultLocale ? '' : `/${locale}`}/ckbpage`,
      locale: false,
      permanent: true,
    }))
    return [...currentKBLegacyRedirects(i18nConfig.i18n), ...archivedPages, roadmap, ...ckbAliases]
  },
  headers: async () => [
    {
      source: `/${INDEXNOW_KEY}.txt`,
      locale: false,
      headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
    },
    {
      source: '/sitemap.xml',
      locale: false,
      headers: [{ key: 'Content-Type', value: 'application/xml; charset=utf-8' }],
    },
    {
      source: '/:path*',
      locale: false,
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // Baseline restrictions do not change GA, newsletter, image or iframe
        // destinations. A script/nonce policy needs a separate integration audit.
        { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
      ],
    },
    {
      source: '/:path*',
      locale: false,
      has: [{ type: 'host', value: 'www\\.nervos\\.org' }],
      // Never pin localhost or development hosts to HTTPS. The apex-domain
      // redirect/HSTS and any preload submission belong to deployment review.
      headers: [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }],
    },
  ],
  experimental: {
    outputFileTracingIgnores: [
      'public/education_hub_articles/.git',
      'public/education_hub_articles/.github',
      'public/education_hub_articles/README.md',
      'public/education_hub_articles/**/*.png',
    ],
  },
}

/**
 * Stolen from https://stackoverflow.com/questions/10776600/testing-for-equality-of-regular-expressions
 */
function regexEqual(x, y) {
  return (
    x instanceof RegExp &&
    y instanceof RegExp &&
    x.source === y.source &&
    x.global === y.global &&
    x.ignoreCase === y.ignoreCase &&
    x.multiline === y.multiline
  )
}

export default config
