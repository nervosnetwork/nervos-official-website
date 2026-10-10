interface Node {
  type: string
  value?: string
  depth?: number
  children?: Node[]
  data?: { hProperties?: Record<string, string> }
}
export function headingTree(tree: unknown) {
  const headings: { id: string; label: string }[] = []
  const text = (node: Node): string => node.value || node.children?.map(text).join('') || ''
  const visit = (node: Node) => {
    if (node.type === 'heading') {
      const id = `section-${headings.length + 1}`
      headings.push({ id, label: text(node) })
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
    }
    node.children?.forEach(visit)
  }
  visit(tree as Node)
  return headings
}
export function headingPlugin() {
  return (tree: unknown) => {
    headingTree(tree)
  }
}
