import { cn } from "~/lib/utils"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Badge } from "~/components/ui/badge"
import { Link } from "react-router"

type StationState = "idle" | "active" | "complete" | "error"
type HairStyle = "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"

interface StationCardProps {
  name: string
  stationNumber: 1 | 2 | 3
  specialist: { name: string; template?: string; skin: string; hair: string; eyes: string; shirt: string; hairStyle: HairStyle }
  state: StationState
  action?: string
  model?: string
  processedCount?: number
  href?: string
  className?: string
}

function StationCard({ name, stationNumber, specialist, state, action, model, processedCount, href, className }: StationCardProps) {
  const isActive = state === "active"

  return (
    <div className={cn(
      "forge-panel relative rounded-xl p-2.5 w-[160px] transition-all duration-300",
      isActive && "forge-panel-active animate-forge-heat",
      state === "error" && "border-[var(--forge-danger)]/40",
      className
    )}>
      {/* Station number */}
      <div className="flex items-center justify-between mb-2">
        <Badge className="text-2xs px-1.5 py-0 h-4 bg-raised text-text2 border-0">
          Station {stationNumber}
        </Badge>
        {processedCount != null && (
          <span className="text-2xs text-text3 tabular-nums">{processedCount} done</span>
        )}
      </div>

      {/* Specialist portrait + name */}
      {href ? (
        <Link to={href} className="flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity">
          <div className={cn(isActive ? "" : "grayscale opacity-50")}>
            <PixelPortrait {...specialist} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-text truncate group-hover:text-accent-porter leading-none">{name}</p>
            <p className="text-2xs text-text3 truncate leading-none">{specialist.template || specialist.name}</p>
          </div>
        </Link>
      ) : (
        <div className="flex items-center gap-2 mb-2">
          <div className={cn(isActive ? "" : "grayscale opacity-50")}>
            <PixelPortrait {...specialist} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-text truncate leading-none">{name}</p>
            <p className="text-2xs text-text3 truncate leading-none">{specialist.template || specialist.name}</p>
          </div>
        </div>
      )}

      {/* Current action */}
      {action && (
        <p className={cn(
          "text-2xs leading-snug mt-1",
          isActive ? "text-[var(--forge-flame)]" : "text-text3"
        )}>
          {action}
        </p>
      )}

      {/* Model badge */}
      {model && isActive && (
        <Badge className="mt-1.5 text-2xs px-1.5 py-0 h-3.5 bg-accent-porter/15 text-accent-porter border-0">
          {model}
        </Badge>
      )}

      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-2 right-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--forge-ember)] opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--forge-ember)]" />
          </span>
        </div>
      )}
    </div>
  )
}

export { StationCard }
export type { StationCardProps, StationState }
