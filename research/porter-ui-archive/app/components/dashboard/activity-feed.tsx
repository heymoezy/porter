import { Loader2 } from "lucide-react"
import { PixelPortrait } from "~/components/pixel-portrait"

export interface ActivityItem {
  agent: string
  action: string
  skin: string
  hair: string
  shirt: string
  eyes: string
  hs: "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"
  status: "complete" | "working" | "queued"
  _key: number
  _sec: number
}

interface ActivityFeedProps {
  items: ActivityItem[]
  elapsed: number
  maxItems?: number
}

function timeAgo(s: number) {
  return s < 60 ? "now" : s < 120 ? "1m" : `${Math.floor(s / 60)}m`
}

export function ActivityFeed({ items, elapsed, maxItems = 6 }: ActivityFeedProps) {
  return (
    <div className="min-w-0 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
          Activity
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-badge" />
        </h2>
        <button className="text-[10px] text-text3 hover:text-accent-porter transition-colors">all &rarr;</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        {items.map((e, i) => (
          <div
            key={e._key}
            className={`flex items-center gap-2 rounded-md py-1.5 px-2 cursor-pointer hover:bg-raised/50 ${
              i === 0
                ? "animate-slide-down"
                : "transition-all duration-[var(--duration-slow)] ease-out"
            }`}
          >
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${
                e.status === "working"
                  ? "bg-accent-porter animate-pulse-badge"
                  : e.status === "complete"
                  ? "bg-success"
                  : "bg-border2"
              }`}
            />
            <PixelPortrait
              skin={e.skin}
              hair={e.hair}
              eyes={e.eyes}
              shirt={e.shirt}
              hairStyle={e.hs}
              size="sm"
              isAnimated={e.status === "working"}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-foreground break-words">
                <span className="font-bold">{e.agent}</span> {e.action}
              </p>
            </div>
            {e.status === "working" && (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-accent-porter shrink-0" />
            )}
            <span className="text-[8px] text-text3 shrink-0">
              {i === 0 ? "now" : timeAgo(e._sec + elapsed)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
