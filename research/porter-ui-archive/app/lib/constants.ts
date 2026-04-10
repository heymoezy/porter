import {
  FolderKanban,
  Bot,
  FileText,
  Users,
  Box,
  Monitor,
  Link,
  Brain,
  Shield,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import pkg from "../../package.json"

export const VERSION = pkg.version
export const APP_NAME = "Porter"

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  path: string
  badge?: number
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Work",
    items: [
      { id: "projects", label: "Projects", icon: FolderKanban, path: "/projects" },
      { id: "agents", label: "AI Agents", icon: Bot, path: "/agents" },
      { id: "files", label: "Files", icon: FileText, path: "/files" },
      { id: "people", label: "People", icon: Users, path: "/people" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "models", label: "Models", icon: Box, path: "/models" },
      { id: "tools", label: "Tools", icon: Monitor, path: "/tools" },
      { id: "connections", label: "Connections", icon: Link, path: "/connections" },
    ],
  },
  {
    label: "Inspect",
    items: [
      { id: "memory", label: "Memory", icon: Brain, path: "/memory" },
      { id: "logs", label: "Logs", icon: Shield, path: "/logs" },
    ],
  },
]
