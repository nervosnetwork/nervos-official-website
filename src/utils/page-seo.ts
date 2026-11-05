export type StructuredDataNode = Record<string, unknown>

export type PageSEO = {
  canonical: string
  language: string
  alternates: { language: string; url: string }[]
  structuredData?: StructuredDataNode[]
}
