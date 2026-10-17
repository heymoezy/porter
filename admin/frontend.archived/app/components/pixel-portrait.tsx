import { useId, useMemo } from "react"
import { cn } from "~/lib/utils"
import { statusDotClass } from "~/components/ui/status-badge"
import { renderPortraitSvg, type PortraitSpec } from "../../../../backend/src/lib/portrait"

/**
 * An agent's or a person's face. The name is historical: this was a 16x24 pixel figure until
 * v6.163.0. The drawing now comes from `backend/src/lib/portrait.ts`, the same renderer behind
 * `GET /api/v1/portraits/render.svg`, so a face here and a face sent anywhere else are one drawing.
 *
 * The renderer validates every colour and style before it writes markup, which is what makes the
 * injection below safe: nothing the caller passes reaches the HTML unchecked.
 */
export type PixelPortraitProps = Partial<PortraitSpec> & {
  size?: "xs" | "sm" | "md" | "lg"
  isAnimated?: boolean
  status?: "idle" | "working" | "error" | "offline"
  /** Accessible name; without one the face is decorative. */
  title?: string
  className?: string
}

const sizePx = { xs: 28, sm: 48, md: 72, lg: 96 }

export function PixelPortrait({
  size = "md",
  isAnimated = false,
  status,
  title,
  className,
  ...spec
}: PixelPortraitProps) {
  const uid = useId()
  const px = sizePx[size]
  const svg = useMemo(
    () => renderPortraitSvg(spec, { uid, size: px, title }),
    // The spec is a handful of strings; serialising it is the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(spec), uid, px, title],
  )

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <span
        className={cn("block shrink-0 leading-none", isAnimated && status === "working" && "animate-pixel-walk")}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {status && (
        <div
          className={cn(
            "rounded-full",
            size === "xs" || size === "sm" ? "h-1.5 w-1.5" : size === "md" ? "h-2 w-2" : "h-2.5 w-2.5",
            statusDotClass(status),
            status === "working" && "animate-pulse-badge"
          )}
        />
      )}
    </div>
  )
}
