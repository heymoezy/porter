import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("users", "routes/users.tsx"),
  route("users/:username", "routes/user-detail.tsx"),
  route("email", "routes/email.tsx"),
  route("billing", "routes/billing.tsx"),
  route("agents", "routes/agents.tsx"),
  route("diagnostics", "routes/diagnostics.tsx"),
  route("templates", "routes/templates.tsx"),
  route("models", "routes/models.tsx"),
  route("porter", "routes/porter.tsx"),
  route("tools", "routes/tools.tsx"),
  route("skills", "routes/skills.tsx"),
  route("system", "routes/system.tsx"),
  route("activity", "routes/activity.tsx"),
] satisfies RouteConfig
