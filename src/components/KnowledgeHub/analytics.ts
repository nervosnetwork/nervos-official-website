import { IS_PROD } from '../../utils/env'

export type ArticleAnalyticsContext = {
  placement: string
  hub_id?: string
  subject_id?: string
  step?: number
}

type KBEvents = {
  kb_cta_click: { cta_id: string; placement: string }
  kb_hub_click: { hub_id: string; placement: string }
  kb_subject_select: { hub_id: string; subject_id: string; placement: string }
  kb_article_click: ArticleAnalyticsContext & { article_id: string }
  kb_search_submit: { placement: string; query_length_bucket: string }
  kb_layout_change: { placement: string; layout: 'grid' | 'list'; columns?: number }
  kb_filter_open: { placement: string }
  kb_pagination_click: { placement: string; page: number }
  kb_step_select: { step: number }
  kb_toc_click: { article_id: string; section_index: number; placement: 'desktop' | 'mobile' }
  kb_resource_click: { resource_id: string; placement: string }
  kb_footer_link_click: { group: string; link_id: string }
  kb_social_click: { network: string; placement: string }
  kb_newsletter_submit: { placement: 'signal' | 'footer' }
  kb_newsletter_result: { placement: 'signal' | 'footer'; outcome: 'accepted' | 'error' }
  kb_back_to_top: { article_id: string }
}

// Explicit per-event allowlists: never spread form data, search text, titles or URLs into an event.
const fields: { [Event in keyof KBEvents]: readonly (keyof KBEvents[Event])[] } = {
  kb_cta_click: ['cta_id', 'placement'],
  kb_hub_click: ['hub_id', 'placement'],
  kb_subject_select: ['hub_id', 'subject_id', 'placement'],
  kb_article_click: ['article_id', 'placement', 'hub_id', 'subject_id', 'step'],
  kb_search_submit: ['placement', 'query_length_bucket'],
  kb_layout_change: ['placement', 'layout', 'columns'],
  kb_filter_open: ['placement'],
  kb_pagination_click: ['placement', 'page'],
  kb_step_select: ['step'],
  kb_toc_click: ['article_id', 'section_index', 'placement'],
  kb_resource_click: ['resource_id', 'placement'],
  kb_footer_link_click: ['group', 'link_id'],
  kb_social_click: ['network', 'placement'],
  kb_newsletter_submit: ['placement'],
  kb_newsletter_result: ['placement', 'outcome'],
  kb_back_to_top: ['article_id'],
}

export function searchLengthBucket(query: string) {
  const length = query.trim().length
  return length === 0 ? 'empty' : length <= 10 ? '1-10' : length <= 30 ? '11-30' : '31-plus'
}

type TrackerPayload = Record<string, unknown>
type Umami = { track: (payload: (defaults: TrackerPayload) => TrackerPayload) => unknown }

export function trackKBEvent<Event extends keyof KBEvents>(name: Event, values: KBEvents[Event]): void {
  if (!IS_PROD || typeof window === 'undefined') return

  try {
    const umami = (window as typeof window & { umami?: Umami }).umami
    if (typeof umami?.track !== 'function') return

    const data: Record<string, string | number> = {}
    for (const field of fields[name]) {
      const value = values[field]
      if (typeof value === 'string' && value.length <= 200 && !/[\r\n@?=#]/.test(value)) data[String(field)] = value
      else if (typeof value === 'number' && Number.isFinite(value)) data[String(field)] = value
    }

    // Capture before navigation. Umami's default URL/referrer may contain search queries;
    // override that context too, rather than only sanitizing the custom data object.
    const url = window.location.pathname
    const result = umami.track(defaults => ({
      website: defaults.website,
      hostname: defaults.hostname,
      language: defaults.language,
      screen: defaults.screen,
      url,
      title: 'Knowledge Base',
      referrer: '',
      name,
      data,
    }))
    // Tracking is best-effort and must never block navigation, forms, or other UI actions.
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => undefined)
    }
  } catch {
    // Missing, blocked, outdated, or failing analytics must not affect the website.
  }
}
