import { cn } from "~/lib/utils"
import { PixelPortrait } from "~/components/pixel-portrait"

type HairStyle = "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"

interface BirthAnimationProps {
  name: string
  appearance: { skin: string; hair: string; eyes: string; shirt: string; hairStyle: HairStyle }
  bornAt: string
  className?: string
}

function BirthAnimation({ name, appearance, bornAt, className }: BirthAnimationProps) {
  return (
    <div className={cn("relative flex flex-col items-center gap-2", className)}>
      {/* Flash burst */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="size-20 rounded-full bg-[var(--forge-mint)]/20 animate-[forge-birth-flash_1.2s_ease-out_forwards]" />
      </div>

      {/* Portrait resolving */}
      <div className="animate-forge-birth">
        <PixelPortrait {...appearance} size="md" />
      </div>

      {/* Name */}
      <span className="text-sm font-bold text-text animate-forge-scramble">{name}</span>

      {/* Birth stamp */}
      <span className="text-2xs text-text2 font-mono animate-forge-stamp">
        Born {bornAt}
      </span>
    </div>
  )
}

export { BirthAnimation }
export type { BirthAnimationProps }
