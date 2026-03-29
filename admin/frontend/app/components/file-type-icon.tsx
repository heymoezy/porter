import type { ReactNode } from "react"
import { cn } from "~/lib/utils"

type FileCategory = "pdf" | "word" | "excel" | "powerpoint" | "image" | "video" | "audio" | "code" | "archive" | "text" | "unknown"

interface FileTypeIconProps {
  filename: string
  size?: "sm" | "md" | "lg"
  className?: string
  /** If provided for image types, shows a thumbnail instead of icon */
  thumbnailUrl?: string
}

const sizePx = { sm: 32, md: 40, lg: 56 }
const labelSize = { sm: "text-2xs", md: "text-2xs", lg: "text-2xs" }
const iconSize = { sm: 14, md: 18, lg: 24 }

const CATEGORY_MAP: Record<string, FileCategory> = {
  pdf: "pdf",
  doc: "word", docx: "word", odt: "word",
  xls: "excel", xlsx: "excel", csv: "excel", ods: "excel",
  ppt: "powerpoint", pptx: "powerpoint", odp: "powerpoint",
  png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image", bmp: "image", ico: "image",
  mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video",
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio", aac: "audio", m4a: "audio",
  ts: "code", tsx: "code", js: "code", jsx: "code", py: "code", rs: "code", go: "code", java: "code", rb: "code", php: "code", c: "code", cpp: "code", h: "code", css: "code", html: "code", json: "code", yaml: "code", yml: "code", toml: "code", sh: "code", bash: "code", sql: "code",
  zip: "archive", tar: "archive", gz: "archive", "7z": "archive", rar: "archive", bz2: "archive",
  txt: "text", md: "text", rtf: "text", log: "text",
}

const CATEGORY_STYLE: Record<FileCategory, { bg: string; fg: string; label: string; icon: (s: number) => ReactNode }> = {
  pdf: {
    bg: "bg-danger/12", fg: "text-danger", label: "PDF",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12l-2 4h4l-2 4"/></svg>,
  },
  word: {
    bg: "bg-primary/12", fg: "text-primary", label: "DOC",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  },
  excel: {
    bg: "bg-success/12", fg: "text-success", label: "XLS",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="8" y1="15" x2="16" y2="15"/></svg>,
  },
  powerpoint: {
    bg: "bg-warning/12", fg: "text-warning", label: "PPT",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><circle cx="12" cy="15" r="3"/></svg>,
  },
  image: {
    bg: "bg-chart-1/12", fg: "text-chart-1", label: "IMG",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.086-3.086a2 2 0 00-2.828 0L6 21"/></svg>,
  },
  video: {
    bg: "bg-[#EC4899]/12", fg: "text-[#EC4899]", label: "VID",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>,
  },
  audio: {
    bg: "bg-[#14B8A6]/12", fg: "text-[#14B8A6]", label: "AUD",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  },
  code: {
    bg: "bg-text3/12", fg: "text-text3", label: "CODE",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  },
  archive: {
    bg: "bg-warning/12", fg: "text-warning", label: "ZIP",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>,
  },
  text: {
    bg: "bg-text3/12", fg: "text-text3", label: "TXT",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>,
  },
  unknown: {
    bg: "bg-text3/12", fg: "text-text3", label: "FILE",
    icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>,
  },
}

function getCategory(filename: string): FileCategory {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  return CATEGORY_MAP[ext] ?? "unknown"
}

function getExtLabel(filename: string): string {
  const ext = filename.split(".").pop()?.toUpperCase() ?? ""
  const cat = getCategory(filename)
  const style = CATEGORY_STYLE[cat]
  // Use actual extension for known types, fallback to category label
  if (ext && ext.length <= 4) return ext
  return style.label
}

export function FileTypeIcon({ filename, size = "md", className, thumbnailUrl }: FileTypeIconProps) {
  const cat = getCategory(filename)
  const style = CATEGORY_STYLE[cat]
  const px = sizePx[size]
  const iSize = iconSize[size]

  // Image thumbnail mode
  if (cat === "image" && thumbnailUrl) {
    return (
      <div
        className={cn("overflow-hidden rounded-lg border border-border", className)}
        style={{ width: px, height: px }}
      >
        <img
          src={thumbnailUrl}
          alt={filename}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg",
        style.bg,
        className
      )}
      style={{ width: px, height: px }}
    >
      <div className={style.fg}>
        {style.icon(iSize)}
      </div>
      <span className={cn("mt-0.5 font-bold uppercase tracking-wider", style.fg, labelSize[size])}>
        {getExtLabel(filename)}
      </span>
    </div>
  )
}

/** Grid demo showing all file types */
export function FileTypeIconGallery() {
  const files = [
    "report.pdf",
    "brief.docx",
    "budget.xlsx",
    "deck.pptx",
    "hero.png",
    "intro.mp4",
    "podcast.mp3",
    "app.tsx",
    "backup.zip",
    "notes.md",
    "mystery.bin",
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {files.map(f => (
        <div key={f} className="flex flex-col items-center gap-1.5">
          <FileTypeIcon filename={f} size="lg" />
          <span className="text-2xs text-text3 truncate max-w-[56px]">{f}</span>
        </div>
      ))}
    </div>
  )
}
