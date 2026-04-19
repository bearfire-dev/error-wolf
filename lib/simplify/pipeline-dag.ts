export type SimplifyPipelineNode = {
  id: string
  label: string
  dependsOn: string[]
}

export type DagLayoutNode = {
  id: string
  label: string
  dependsOn: string[]
  col: number
  row: number
  rowsInCol: number
}

export type DagLayout = {
  nodes: DagLayoutNode[]
  cols: number
  maxRows: number
}

/**
 * Assign each node a `col` (longest path from a root) and a `row`
 * (insertion order among nodes that share the same column).
 *
 * The algorithm is iterative, so a malformed descriptor (missing dep,
 * cycle) cannot wedge the UI — it just falls back to col 0 for stragglers.
 */
export function layoutDag(nodes: SimplifyPipelineNode[]): DagLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const colById = new Map<string, number>()

  const visiting = new Set<string>()

  function computeCol(id: string): number {
    const cached = colById.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    const node = byId.get(id)
    if (!node) return 0
    if (node.dependsOn.length === 0) {
      colById.set(id, 0)
      return 0
    }
    visiting.add(id)
    let max = -1
    for (const dep of node.dependsOn) {
      if (!byId.has(dep)) continue
      const depCol = computeCol(dep)
      if (depCol > max) max = depCol
    }
    visiting.delete(id)
    const col = max + 1
    colById.set(id, col)
    return col
  }

  for (const node of nodes) computeCol(node.id)

  const rowsByCol = new Map<number, number>()
  const laid: DagLayoutNode[] = nodes.map((node) => {
    const col = colById.get(node.id) ?? 0
    const row = rowsByCol.get(col) ?? 0
    rowsByCol.set(col, row + 1)
    return {
      id: node.id,
      label: node.label,
      dependsOn: node.dependsOn,
      col,
      row,
      rowsInCol: 0,
    }
  })

  const cols = (rowsByCol.size === 0 ? 0 : Math.max(...colById.values())) + 1
  let maxRows = 0
  for (const count of rowsByCol.values()) {
    if (count > maxRows) maxRows = count
  }

  for (const node of laid) {
    node.rowsInCol = rowsByCol.get(node.col) ?? 1
  }

  return { nodes: laid, cols, maxRows }
}
