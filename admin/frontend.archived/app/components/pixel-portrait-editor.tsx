import { useState, useCallback } from "react"
import { PixelPortrait } from "~/components/pixel-portrait"
import { TogglePillGroup } from "~/components/ui/toggle-pill-group"
import { cn } from "~/lib/utils"
import {
  ACCESSORIES, AGES, DEFAULT_SPEC, EXPRESSIONS, FACE_SHAPES, FACIAL_HAIR, HAIR_STYLES, OUTFITS, PRESETS,
  type PortraitSpec,
} from "../../../../backend/src/lib/portrait"

/**
 * The avatar editor. Every option list and swatch comes from the renderer module, so the editor
 * cannot offer a style the renderer does not draw. A stored spec missing the newer fields (face,
 * outfit and the rest) renders with the renderer's defaults, so older avatars keep working.
 */
export type AppearanceSpec = Partial<PortraitSpec> & Pick<PortraitSpec, "skin" | "hair" | "eyes" | "shirt" | "hairStyle">

interface PixelPortraitEditorProps {
  value: AppearanceSpec
  onChange: (spec: AppearanceSpec) => void
  className?: string
}

const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)
const options = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }))

function ColorGrid({
  colors,
  selected,
  onSelect,
  label,
}: {
  colors: readonly string[]
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

function OptionRow({ title, list, value, onChange }: {
  title: string
  list: readonly string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-text3">{title}</span>
      <TogglePillGroup options={options(list)} value={value} onChange={onChange} className="flex-wrap" />
    </div>
  )
}

export function PixelPortraitEditor({ value, onChange, className }: PixelPortraitEditorProps) {
  const update = useCallback(
    (patch: Partial<AppearanceSpec>) => onChange({ ...value, ...patch }),
    [value, onChange]
  )
  const v = { ...DEFAULT_SPEC, ...value }

  return (
    <div className={cn("flex gap-6", className)}>
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-surface p-5">
          <PixelPortrait {...value} size="lg" />
        </div>
        <div className="flex items-end gap-1.5">
          <PixelPortrait {...value} size="md" />
          <PixelPortrait {...value} size="sm" />
          <PixelPortrait {...value} size="xs" />
        </div>
        <p className="text-2xs text-text3">Live preview at every size</p>
      </div>

      {/* Controls */}
      <div className="flex-1 space-y-4">
        <OptionRow title="Hair style" list={HAIR_STYLES} value={v.hairStyle} onChange={(hairStyle) => update({ hairStyle: hairStyle as PortraitSpec["hairStyle"] })} />
        <OptionRow title="Face" list={FACE_SHAPES} value={v.face} onChange={(face) => update({ face: face as PortraitSpec["face"] })} />
        <OptionRow title="Expression" list={EXPRESSIONS} value={v.expression} onChange={(expression) => update({ expression: expression as PortraitSpec["expression"] })} />
        <OptionRow title="Age" list={AGES} value={v.age} onChange={(age) => update({ age: age as PortraitSpec["age"] })} />
        <OptionRow title="Facial hair" list={FACIAL_HAIR} value={v.facialHair} onChange={(facialHair) => update({ facialHair: facialHair as PortraitSpec["facialHair"] })} />
        <OptionRow title="Outfit" list={OUTFITS} value={v.outfit} onChange={(outfit) => update({ outfit: outfit as PortraitSpec["outfit"] })} />
        <OptionRow title="Accessory" list={ACCESSORIES} value={v.accessory} onChange={(accessory) => update({ accessory: accessory as PortraitSpec["accessory"] })} />

        <ColorGrid label="Skin" colors={PRESETS.skin} selected={v.skin} onSelect={(skin) => update({ skin })} />
        <ColorGrid label="Hair colour" colors={PRESETS.hair} selected={v.hair} onSelect={(hair) => update({ hair })} />
        <ColorGrid label="Eyes" colors={PRESETS.eyes} selected={v.eyes} onSelect={(eyes) => update({ eyes })} />
        <ColorGrid label="Clothes" colors={PRESETS.cloth} selected={v.shirt} onSelect={(shirt) => update({ shirt })} />
        <ColorGrid label="Accent" colors={PRESETS.accent} selected={v.accent} onSelect={(accent) => update({ accent })} />
        <ColorGrid label="Background" colors={PRESETS.background} selected={v.background} onSelect={(background) => update({ background })} />
      </div>
    </div>
  )
}

/** Standalone demo wrapper with internal state */
export function PixelPortraitEditorDemo() {
  const [spec, setSpec] = useState<AppearanceSpec>({ ...DEFAULT_SPEC })
  return <PixelPortraitEditor value={spec} onChange={setSpec} />
}
