import { Link } from "react-router"
import { AppShell } from "~/components/layout/app-shell"

export default function NotFoundPage() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center flex-1 text-text3">
        <p className="text-4xl font-bold text-foreground mb-1">404</p>
        <p className="text-sm">Page not found</p>
        <Link to="/dashboard" className="text-xs text-accent-porter hover:underline mt-3">
          Go to Dashboard
        </Link>
      </div>
    </AppShell>
  )
}
