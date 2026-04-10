import { cn } from "~/lib/utils"

interface PorterLogoProps {
  size?: "sm" | "md" | "lg"
  showText?: boolean
  className?: string
}

const sizes = {
  sm: { mark: 24, text: "text-sm" },
  md: { mark: 34, text: "text-lg" },
  lg: { mark: 40, text: "text-xl" },
}

export function PorterLogo({ size = "md", showText = true, className }: PorterLogoProps) {
  const s = sizes[size]

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Exact porter.py logo mark — P letterform */}
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 34 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect width="34" height="34" rx="8" className="fill-accent-porter" />
        {/* stem */}
        <rect x="10" y="9" width="4" height="16" rx="1.5" fill="white" />
        {/* bowl top bar */}
        <rect x="10" y="9" width="10" height="4" rx="1.5" fill="white" />
        {/* bowl bottom bar */}
        <rect x="10" y="16" width="10" height="4" rx="1.5" fill="white" />
        {/* bowl right vertical */}
        <rect x="20" y="9" width="4" height="11" rx="1.5" fill="white" />
      </svg>
      {showText && (
        <span
          className={cn(
            "font-bold tracking-[-0.4px] text-foreground",
            s.text,
          )}
        >
          Porter
        </span>
      )}
    </div>
  )
}
