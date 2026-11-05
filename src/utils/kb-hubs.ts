import { KB_HUBS } from '../../config/kb-hubs.mjs'

export { KB_HUBS }

export type KBHub = (typeof KB_HUBS)[number]

// Exact matching intentionally rejects empty/repeated query values, typos and
// arbitrary strings. Only legacy query selectors may use the display name.
export function resolveKBHub(value: unknown): KBHub | null {
  return typeof value === 'string' ? (KB_HUBS.find(hub => hub.id === value || hub.name === value) ?? null) : null
}

export function kbHubPath(value: KBHub['id']): string
export function kbHubPath(value: unknown): string | null
export function kbHubPath(value: unknown): string | null {
  const hub = resolveKBHub(value)
  return hub ? `/knowledge-base/topic/${hub.id}` : null
}
