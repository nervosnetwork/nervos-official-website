import type { KBCatalog, KBMostRead } from '../components/KnowledgeHub/content'

// Manually verified GA4 Pages and screens export, not a live API integration.
// Views are aggregated across verified locale paths and title changes for each
// article concept. Homepage, listing, 404 and unresolved paths are excluded.
// Only the first ten verified concepts are retained; do not invent a fallback
// rank for articles or translations absent from this snapshot.
const snapshot = {
  propertyId: '415662865',
  metric: 'Views',
  startDate: '2025-09-28',
  endDate: '2026-09-27',
  sourceSHA256: '4362a5d474ebb532456c3c74f26a37b43763de151463d164a1f6e2558c4d8356',
  articles: [
    { id: 'Unbreakable_SHA256_Why_Even_Quantum_Computers_Cannot_Do_It', views: 1852 },
    { id: 'block_time_in_blockchain', views: 1820 },
    { id: 'secp256k1_a_key_algorithm', views: 1651 },
    { id: 'zk_rollup_vs_optimistic_rollup', views: 1438 },
    { id: 'comparing_blockchain_virtual_machines', views: 1228 },
    { id: 'what_is_secp256r1', views: 1165 },
    { id: 'slashing_in_PoS', views: 1126 },
    { id: 'What_is_finality_crypto', views: 1087 },
    { id: 'What_is_sharding_in_blockchain', views: 936 },
    { id: 'what_is_nakamoto_consensus', views: 929 },
  ],
} as const

// Call with the current locale's published catalog from getKBCatalog, before
// pruning the homepage catalog to Hub featured articles. Raw GA counts and
// export metadata stay on the server, while canonical article paths stay intact.
export function getKBMostRead(catalog: KBCatalog): KBMostRead {
  const available = new Map(
    catalog.articles.filter(article => !article.excludedFromRecommendations).map(article => [article.id, article]),
  )
  const articles = [...snapshot.articles]
    .sort((a, b) => b.views - a.views || a.id.localeCompare(b.id))
    .flatMap(item => {
      const article = available.get(item.id)
      return article ? [article] : []
    })
    .slice(0, 4)

  return { startDate: snapshot.startDate, endDate: snapshot.endDate, articles }
}
