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
  // 8 sparks at evenly-spaced angles
  const sparks = [0, 45, 90, 135, 180, 225, 270, 315]

  return (
    <div className={cn("relative flex flex-col items-center gap-2", className)}>
      {/* Radial ring burst */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="size-24 rounded-full border-2 border-[var(--forge-ember)] animate-forge-birth-ring" />
      </div>

      {/* Spark particles */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {sparks.map(deg => (
          <div
            key={deg}
            className="absolute size-1.5 rounded-full bg-[var(--forge-ember)] animate-forge-birth-spark"
            style={{
              transform: `rotate(${deg}deg) translateY(-20px)`,
              animationDelay: `${deg / 360 * 400}ms`,
            }}
          />
        ))}
      </div>

      {/* Portrait: grayscale → color */}
      <div className="animate-forge-birth-grayscale">
        <PixelPortrait {...appearance} size="md" />
      </div>

      {/* Name */}
      <span className="text-sm font-bold text-text animate-forge-scramble">{name}</span>

      {/* Birth stamp */}
      <span className="text-2xs text-text2 font-mono animate-forge-stamp">Born {bornAt}</span>
    </div>
  )
}

export { BirthAnimation }
export type { BirthAnimationProps }
