export interface PassiveTreeViewProps {
  nodes: Array<{ node_id: string; unlocked: boolean; active: boolean; unlocked_at?: string }>
  agentLevel: number
}

const NODE_DEFS: Record<string, { label: string; effect: string; unlockLevel: number }> = {
  "autonomous-routing": { label: "Auto Routing",     effect: "+12% efficiency",    unlockLevel: 5 },
  "context-anchor":     { label: "Context Anchor",   effect: "No quality decay",   unlockLevel: 10 },
  "fail-fast-guard":    { label: "Fail Fast",        effect: "-18% hallucination", unlockLevel: 15 },
  "cost-optimizer":     { label: "Cost Optimizer",   effect: "Cheapest viable",    unlockLevel: 20 },
  "deep-memory":        { label: "Deep Recall",      effect: "Full history",       unlockLevel: 25 },
  "team-synergy":       { label: "Team Synergy",     effect: "+10% bonded",        unlockLevel: 30 },
  "battle-hardened":    { label: "Hardened",          effect: "+5% all in arena",   unlockLevel: 0 },  // 10 battle wins
  "specialist-focus":   { label: "Specialist",        effect: "+15% top domain",    unlockLevel: 0 },  // 50 domain dispatches
}

const NODE_ORDER = Object.keys(NODE_DEFS)

type NodeState = "active" | "unlocked" | "locked"

function resolveNodeState(
  nodeId: string,
  nodesMap: Map<string, { unlocked: boolean; active: boolean }>,
): NodeState {
  const n = nodesMap.get(nodeId)
  if (!n) return "locked"
  if (n.active) return "active"
  if (n.unlocked) return "unlocked"
  return "locked"
}

function nodeCircleClass(state: NodeState): string {
  switch (state) {
    case "active":   return "bg-accent-porter"
    case "unlocked": return "bg-raised border border-success"
    case "locked":   return "bg-raised/40 border border-border/30"
  }
}

function nodeWrapperClass(state: NodeState): string {
  switch (state) {
    case "active":   return "opacity-100"
    case "unlocked": return "opacity-100"
    case "locked":   return "opacity-60"
  }
}

function nodeLabelClass(state: NodeState): string {
  switch (state) {
    case "active":   return "text-white"
    case "unlocked": return "text-foreground"
    case "locked":   return "text-text3"
  }
}

export function PassiveTreeView({ nodes, agentLevel: _agentLevel }: PassiveTreeViewProps) {
  // Build a fast lookup map; skip node_ids not in NODE_DEFS
  const nodesMap = new Map<string, { unlocked: boolean; active: boolean }>()
  for (const n of nodes ?? []) {
    if (NODE_ORDER.includes(n.node_id)) {
      nodesMap.set(n.node_id, { unlocked: n.unlocked, active: n.active })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-bold uppercase tracking-widest text-text3">Passive Tree</span>
      <div className="grid grid-cols-4 gap-2">
        {NODE_ORDER.map((nodeId) => {
          const def = NODE_DEFS[nodeId]
          const state = resolveNodeState(nodeId, nodesMap)
          const title = `${def.label}: ${def.effect}${def.unlockLevel > 0 ? ` (Level ${def.unlockLevel})` : ""}`

          return (
            <div
              key={nodeId}
              className={`flex flex-col items-center gap-1 p-1.5 rounded cursor-default ${nodeWrapperClass(state)}`}
              title={title}
            >
              <div className={`size-5 rounded-full ${nodeCircleClass(state)}`} />
              <span className={`text-xs text-center leading-tight ${nodeLabelClass(state)}`}>
                {def.label}
              </span>
              {def.unlockLevel > 0 && (
                <span className="text-2xs text-text3">Lv. {def.unlockLevel}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
