import { useParams, Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { PixelPortrait } from "~/components/pixel-portrait"
import { ArrowLeft, Shield, Zap, FileInput, FileOutput, MessageSquare } from "lucide-react"

interface TemplateDetail {
  id: string
  name: string
  cat: string
  desc: string
  soul: string[]
  mission: string
  inputs: string[]
  outputs: string[]
  authority: string[]
  tags: string[]
  archetype: string
  appearance_spec: Record<string, string>
  communication_style: string
}

const archetypeColors: Record<string, string> = {
  navigator: "bg-blue-500/15 text-blue-400",
  operator: "bg-emerald-500/15 text-emerald-400",
  maker: "bg-purple-500/15 text-purple-400",
  auditor: "bg-amber-500/15 text-amber-400",
  warden: "bg-red-500/15 text-red-400",
  scholar: "bg-cyan-500/15 text-cyan-400",
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">{label}</p>
      {children}
    </div>
  )
}

function TemplateDetailContent() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "templates", "detail", id],
    queryFn: () => api<TemplateDetail>(`/api/admin/templates/${id}`),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-xs text-danger">Template not found — is Porter.py running?</p>
        <Link to="/templates" className="text-xs text-accent-porter hover:underline mt-2 inline-block">Back to templates</Link>
      </div>
    )
  }

  const t = data
  const spec = t.appearance_spec || {}

  return (
    <div className="space-y-2">
      {/* Back */}
      <Link to="/templates" className="flex items-center gap-1 text-xs text-text3 hover:text-accent-porter transition-colors">
        <ArrowLeft className="size-3" /> Templates
      </Link>

      {/* Hero */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          <PixelPortrait
            hair={spec.hair || "#2c1b18"}
            skin={spec.skin || "#f1c27d"}
            eyes={spec.eyes || "#1a1a2e"}
            shirt={spec.shirt || "#64748b"}
            hairStyle={(["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style) ? spec.hair_style : "short") as "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"}
            size="md"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text">{t.name}</h2>
              <Badge className={`text-[10px] border-0 ${archetypeColors[t.archetype] || "bg-text3/15 text-text3"}`}>
                {t.archetype}
              </Badge>
              <Badge className="text-[10px] bg-text3/15 text-text3 border-0">{t.cat}</Badge>
            </div>
            <p className="text-xs text-text3 mt-0.5">{t.desc}</p>
            {t.communication_style && (
              <div className="flex items-center gap-1.5 mt-1">
                <MessageSquare className="size-2.5 text-text3" />
                <p className="text-[10px] text-text3 italic">{t.communication_style}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Identity sections */}
      <div className="grid grid-cols-2 gap-2">
        {/* Soul */}
        {t.soul?.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <Section label="Soul — who this agent is">
              <div className="space-y-1">
                {t.soul.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Shield className="size-2.5 text-accent-porter mt-0.5 shrink-0" />
                    <span className="text-xs text-text2">{s}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* Mission */}
        {t.mission && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <Section label="Mission — what this agent does">
              <p className="text-xs text-text2 leading-relaxed">{t.mission}</p>
            </Section>
          </div>
        )}
      </div>

      {/* Inputs / Outputs / Authority */}
      <div className="grid grid-cols-3 gap-2">
        {t.inputs?.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <Section label="Inputs">
              {t.inputs.map((inp, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <FileInput className="size-2.5 text-text3" />
                  <span className="text-xs text-text2">{inp}</span>
                </div>
              ))}
            </Section>
          </div>
        )}

        {t.outputs?.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <Section label="Outputs">
              {t.outputs.map((out, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <FileOutput className="size-2.5 text-text3" />
                  <span className="text-xs text-text2">{out}</span>
                </div>
              ))}
            </Section>
          </div>
        )}

        {t.authority?.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <Section label="Authority">
              {t.authority.map((a, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <Zap className="size-2.5 text-warning" />
                  <span className="text-xs text-text2">{a}</span>
                </div>
              ))}
            </Section>
          </div>
        )}
      </div>

      {/* Tags */}
      {t.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {t.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TemplateDetailPage() {
  return (
    <AdminShell>
      <TemplateDetailContent />
    </AdminShell>
  )
}
