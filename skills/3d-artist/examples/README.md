# 3D Artist — Example Output Shapes

Use these as patterns for response structure, not rigid templates.

## Example 1 — Product render brief to production plan

**Input:**
Create a premium-looking 3D render of a wireless earbud case for a landing page hero section.

**Good output shape:**
- Goal: premium still render for marketing hero
- Assumptions: 4K output, offline render, realistic materials, dark gradient background
- Model plan:
  - clean subdivision-friendly hard-surface model
  - separate lid, shell, hinge, earbuds, indicator LED
  - bevel strategy for edge catchlights
- Material plan:
  - matte polymer body
  - glossy accent strip
  - soft rubber in-ear tips
  - subtle roughness breakup, no noisy grunge
- Lighting plan:
  - large soft key from upper front-left
  - controlled rim to separate silhouette
  - soft shadow plane
- Camera plan:
  - 70–100mm equivalent for premium product feel
  - 3/4 hero angle plus one open-case detail render
- Deliverables:
  - source scene
  - final PNG/WebP exports
  - clay render and wireframe preview
  - texture manifest

## Example 2 — Game asset review

**Input:**
Review this stylized crate asset before it goes into Unity mobile.

**Good output shape:**
- Verdict: usable with 4 blockers and 3 polish items
- Blockers:
  1. inconsistent texel density between lid and side panels
  2. pivot not centered at base, likely placement problems in engine
  3. bevel width too thin to read at gameplay distance
  4. UV seam visible on front hero face
- Polish:
  - simplify underside geometry
  - unify wood roughness range
  - bake edge wear into normal/albedo more cleanly
- Export checklist:
  - apply transforms
  - triangulate on export if pipeline requires
  - verify material slot count
  - confirm texture compression targets

## Example 3 — Asset handoff spec

**Input:**
Define the handoff package for a hero prop going from Blender to Unreal.

**Good output shape:**
- Folder structure
- Naming convention for mesh, materials, textures, and versions
- Required files:
  - `.blend`
  - `FBX` or `glTF` export
  - texture maps
  - preview turntable
  - readme with scale/orientation notes
- Validation checks:
  - scale in centimeters/meters stated explicitly
  - origin placement documented
  - smoothing/normals checked
  - texture paths relative or packed per pipeline
  - material names stable and engine-safe

## Example 4 — Lookdev options

**Input:**
Give me three material directions for a sci-fi drone.

**Good output shape:**
For each option:
- style name
- visual intent
- material stack
- color/value strategy
- where it fits best
- production risks

Example options:
- clean aerospace
- field-worn tactical
- near-future consumer tech
