import { cn } from "~/lib/utils"

interface PixelPortraitProps {
  skin: string
  hair: string
  eyes: string
  shirt: string
  hairStyle: "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"
  size?: "xs" | "sm" | "md" | "lg"
  isAnimated?: boolean
  status?: "idle" | "working" | "error" | "offline"
  className?: string
}

const sizePx = { xs: 28, sm: 48, md: 72, lg: 96 }

// Hair path data for each style (designed on 16x24 grid, head region 2-14 x 0-12)
function HairSvg({ style, color, w, h }: { style: string; color: string; w: number; h: number }) {
  // All hair is drawn on a 16x24 viewBox
  const px = w / 16
  switch (style) {
    case "short":
      return (
        <>
          <rect x={2 * px} y={0} width={12 * px} height={3 * px} rx={1} fill={color} />
          <rect x={1 * px} y={1 * px} width={2 * px} height={4 * px} rx={0.5} fill={color} />
          <rect x={13 * px} y={1 * px} width={2 * px} height={4 * px} rx={0.5} fill={color} />
        </>
      )
    case "long":
      return (
        <>
          <rect x={2 * px} y={0} width={12 * px} height={3 * px} rx={1} fill={color} />
          <rect x={1 * px} y={1 * px} width={2 * px} height={10 * px} rx={0.5} fill={color} />
          <rect x={13 * px} y={1 * px} width={2 * px} height={10 * px} rx={0.5} fill={color} />
        </>
      )
    case "mohawk":
      return (
        <>
          <rect x={6 * px} y={0} width={4 * px} height={1 * px} fill={color} />
          <rect x={5 * px} y={-2 * px} width={6 * px} height={3 * px} rx={1} fill={color} />
        </>
      )
    case "parted":
      return (
        <>
          <rect x={2 * px} y={0} width={5 * px} height={3 * px} rx={1} fill={color} />
          <rect x={9 * px} y={0} width={5 * px} height={2 * px} rx={1} fill={color} />
          <rect x={1 * px} y={1 * px} width={2 * px} height={5 * px} rx={0.5} fill={color} />
          <rect x={13 * px} y={1 * px} width={2 * px} height={4 * px} rx={0.5} fill={color} />
        </>
      )
    case "buzz":
      return (
        <rect x={2 * px} y={0} width={12 * px} height={2 * px} rx={1} fill={color} opacity={0.7} />
      )
    case "curly":
      return (
        <>
          <rect x={2 * px} y={0} width={3 * px} height={3 * px} rx={1.5} fill={color} />
          <rect x={5 * px} y={-0.5 * px} width={3 * px} height={3.5 * px} rx={1.5} fill={color} />
          <rect x={8 * px} y={0} width={3 * px} height={3 * px} rx={1.5} fill={color} />
          <rect x={11 * px} y={0} width={3 * px} height={3 * px} rx={1.5} fill={color} />
          <rect x={1 * px} y={1 * px} width={2 * px} height={5 * px} rx={1} fill={color} />
          <rect x={13 * px} y={1 * px} width={2 * px} height={5 * px} rx={1} fill={color} />
        </>
      )
    case "ponytail":
      return (
        <>
          <rect x={2 * px} y={0} width={12 * px} height={3 * px} rx={1} fill={color} />
          <rect x={12 * px} y={3 * px} width={3 * px} height={2 * px} rx={0.5} fill={color} />
          <rect x={14 * px} y={5 * px} width={2 * px} height={6 * px} rx={0.5} fill={color} />
        </>
      )
    case "bald":
    default:
      return null
  }
}

const statusColors: Record<string, string> = {
  idle: "bg-success",
  working: "bg-accent-porter animate-pulse-badge",
  error: "bg-danger",
  offline: "bg-text3",
}

export function PixelPortrait({
  skin,
  hair,
  eyes,
  shirt,
  hairStyle,
  size = "md",
  isAnimated = false,
  status,
  className,
}: PixelPortraitProps) {
  const h = sizePx[size]
  const w = Math.round(h * 0.667) // 2:3 aspect ratio
  const px = w / 16 // pixel unit

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className={cn(
          isAnimated && status === "working" && "animate-pixel-walk"
        )}
        style={{ imageRendering: "pixelated" }}
      >
        {/* Head */}
        <rect
          x={2 * px}
          y={2 * px}
          width={12 * px}
          height={10 * px}
          rx={2}
          fill={skin}
        />

        {/* Hair */}
        <HairSvg style={hairStyle} color={hair} w={w} h={h} />

        {/* Eyes */}
        <rect
          x={4 * px}
          y={6 * px}
          width={2 * px}
          height={2 * px}
          rx={0.5}
          fill={eyes}
        />
        <rect
          x={10 * px}
          y={6 * px}
          width={2 * px}
          height={2 * px}
          rx={0.5}
          fill={eyes}
        />

        {/* Body / shirt */}
        <rect
          x={1 * px}
          y={13 * px}
          width={14 * px}
          height={11 * px}
          rx={2}
          fill={shirt}
        />

        {/* Neck */}
        <rect
          x={6 * px}
          y={11 * px}
          width={4 * px}
          height={3 * px}
          fill={skin}
        />
      </svg>

      {/* Status dot */}
      {status && (
        <div
          className={cn(
            "rounded-full",
            size === "sm" ? "h-1.5 w-1.5" : size === "md" ? "h-2 w-2" : "h-2.5 w-2.5",
            statusColors[status]
          )}
        />
      )}
    </div>
  )
}
