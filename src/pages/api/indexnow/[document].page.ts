import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NextApiRequest, NextApiResponse } from 'next'

// Serving these through an API response is intentional: Next's public-file
// handler overwrites custom Cache-Control headers. These literal dependencies
// also let serverless file tracing include both build-generated snapshots.
export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('CDN-Cache-Control', 'no-store')
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  const sendError = (status: number, error: string) => {
    response.status(status)
    if (request.method === 'HEAD') response.end()
    else response.json({ error })
  }
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.setHeader('Allow', 'GET, HEAD')
    sendError(405, 'Method not allowed')
    return
  }
  const document = request.query.document
  if (document !== 'release' && document !== 'manifest') {
    sendError(404, 'Not found')
    return
  }
  try {
    const content =
      document === 'release'
        ? await readFile(path.join(process.cwd(), 'public/indexnow-release.json'), 'utf8')
        : await readFile(path.join(process.cwd(), 'public/indexnow-manifest.json'), 'utf8')
    if (request.method === 'HEAD') response.status(200).end()
    else response.status(200).send(content)
  } catch {
    sendError(503, 'Release snapshot unavailable')
  }
}
