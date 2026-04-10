import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "~/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  module?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-warning mb-3" />
          <p className="text-sm font-bold text-foreground">
            {this.props.module
              ? `${this.props.module} failed to load`
              : "Something went wrong"}
          </p>
          <p className="text-xs text-text3 mt-1 max-w-md">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 gap-1.5"
            onClick={() =>
              this.setState({ hasError: false, error: undefined })
            }
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
