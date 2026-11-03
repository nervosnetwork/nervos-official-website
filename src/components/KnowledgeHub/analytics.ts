import { IS_PROD } from '../../utils/env'
import { analyticsText, analyticsURL, GA_ENABLED, trackGAEvent } from '../../utils/ga'

export const KB_ANALYTICS_ENABLED = IS_PROD || GA_ENABLED

export type ArticleAnalyticsContext = {
  placement: string
  hub_id?: string
  subject_id?: string
  step?: number
  position?: number
}

type KBEvents = {
  kb_cta_click: {
    cta_id: string
    placement: string
    experiment_id?: string
    variant?: 'A' | 'B'
    article_id?: string
    layout?: 'desktop' | 'inline'
  }
  kb_experiment_view: { experiment_id: string; variant: 'A' | 'B'; article_id: string; layout: 'desktop' | 'inline' }
  kb_hub_click: { hub_id: string; placement: string }
  kb_subject_select: { hub_id: string; subject_id: string; placement: string }
  kb_article_click: ArticleAnalyticsContext & { article_id: string }
  kb_search_submit: { placement: string; query_length_bucket: string; search_term?: string; results_count?: number }
  kb_layout_change: { placement: string; layout: 'grid' | 'list'; columns?: number }
  kb_filter_open: { placement: string; page_type?: string; hub_id?: string }
  kb_pagination_click: { placement: string; page: number; direction?: 'previous' | 'next'; page_type?: string }
  kb_step_select: { step: number; step_name?: string }
  kb_toc_click: { article_id: string; section_index: number; placement: 'desktop' | 'mobile'; heading_text?: string }
  kb_resource_click: { resource_id: string; placement: string; link_url?: string }
  kb_footer_link_click: { group: string; link_id: string; link_text?: string; link_url?: string }
  kb_social_click: { network: string; placement: string; link_url?: string }
  kb_newsletter_submit: { placement: 'signal' | 'footer'; status: 'accepted' }
  kb_newsletter_result: { placement: 'signal' | 'footer'; outcome: 'accepted' | 'error' }
  kb_back_to_top: { article_id: string }
  link_click: { link_url: string; outbound: boolean; destination_category: string }
  scroll_depth: { percent_scrolled: number }
}

// Explicit per-event allowlists: never spread form data, search text, titles or URLs into an event.
const fields: { [Event in keyof KBEvents]: readonly (keyof KBEvents[Event])[] } = {
  kb_cta_click: ['cta_id', 'placement', 'experiment_id', 'variant', 'article_id', 'layout'],
  kb_experiment_view: ['experiment_id', 'variant', 'article_id', 'layout'],
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
  link_click: ['destination_category'],
  scroll_depth: ['percent_scrolled'],
}

// Preserve legacy Umami field names above; GA4 gets the agreed D-20 schema.
// Unknown properties and form values can never enter either payload.
export function gaEventData<Event extends keyof KBEvents>(name: Event, values: KBEvents[Event]) {
  const v = values as Record<string, unknown>
  const raw: Record<string, unknown> = {}
  const pageType =
    v.page_type ??
    ({ topic: 'hub', archive: 'all_articles', search: 'all_articles' }[String(v.placement)] || v.placement)
  switch (name) {
    case 'kb_article_click':
      Object.assign(raw, {
        article_slug: v.article_id,
        hub: v.hub_id ?? 'unassigned',
        click_source: v.placement,
        position: v.position,
      })
      break
    case 'kb_hub_click':
      Object.assign(raw, { hub: v.hub_id, click_source: v.placement })
      break
    case 'kb_subject_select':
      Object.assign(raw, { hub: v.hub_id, subject: v.subject_id })
      break
    case 'kb_cta_click':
      Object.assign(raw, {
        cta_name: v.cta_id,
        cta_location: v.placement,
        experiment_id: v.experiment_id,
        variant: v.variant,
        article_slug: v.article_id,
        layout: v.layout,
      })
      break
    case 'kb_experiment_view':
      Object.assign(raw, {
        experiment_id: v.experiment_id,
        variant: v.variant,
        article_slug: v.article_id,
        layout: v.layout,
      })
      break
    case 'kb_step_select':
      Object.assign(raw, { step_number: v.step, step_name: v.step_name })
      break
    case 'kb_resource_click':
      Object.assign(raw, {
        resource: { developer_docs: 'docs', ckba_membership: 'membership' }[String(v.resource_id)] || v.resource_id,
        link_url: v.link_url,
      })
      break
    case 'kb_social_click':
      Object.assign(raw, { network: v.network, link_url: v.link_url })
      break
    case 'kb_search_submit':
      Object.assign(raw, { search_term: analyticsText(v.search_term) ?? '[redacted]', results_count: v.results_count })
      break
    case 'kb_pagination_click':
      Object.assign(raw, { direction: v.direction, page_number: v.page, page_type: pageType })
      break
    case 'kb_footer_link_click':
      Object.assign(raw, { link_text: v.link_text, link_url: v.link_url })
      break
    case 'kb_toc_click':
      Object.assign(raw, { article_slug: v.article_id, heading_text: v.heading_text })
      break
    case 'kb_layout_change':
      Object.assign(raw, { layout: v.layout, columns: v.columns })
      break
    case 'kb_filter_open':
      Object.assign(raw, { page_type: pageType, hub: v.hub_id ?? 'none' })
      break
    case 'kb_back_to_top':
      Object.assign(raw, { article_slug: v.article_id })
      break
    case 'kb_newsletter_submit':
      Object.assign(raw, { form_location: v.placement, status: v.status })
      break
    case 'link_click': {
      const url = analyticsURL(String(v.link_url), typeof window === 'undefined' ? undefined : window.location.href)
      Object.assign(raw, { link_url: url, link_domain: url ? new URL(url).hostname : undefined, outbound: v.outbound })
      break
    }
    case 'scroll_depth':
      raw.percent_scrolled = v.percent_scrolled
      break
  }
  const data: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) data[key] = value
    else if (typeof value === 'boolean') data[key] = value
    else if (typeof value === 'string') {
      const safe =
        key === 'link_url'
          ? analyticsURL(value, typeof window === 'undefined' ? undefined : window.location.href)
          : analyticsText(value)
      if (safe) data[key] = safe
    }
  }
  return data
}

export function searchLengthBucket(query: string) {
  const length = query.trim().length
  return length === 0 ? 'empty' : length <= 10 ? '1-10' : length <= 30 ? '11-30' : '31-plus'
}

type TrackerPayload = Record<string, unknown>
type Umami = { track: (payload: (defaults: TrackerPayload) => TrackerPayload) => unknown }

export function trackKBEvent<Event extends keyof KBEvents>(name: Event, values: KBEvents[Event]): void {
  if (typeof window === 'undefined') return
  // This diagnostic remains Umami-only. The GA4 schema counts accepted
  // submissions, never failed attempts or an unconfirmed async import as delivery.
  if (GA_ENABLED && name !== 'kb_newsletter_result') {
    try {
      trackGAEvent(name, gaEventData(name, values))
    } catch {
      /* Analytics is optional. */
    }
  }
  if (!IS_PROD) return

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
