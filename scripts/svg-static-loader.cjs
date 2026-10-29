// eslint-disable-next-line @typescript-eslint/no-var-requires -- Webpack's CommonJS loader entry.
const { createRequire } = require('node:module')

// Resolve through SVGR's own dependencies so external SVGs use exactly the
// same optimizer/version as the existing inline React components.
const svgrRequire = createRequire(require.resolve('@svgr/webpack'))
const { transform } = svgrRequire('@svgr/core')
const svgo = svgrRequire('@svgr/plugin-svgo')

/**
 * @this {{ resourcePath: string, cacheable?: () => void }}
 * @param {string} contents
 * @returns {string}
 */
module.exports = function svgStaticLoader(contents) {
  this.cacheable?.()
  return transform.sync(
    contents,
    {},
    {
      filePath: this.resourcePath,
      caller: { name: '@svgr/webpack', defaultPlugins: [svgo] },
    },
  )
}
