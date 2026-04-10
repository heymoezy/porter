import { PorterLogo } from "~/components/porter-logo"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <PorterLogo size="sm" />
        </div>

        <h1 className="text-2xl font-bold text-text">Terms of Service</h1>
        <p className="mt-2 text-sm text-text3">Last updated: March 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-text2">
          <p>
            These Terms of Service govern your use of Porter, operated by YMC Capital.
            By creating an account, you agree to these terms.
          </p>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">1. Acceptance of Terms</h2>
            <p className="text-text3">Full terms are being drafted and will be published here prior to public launch.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">2. Account Responsibilities</h2>
            <p className="text-text3">Content pending legal review.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">3. Acceptable Use</h2>
            <p className="text-text3">Content pending legal review.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">4. Billing & Subscriptions</h2>
            <p className="text-text3">Content pending legal review.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">5. Termination</h2>
            <p className="text-text3">Content pending legal review.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">6. Limitation of Liability</h2>
            <p className="text-text3">Content pending legal review.</p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-text">7. Contact</h2>
            <p className="text-text3">support@askporter.app</p>
          </div>
        </div>
      </div>
    </div>
  )
}
