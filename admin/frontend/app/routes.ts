import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  index("routes/home-redirect.tsx"),
  route("login", "routes/login.tsx"),

  // All authenticated routes share one AdminShell instance (no remount on navigation)
  layout("routes/layout.tsx", [
    route("dashboard", "routes/home.tsx"),
    route("users", "routes/users.tsx"),
    route("users/:username", "routes/user-detail.tsx"),
    route("email", "routes/email.tsx"),
    route("billing", "routes/billing.tsx"),
    route("forge", "routes/forge.tsx"),
    route("agents/:id", "routes/agent-detail.tsx"),
    route("system", "routes/system.tsx"),
    route("brain", "routes/brain-redirect.tsx"),
    route("activity", "routes/activity-redirect.tsx"),
    route("diagnostics", "routes/diagnostics-redirect.tsx"),
    route("templates/:id", "routes/template-detail.tsx"),
    route("tools", "routes/tools.tsx"),
    route("skills", "routes/skills.tsx"),
    route("skills/:id/pack", "routes/skill-pack-explorer.tsx"),
    route("bridge", "routes/bridge.tsx"),
    route("recall", "routes/recall.tsx"),
    route("changelog", "routes/changelog.tsx"),
    route("architecture", "routes/architecture.tsx"),
    route("org-chart", "routes/org-chart.tsx"),
    route("design-system", "routes/design-system-lazy.tsx"),
    route("settings", "routes/settings.tsx"),
    route("intelligence", "routes/intelligence.tsx"),
    route("files", "routes/files.tsx"),
  ]),
] satisfies RouteConfig
