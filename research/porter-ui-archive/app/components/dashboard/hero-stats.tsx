import { useRef } from "react"
import { Users, DollarSign, Clock, Bot } from "lucide-react"
import { AnimCount } from "~/components/ui/anim-count"
import { PixelPortrait } from "~/components/pixel-portrait"

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

async function shareHeroOnX(heroEl: HTMLElement | null) {
  if (!heroEl) return
  try {
    const html2canvas = (await import("html2canvas")).default
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || "#111827"
    const canvas = await html2canvas(heroEl, { backgroundColor: bgColor, scale: 2 })
    const link = document.createElement("a")
    link.download = "porter-stats.png"
    link.href = canvas.toDataURL("image/png")
    link.click()
  } catch {}
}

interface HeroStatsProps {
  mounted: boolean
}

export function HeroStats({ mounted }: HeroStatsProps) {
  const heroRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={heroRef}
      className={`rounded-xl border border-accent-porter/20 bg-gradient-to-br from-accent-porter/8 via-surface to-background p-4 transition-all duration-700 ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ transitionDelay: "100ms" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-black tracking-tight text-accent-porter">askporter.app</p>
        <div className="flex-1" />
        <button
          onClick={() => shareHeroOnX(heroRef.current)}
          className="flex items-center gap-1.5 rounded-md border border-accent-porter/30 bg-accent-porter/5 px-2.5 py-1 text-[9px] font-bold text-accent-porter hover:bg-accent-porter/10 transition-all"
        >
          <XIcon className="h-2.5 w-2.5" /> Share
        </button>
      </div>

      {/* The money shot */}
      <div className="flex items-center gap-6 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-success/60">AI Team</p>
          <p className="text-4xl font-black text-success tabular-nums tracking-tighter leading-none">$5</p>
          <p className="text-[11px] font-bold text-success/60">/month</p>
        </div>
        <div className="text-2xl font-black text-text3/15">vs</div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-danger/60">Humans</p>
          <p className="text-4xl font-black text-danger/40 tabular-nums tracking-tighter leading-none line-through decoration-danger/30">$16k</p>
          <p className="text-[11px] font-bold text-danger/40">/month</p>
        </div>
        <div className="flex-1" />
        <div className="flex -space-x-2">
          {[
            { skin: "#F5D0A9", hair: "#2C1810", shirt: "#6366F1", hs: "short" as const },
            { skin: "#FDBCB4", hair: "#8B4513", shirt: "#22C55E", hs: "curly" as const },
            { skin: "#D4A574", hair: "#1A1A2E", shirt: "#F59E0B", hs: "mohawk" as const },
            { skin: "#E0AC69", hair: "#4A2912", shirt: "#3B82F6", hs: "long" as const },
          ].map((a, i) => (
            <div key={i} className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`} style={{ transitionDelay: `${600 + i * 100}ms` }}>
              <PixelPortrait skin={a.skin} hair={a.hair} eyes="#1A1A2E" shirt={a.shirt} hairStyle={a.hs} size="sm" isAnimated />
            </div>
          ))}
        </div>
      </div>

      {/* Impact metrics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-accent-porter/20 bg-accent-porter/3 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase text-text3/50">Tasks</p>
            <Bot className="h-3 w-3 text-accent-porter/30" />
          </div>
          <p className="text-lg font-black text-accent-porter tabular-nums"><AnimCount to={847} duration={2000} /></p>
          <p className="text-[9px] text-accent-porter/60">done autonomously</p>
        </div>
        <div className="rounded-lg border border-chart-2/20 bg-chart-2/3 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase text-text3/50">Hours</p>
            <Clock className="h-3 w-3 text-chart-2/30" />
          </div>
          <p className="text-lg font-black text-chart-2 tabular-nums"><AnimCount to={124} duration={1500} /></p>
          <p className="text-[9px] text-chart-2/60">saved this month</p>
        </div>
        <div className="rounded-lg border border-warning/20 bg-warning/3 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase text-text3/50">Saved</p>
            <DollarSign className="h-3 w-3 text-warning/30" />
          </div>
          <p className="text-lg font-black text-warning tabular-nums">$15.9k</p>
          <p className="text-[9px] text-warning/60">vs hiring humans</p>
        </div>
        <div className="rounded-lg border border-success/20 bg-success/3 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase text-text3/50">ROI</p>
            <Users className="h-3 w-3 text-success/30" />
          </div>
          <p className="text-lg font-black text-success tabular-nums">3,180x</p>
          <p className="text-[9px] text-success/60">return on $5</p>
        </div>
      </div>

    </div>
  )
}
