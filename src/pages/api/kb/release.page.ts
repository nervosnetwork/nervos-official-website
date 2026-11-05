import type { NextApiRequest, NextApiResponse } from 'next'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type KBRelease = {
  schemaVersion: 1
  websiteSHA: string
  articleSHA: string
  articleBaselineSHA: string
  articleRepository: string
  contentSource: 'pin' | 'main' | 'sha'
  workingTree: boolean
}

function isRelease(value: unknown): value is KBRelease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return (
    data.schemaVersion === 1 &&
    typeof data.websiteSHA === 'string' &&
    /^[a-f0-9]{40}$/.test(data.websiteSHA) &&
    typeof data.articleSHA === 'string' &&
    /^[a-f0-9]{40}$/.test(data.articleSHA) &&
    typeof data.articleBaselineSHA === 'string' &&
    /^[a-f0-9]{40}$/.test(data.articleBaselineSHA) &&
    data.articleRepository === 'https://github.com/NervosEducationHub/EducationHubArticles.git' &&
    typeof data.contentSource === 'string' &&
    ['pin', 'main', 'sha'].includes(data.contentSource) &&
    typeof data.workingTree === 'boolean'
  )
}

/** Public build provenance only: no credentials or private configuration. */
export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('CDN-Cache-Control', 'no-store')
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const record: unknown = JSON.parse(
      await readFile(path.join(process.cwd(), 'public/kb-content-release.json'), 'utf8'),
    )
    if (!isRelease(record)) throw new Error('Invalid release provenance')
    if (request.method === 'HEAD') {
      response.status(200).end()
      return
    }
    // Whitelist fields even if a generated file unexpectedly contains extras.
    response.status(200).json({
      schemaVersion: 1,
      websiteSHA: record.websiteSHA,
      articleSHA: record.articleSHA,
      articleRepository: record.articleRepository,
      articleBaselineSHA: record.articleBaselineSHA,
      contentSource: record.contentSource,
      workingTree: record.workingTree,
    })
  } catch {
    if (request.method === 'HEAD') response.status(503).end()
    else response.status(503).json({ error: 'Release provenance is unavailable' })
  }
}
