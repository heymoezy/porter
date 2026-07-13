/**
 * #27 R1 — global tenant/product context switcher.
 *
 * Council-ratified design (planning/porter-admin-reframe-27.md):
 *   "R1 — Add context foundation: global tenant/product selector; persist selected
 *    context; route context plumbing; NO OLD NAV REMOVED. Shippable because
 *    existing pages still work unchanged."
 *
 * This is deliberately ADDITIVE. It removes nothing. The destructive folds
 * (R5/R6/R10 delete Brain/Recall/Bridge) require Moe's sign-off and are NOT
 * part of this release.
 *
 * Porter is multi-app: ymc.capital, themozaic, baanyindee, askporter… but the
 * admin has always shown one undifferentiated blob. This is the first surface
 * that admits the real architecture: you are always looking at *some* product.
 *
 * Selection persists to the SAME pin the CLIs use
 * (POST /api/v1/intellect/active-project), so the admin and every Claude/codex/
 * grok session agree on "what are we working on" — one context, not two.
 */
import { useEffect, useRef, useState } from "react"
import { Boxes, Check, ChevronDown } from "lucide-react"
import { api } from "~/lib/api"

interface Project {
  id: string
  name: string
  status?: string
}

interface ActiveProject {
  project?: string | null
  subproject?: string | null
  scope?: string | null
  source?: string | null
}

const LS_KEY = "porter.activeProduct"

export function ContextSwitcher() {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<string | null>(
    typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null,
  )
  const [scope, setScope] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  // Load the product list + whatever context Porter already resolved (cwd pin,
  // session pin, global pin). Fail-open: an empty list must not break the shell.
  useEffect(() => {
    void (async () => {
      try {
        const list = await api<Project[]>("/api/v1/projects").catch(() => [])
        setProjects(Array.isArray(list) ? list : [])
      } catch { /* fail-open */ }
      try {
        const res = await api<{ data?: ActiveProject } & ActiveProject>("/api/v1/intellect/active-project")
        const ap = (res as { data?: ActiveProject })?.data ?? (res as ActiveProject)
        if (ap?.project) {
          setActive((cur) => cur ?? ap.project ?? null)
          setScope(ap.scope ?? null)
        }
      } catch { /* fail-open */ }
    })()
  }, [])

  async function select(name: string) {
    setActive(name)
    setOpen(false)
    try { window.localStorage.setItem(LS_KEY, name) } catch { /* ignore */ }
    // Pin to the SAME context the CLI sessions read — one truth, not two.
    try {
      await api("/api/v1/intellect/active-project", {
        method: "POST",
        json: { project: name, set_by: "porter-admin" },
      })
    } catch { /* fail-open: the UI still reflects the choice */ }
  }

  const label = active ?? "All products"

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-text1 hover:bg-white/10 transition-colors"
        title="Select the product/tenant context (shared with your CLI sessions)"
      >
        <Boxes size={15} className="opacity-70" />
        <span className="font-medium">{label}</span>
        {scope ? <span className="text-xs text-text3">· {scope}</span> : null}
        <ChevronDown size={14} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-white/10 bg-[#0f1420] shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-text3 border-b border-white/5">
            Product context
          </div>
          <button
            onClick={() => select("")}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-text2 hover:bg-white/5"
          >
            <span>All products</span>
            {!active && <Check size={14} className="text-emerald-400" />}
          </button>
          {projects.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text3">No products registered yet.</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => select(p.name)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-text2 hover:bg-white/5"
              >
                <span className="truncate">{p.name}</span>
                {active === p.name && <Check size={14} className="text-emerald-400" />}
              </button>
            ))
          )}
          <div className="px-3 py-2 text-[11px] text-text3 border-t border-white/5">
            Shared with your CLI sessions (same active-project pin).
          </div>
        </div>
      )}
    </div>
  )
}
