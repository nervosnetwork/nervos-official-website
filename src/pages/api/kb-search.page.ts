import type { NextApiRequest, NextApiResponse } from 'next'
import { getKBCatalog } from '../../server/kb-content'
import { searchArticles } from '../../components/KnowledgeHub/content'

// Local corpus only. No analytics or third-party credentials exposed.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : ''
  const locale = typeof req.query.locale === 'string' ? req.query.locale : 'en'
  const articles = searchArticles(q, getKBCatalog(locale, true))
    .slice(0, 5)
    .map(article => {
      delete article.text
      return article
    })
  res.setHeader('Cache-Control', 'public, max-age=60')
  return res.json(articles)
}
