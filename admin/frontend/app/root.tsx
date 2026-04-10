import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import type { Route } from "./+types/root"
import { queryClient } from "~/lib/query-client"
import "./app.css"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Porter — Your AI Mission Control</title>
        <meta name="description" content="One command center for all your AI agents." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://askporter.app" />
        <meta property="og:title" content="Porter — Your AI Mission Control" />
        <meta property="og:description" content="One command center for all your AI agents." />
        <meta property="og:image" content="https://askporter.app/og-preview.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Porter" />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Porter — Your AI Mission Control" />
        <meta name="twitter:description" content="One command center for all your AI agents." />
        <meta name="twitter:image" content="https://askporter.app/og-preview.png" />

        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              var t = localStorage.getItem('porter_theme');
              if (t === 'light') {
                document.documentElement.classList.add('light');
              }
            })()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              function reportError(source, message, stack, url) {
                try {
                  fetch('/api/admin/diagnostics/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ source: source, severity: 'error', message: message, stack: stack, url: url || window.location.href })
                  }).catch(function(){});
                } catch(e) {}
              }
              window.onerror = function(msg, src, line, col, err) {
                reportError('client_js', msg + ' at ' + src + ':' + line + ':' + col, err && err.stack, window.location.href);
              };
              window.addEventListener('unhandledrejection', function(e) {
                var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
                if (msg.indexOf('No module update found') !== -1) return;
                if (msg.indexOf('hmr') !== -1) return;
                var stack = e.reason && e.reason.stack ? e.reason.stack : '';
                reportError('client_js', 'Unhandled rejection: ' + msg, stack, window.location.href);
              });
            })()`,
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-text2">{message}</h1>
        <p className="mt-2 text-text3">{details}</p>
        {stack && (
          <pre className="mt-4 max-w-2xl overflow-x-auto rounded-lg bg-surface p-4 text-left text-xs text-text3">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  )
}
