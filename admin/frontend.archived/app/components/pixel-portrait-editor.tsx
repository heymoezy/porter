import { useState, useCallback } from "react"
import { PixelPortrait } from "~/components/pixel-portrait"
import { cn } from "~/lib/utils"

type HairStyle = "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"

interface AppearanceSpec {
  skin: string
  hair: string
  eyes: string
  shirt: string
  hairStyle: HairStyle
}

interface PixelPortraitEditorProps {
  value: AppearanceSpec
  onChange: (spec: AppearanceSpec) => void
  className?: string
}

const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
  { id: "mohawk", label: "Mohawk" },
  { id: "parted", label: "Parted" },
  { id: "buzz", label: "Buzz" },
  { id: "curly", label: "Curly" },
  { id: "ponytail", label: "Ponytail" },
  { id: "bald", label: "Bald" },
]

const SKIN_PRESETS = [
  "#FFDBB4", "#F5C6A0", "#E0AC69", "#C68642", "#8D5524", "#5C3317",
]

const HAIR_PRESETS = [
  "#2C1B18", "#4A2912", "#8B4513", "#D4A76A", "#E8C86A", "#C0392B",
  "#7F8C8D", "#F5F5F5", "#6366F1", "#EC4899", "#10B981", "#F59E0B",
]

const EYE_PRESETS = [
  "#1E3A5F", "#334155", "#3B82F6", "#10B981", "#8B4513", "#1A1A1A",
]

const SHIRT_PRESETS = [
  "#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899",
  "#8B5CF6", "#64748B", "#1E293B", "#F5F5F5", "#D946EF", "#14B8A6",
]

function ColorGrid({
  colors,
  selected,
  onSelect,
  label,
}: {
  colors: string[]
  selected: string
  onSelect: (color: string) => void
  label: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <div
            className="h-4 w-4 rounded border border-border2"
            style={{ background: selected }}
          />
          <input
            type="text"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            className="w-[72px] rounded border border-border2 bg-raised px-1.5 py-0.5 font-mono text-2xs text-foreground focus:border-accent-porter focus:outline-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            className={cn(
              "h-6 w-6 rounded-md border-2 transition-all duration-150",
              selected === c
                ? "border-accent-porter scale-110 shadow-[var(--shadow-glow)]"
                : "border-transparent hover:border-border2 hover:scale-105"
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  )
}

export function PixelPortraitEditor({ value, onChange, className }: PixelPortraitEditorProps) {
  const update = useCallback(
    (patch: Partial<AppearanceSpec>) => onChange({ ...value, ...patch }),
    [value, onChange]
  )

  return (
    <div className={cn("flex gap-6", className)}>
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <PixelPortrait
            {...value}
            size="lg"
            isAnimated
          />
        </div>
        <div className="flex gap-1.5">
          <PixelPortrait {...value} size="md" />
          <PixelPortrait {...value} size="sm" />
        </div>
        <p className="text-2xs text-text3">Live preview — all sizes</p>
      </div>

      {/* Controls */}
      <div className="flex-1 space-y-4">
        {/* Hair Style */}
        <div className="space-y-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">
            Hair Style
          </span>
          <div className="flex flex-wrap gap-1">
            {HAIR_STYLES.map((hs) => (
              <button
                key={hs.id}
                onClick={() => update({ hairStyle: hs.id })}
                className={cn(
                  "rounded-md px-2.5 py-1 text-2xs font-medium transition-all duration-150",
                  value.hairStyle === hs.id
                    ? "bg-accent-porter/15 text-accent-porter border border-accent-porter/30"
                    : "bg-raised text-text2 border border-transparent hover:bg-border hover:text-foreground"
                )}
              >
                {hs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color pickers */}
        <ColorGrid
          label="Skin"
          colors={SKIN_PRESETS}
          selected={value.skin}
          onSelect={(skin) => update({ skin })}
        />
        <ColorGrid
          label="Hair Color"
          colors={HAIR_PRESETS}
          selected={value.hair}
          onSelect={(hair) => update({ hair })}
        />
        <ColorGrid
          label="Eyes"
          colors={EYE_PRESETS}
          selected={value.eyes}
          onSelect={(eyes) => update({ eyes })}
        />
        <ColorGrid
          label="Shirt"
          colors={SHIRT_PRESETS}
          selected={value.shirt}
          onSelect={(shirt) => update({ shirt })}
        />
      </div>
    </div>
  )
}

/** Standalone demo wrapper with internal state */
export function PixelPortraitEditorDemo() {
  const [spec, setSpec] = useState<AppearanceSpec>({
    skin: "#E0AC69",
    hair: "#2C1B18",
    eyes: "#334155",
    shirt: "#6366F1",
    hairStyle: "short",
  })

  return <PixelPortraitEditor value={spec} onChange={setSpec} />
}
