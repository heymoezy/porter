import { lazy, Suspense } from "react"

const DesignSystemPage = lazy(() => import("./design-system"))

export default function DesignSystemRoute() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    }>
      <DesignSystemPage />
    </Suspense>
  )
}
