# Porter — Design Guide
**Version 0.4 · Last updated 2026-02-23**

---

## 1. Brand Identity

### Name
**porter** (always lowercase in UI, title case in documents)

A porter carries things between places. The name captures the product's core purpose — moving files between your local machine and a remote server — without being technical or jargon-heavy.

### Tagline
**File Manager** (sidebar subtitle) · **The file manager your VPS deserves.** (marketing)

### Logo Mark
The mark is an orange rounded square containing a geometric white 'P' built from four rectangles: a vertical stem and three horizontal bars forming the bowl. Clean and product-like at any size.

```
┌─────────┐
│ ██████  │   Orange (#F7931A) rounded square, rx=8
│ ██      │   White geometric P — four rect elements
│ ██████  │   No gradients, no strokes
│ ██      │   8px corner radius on outer square
└─────────┘
```

**Usage rules:**
- Never recolour the mark — orange background, white P only
- Minimum size: 16px (below this, use just the letterform "p")
- Clear space: equal to the corner radius on all sides
- Never stretch, rotate, or add effects

### Wordmark
`porter` in lowercase, system sans-serif, weight 700, letter-spacing -0.4px. The lowercase form intentionally signals approachability — this is a tool for humans, not an enterprise product.

---

## 2. Colour Palette

### Primary
| Name | Hex | Usage |
|---|---|---|
| Porter Orange | `#F7931A` | Primary actions, accent, logo, active states |
| Orange Dark | `#d97706` | Hover on primary buttons |
| Orange Dim | `rgba(247,147,26,0.06)` | Active sidebar items, subtle highlights |

**Orange is earned.** Only one primary action should be orange at a time. Do not use it for decoration.

### Neutrals (Dark Theme — v0.4)
| Name | CSS Var | Hex | Usage |
|---|---|---|---|
| Canvas | `--bg` | `#0F0F0F` | App background |
| Surface | `--surface` | `#1A1A1A` | Sidebar, toolbar |
| Raised | `--raised` | `#242424` | Modals, dropdowns, hover states |
| Border Subtle | `--border` | `#2E2E2E` | Row dividers, section dividers |
| Border Default | `--border2` | `#363636` | Component borders, inputs |

**Design intent:** Each surface step is clearly distinct from the one below. No more grey-on-grey ambiguity.

### Text
| Name | CSS Var | Hex | Usage |
|---|---|---|---|
| Text Primary | `--text` | `#F0F0F0` | Headings, primary labels, active items |
| Text Secondary | `--text2` | `#C0C0C0` | Secondary labels, metadata, captions |
| Text Muted | `--text3` | `#909090` | Placeholders, column headers, disabled |
| Text White | — | `#ffffff` | On primary (orange) backgrounds only |

**Contrast rationale:** All three text levels now pass WCAG AA on `--bg`. `--text3` at `#909090` is 5.2:1 on `#0F0F0F` — previously `#555` was 3.0:1 and effectively invisible.

### Semantic
| Name | Hex | Usage |
|---|---|---|
| Success | `#4ade80` | Upload complete, operation success |
| Danger | `#dc2626` | Delete, destructive actions |
| Danger Bg | `rgba(220,38,38,0.10)` | Danger hover backgrounds |
| Warning | `#facc15` | Read-only banners, caution states |
| Info | `#60a5fa` | Neutral informational states |

### File Type Colours (icon accents)
| Type | Colour | Examples |
|---|---|---|
| Code / Text | `#6b8cff` (blue) | `.py .js .ts .md .json .sh` |
| Image | `#4ade80` (green) | `.png .jpg .svg .gif` |
| Document | `#f87171` (red) | `.pdf` |
| Data | `#facc15` (yellow) | `.csv .xlsx .tsv` |
| Archive | `#c084fc` (purple) | `.zip .gz .tar` |
| Generic | `#666666` (grey) | All others |

---

## 3. Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```
No web fonts are loaded. Porter renders with the user's system font — zero load time, always native to the OS.

### Type Scale
| Name | Size | Weight | Usage |
|---|---|---|---|
| Nano | 9px | 600 | Logo subtitle, version badge |
| Micro | 11px | 600 | Column headers (ALL CAPS + letter-spacing) |
| Caption | 12px | 400 | File size, date metadata |
| Body Small | 13px | 400/500 | Sidebar items, dropdown items, buttons |
| Body | 14px | 400/500 | File names, breadcrumbs, modals |
| Heading | 16px | 600 | Modal titles |
| Logo | 17px | 700 | Wordmark only |

### Letter Spacing
- Column headers: `0.6px` (always paired with `text-transform: uppercase`)
- Logo subtitle: `1.2px`
- Version badge: `0.8px`
- Everything else: default (0)

### Line Height
- Body text: `1.5` for readability in modals and descriptions
- Single-line UI elements: `1` or explicit height

---

## 4. Spacing System

All spacing is based on a **4px grid**.

| Token | Value | Usage |
|---|---|---|
| xs | 4px | Icon padding, tight gaps |
| sm | 8px | Button icon gap, small gaps |
| md | 12px | Row padding, component gaps |
| lg | 16px | Section padding, card padding |
| xl | 20px | Sidebar padding |
| 2xl | 24px | Main content padding |
| 3xl | 32px | Modal padding |
| 4xl | 48px | Large section spacing |

---

## 5. Border Radius
| Token | Value | Usage |
|---|---|---|
| xs | 4px | Dropdown items, crumb hover |
| sm | 6px | Tab buttons |
| md | 8px | Buttons, inputs, sidebar active (`--radius`) |
| lg | 12px | Modals, cards, changelog modal |
| xl | 8px (outer logo) | Logo mark outer square |
| full | 100px | Toasts, badges, pills |

---

## 6. Component Patterns

### Buttons
Three variants only. No more.

```
Primary   [  Upload  ]   bg: orange, text: black, weight: 600
Ghost     [ New folder]  bg: none, border: border2, text: text2
Danger    [  Delete   ]  bg: none, border: #441111, text: danger
Icon      [    ⟳     ]  bg: none, no border, square, text: text2
```

- All buttons: 7px vertical padding, 14px horizontal, font-size 13px, radius 8px
- Never use Primary for more than one action in the same toolbar
- Disabled state: opacity 0.35
- All `<button>` elements must have explicit `type="button"` where not submitting a form

### File Rows
- Grid: `1fr 90px 110px 40px` (name, size, date, actions)
- Height: implicit via 11px top/bottom padding on the name cell
- Three-dot menu: hidden by default, visible on row hover only
- Folder rows respond to click anywhere on the row; file rows open preview on click

### Search
- Always visible in toolbar — no toggle required
- Expands from 180px → 220px on focus
- Results grouped by parent folder, with orange sticky folder headers
- Matching substring bolded in results
- Count bar appears above results: "N results"
- No results: shows query — `No results for "filename"`

### Toasts
- Appear bottom-centre, stack upward
- Auto-dismiss at 3 seconds (fade starts at 2.8s)
- Three types: neutral (default), ok (green border + text), err (red border + text)
- Never more than 3 visible at once
- Border-radius: 100px (pill)

### Modals
- Always centred, backdrop blur 2px
- Width: 360px (standard) / 460px (changelog)
- Close on backdrop click or Escape key
- Input auto-focused and pre-selected where applicable
- Actions right-aligned: Cancel (ghost) then confirm (primary or danger)
- Long filenames wrap — `overflow-wrap: break-word; word-break: break-all` on description

### Changelog Modal
- Accessible from version badge in sidebar footer
- Full release history, oldest to newest reversed (newest first)
- Version tag in orange, date in muted text
- Bullet list per version, em-dash prefix style

### Dropdowns
- Appear attached to the trigger element
- Minimum width: 160px
- Flip upward if too close to viewport bottom
- Close on: outside click, item selection, Escape

### Read-Only Banner
- Appears below toolbar when current directory is not writable
- Orange-tinted background, lock icon, single line of text
- Never show actions that would fail (upload/mkdir buttons disabled)

---

## 7. Icon System

All icons are inline SVG with `stroke="currentColor"`. No icon library dependency.

### Sizing
- Sidebar icons: 18px
- Toolbar button icons: 14px
- Row action icons: 14px
- Row menu trigger (three dots): 15px
- Lock badge: 12px

### Stroke Width
- UI icons (actions, navigation): `stroke-width="2"`
- File type icons: `stroke-width="1.5"` (slightly lighter, secondary)

### File Type Icons
Colour-coded by file category (see Colour Palette → File Type Colours). Same shape (document outline) with category-specific stroke colour.

---

## 8. Motion & Animation

**Principle:** Motion should be fast and functional. Never decorative.

| Element | Property | Duration | Easing |
|---|---|---|---|
| Hover states | background, color | 100–120ms | ease |
| Dropdown appear | display (JS) | instant | — |
| Toast appear | opacity + translateY | 200ms | ease |
| Toast disappear | opacity | 400ms | ease |
| Modal appear | display (JS) | instant | — |
| Search expand | width | 200ms | ease |
| Upload progress | progress fill | live | — |

No entrance animations on file rows or page transitions — speed matters more than polish here.

---

## 9. Layout

### Breakpoints
Porter is a desktop-first tool. Minimum supported width: **900px**.
Mobile responsive layout planned for v0.5 — sidebar collapses below 768px.

### Grid
```
┌──────────────┬────────────────────────────────────┐
│ Sidebar      │ Toolbar (sticky)                   │
│ 220px fixed  ├────────────────────────────────────┤
│              │ [Optional: Read-only banner]        │
│              ├────────────────────────────────────┤
│              │ [Optional: Search count bar]        │
│              ├────────────────────────────────────┤
│              │ [Optional: Selection toolbar]       │
│              ├────────────────────────────────────┤
│              │ List header (sticky)               │
│              │ File rows (scrollable)             │
└──────────────┴────────────────────────────────────┘
```

### Z-Index Stack
| Layer | z-index | Elements |
|---|---|---|
| Base | 0 | File rows |
| Sticky | 1 | List header, search group headers |
| Floating | 100 | Dropdown menus |
| Overlay | 200 | Modals, upload progress bar |
| Notification | 300 | Toasts |

---

## 10. Voice & Tone

**Clear over clever.** Porter's copy should be direct and functional. Users are here to manage files, not read marketing copy.

### Principles
- **Short.** Button labels are 1–2 words. Toast messages are one sentence.
- **Active.** "Deleted file.wav" not "file.wav was deleted."
- **Honest.** Error messages say what went wrong. "Permission denied" not "Something went wrong."
- **Lowercase brand.** The product is always "porter" in UI, "Porter" in documents.

### Toast Copy Examples
```
✓ ok     Uploaded report.pdf
✓ ok     Created new folder
✓ ok     Renamed to final-v2.pdf
✓ ok     Deleted archive.zip
✗ err    Permission denied
✗ err    Name already exists
✗ err    Upload failed
```

### Modal Copy Examples
```
Delete file                     ← title: "Delete" + type
Delete <strong>report.pdf</strong>?   ← filename bolded, wraps if long

Rename folder                   ← title only, no description needed
[untitled folder         ]      ← input pre-filled, pre-selected
```

---

## 11. What Porter Is Not

To avoid scope creep, the following are explicitly out of scope for the core product:

- A terminal emulator
- A version control interface (Git UI)
- An image viewer / media player beyond inline preview
- A sharing or permissions management system
- A full-text search engine (search is filename-only)

Note: basic inline text editing **is** in scope (v0.4+) — users need to edit config files and scripts without leaving the browser.

---

*This document is the source of truth for all design decisions in Porter. When in doubt, refer here first.*
*Last updated: 2026-02-23 (v0.4)*
