/**
 * #27 R3 — the first product-native surface.
 *
 * Council design: "R3 — Reframe Dashboard: move Dashboard widgets into per-product
 * Overview; filter data by selected product; ADD SCOPE LADDER BADGE. First
 * product-native page ships."
 *
 * Two things, both keyed off the product picked in the top-bar switcher (R1):
 *
 *  1. SCOPE LADDER — the admin always tells you which product you are looking at
 *     and the scope it resolves to. Porter is multi-app; a page that doesn't say
 *     which app it means is lying by omission.
 *
 *  2. HOT CONTEXT — the warm packet for that product (#37): where the last session
 *     got to and any handoff it left. The admin now shows the SAME memory your
 *     claude/codex/grok sessions open with. One brain, two windows onto it.
 *
 * Additive and fail-open: no product selected, or Porter unreachable, and this
 * degrades to a quiet empty state. It never breaks the dashboard.
 */
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Boxes, Brain, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { api } from "~/lib/api"

const LS_KEY = "porter.activeProduct"

interface Hot {
  status: "warm" | "cold"
  project: string | null
  body: string | null
  approxTokens: number
  updatedAt: string | null
  sourceGateway: string | null
  hints?: string[]
}

/** The product chosen in the top-bar switcher (R1). Re-reads on focus so the
 *  two surfaces never disagree about what we're looking at. */
function useActiveProduct(): string | null {
  const [p, setP] = useState<string | null>(
    typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null,
  )
  useEffect(() => {
    const read = () => setP(window.localStorage.getItem(LS_KEY))
    window.addEventListener("focus", read)
    window.addEventListener("storage", read)
    return () => {
      window.removeEventListener("focus", read)
      window.removeEventListener("storage", read)
    }
  }, [])
  return p && p.length > 0 ? p : null
}

export function ProductOverview() {
  const product = useActiveProduct()

  const { data: hot } = useQuery({
    queryKey: ["v1", "hot", product],
    enabled: !!product,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api<{ data?: Hot } & Hot>(
        `/api/v1/intellect/hot?project=${encodeURIComponent(product as string)}`,
      ).catch(() => null)
      if (!res) return null
      return ((res as { data?: Hot }).data ?? (res as Hot)) as Hot
    },
  })

  if (!product) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Boxes className="h-3.5 w-3.5 text-accent-porter" />
            Product
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-text3">
            No product selected. Pick one in the top bar — the admin and your CLI sessions share the same context.
          </p>
        </CardContent>
      </Card>
    )
  }

  // "Where we got to" — pull the checkpoint + handoff lines out of the packet.
  const lines = (hot?.body ?? "").split("\n")
  const checkpoint = lines.find((l) => l.startsWith("## 20")) ?? null
  const handoff = lines.find((l) => l.includes("**handoff**")) ?? null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <Boxes className="h-3.5 w-3.5 text-accent-porter" />
            {product}
          </span>
          {/* Scope ladder — always say which product this page means. */}
          <span className="flex items-center gap-1 text-2xs text-text3">
            porter <ArrowRight className="h-2.5 w-2.5" /> {product}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-1.5 text-2xs">
          <Brain className="h-3 w-3 text-text3" />
          <span className="text-text3">Memory:</span>
          {hot?.status === "warm" ? (
            <span className="text-emerald-400">
              warm · {hot.approxTokens} tok
              {hot.sourceGateway ? ` · last by ${hot.sourceGateway}` : ""}
            </span>
          ) : (
            <span className="text-text3">cold — warms after one session ends</span>
          )}
        </div>

        {checkpoint && (
          <div>
            <div className="text-2xs uppercase tracking-wide text-text3 mb-0.5">Where we got to</div>
            <p className="text-xs text-text2 line-clamp-2">{checkpoint.replace(/^##\s*/, "")}</p>
          </div>
        )}

        {handoff && (
          <div>
            <div className="text-2xs uppercase tracking-wide text-text3 mb-0.5">Handoff for the next session</div>
            <p className="text-xs text-amber-300/90 line-clamp-3">
              {handoff.replace(/^-\s*\*\*handoff\*\*\s*/, "").replace(/^\([^)]*\):\s*/, "")}
            </p>
          </div>
        )}

        {hot?.status === "cold" && (
          <p className="text-xs text-text3">
            This product has no hot context yet. It fills itself when a session ends.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
