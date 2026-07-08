// Version comes from the ONE release truth (backend/package.json), baked at
// deploy by backend/scripts/gen-admin-release-info.ts — NOT the admin package.json
// (which drifted and showed 6.3.0). The live /api/health/version fetch still
// overrides at runtime when reachable; this baked value is the correct fallback.
import { PORTER_VERSION } from "./release-info.generated"

export const VERSION = PORTER_VERSION
export const APP_NAME = "Porter"
