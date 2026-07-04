import { cn } from "~/lib/utils"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Link } from "react-router"

type OrgNodeState = "born" | "forging" | "ghost"

interface OrgNodeAgent {
  id?: string
  name: string
  role: string
  template?: string
  team: string
  appearance?: {
    skin?: string
    hair?: string
    eyes?: string
    shirt?: string
    hairStyle?: string
  }
  qualityScore?: number
  bornAt?: string
}

interface OrgNodeProps {
  agent: OrgNodeAgent
  state: OrgNodeState
  className?: string
  href?: string
  onClick?: () => void
}

type HairStyle = "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"

const defaultAppearance = {
  skin: "#f1c27d",
  hair: "#2c1b18",
  eyes: "#1a1a2e",
  shirt: "#64748b",
  hairStyle: "short" as HairStyle,
}

function OrgNode({ agent, state, className, href, onClick }: OrgNodeProps) {
  const ap = { ...defaultAppearance, ...agent.appearance, hairStyle: (agent.appearance?.hairStyle ?? defaultAppearance.hairStyle) as HairStyle }
  const isGhost = state === "ghost"
  const isForging = state === "forging"

  const inner = (
    <>
      {/* Portrait */}
      <div className={cn(
        "transition-all duration-300",
        isGhost && "grayscale opacity-35",
        isForging && "animate-forge-heat",
      )}>
        <PixelPortrait
          skin={ap.skin}
          hair={ap.hair}
          eyes={ap.eyes}
          shirt={ap.shirt}
          hairStyle={ap.hairStyle}
          size="sm"
        />
      </div>

      {/* Name + role */}
      <div className="text-center w-full">
        <span className={cn(
          "text-xs font-bold leading-none truncate block",
          isGhost ? "text-text3/50" : "text-text",
          "group-hover:text-accent-porter",
        )}>
          {agent.name}
        </span>
        {agent.role && (
          <span className={cn(
            "text-2xs leading-none truncate block",
            isGhost ? "text-text3/30" : "text-text3",
          )}>
            {agent.role}
          </span>
        )}
      </div>
    </>
  )

  const sharedClassName = cn(
    "flex flex-col items-center gap-1 transition-all duration-200 group",
    "w-[100px]",
    (onClick || href) && "cursor-pointer",
    className
  )

  if (href) {
    return <Link to={href} className={sharedClassName}>{inner}</Link>
  }

  return (
    <button type="button" onClick={onClick} className={sharedClassName}>
      {inner}
    </button>
  )
}

export { OrgNode }
export type { OrgNodeAgent, OrgNodeState }
