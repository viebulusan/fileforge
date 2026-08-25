import { Link } from 'react-router'
import { useSession } from '../lib/auth-client.js'
import { UNLOCK_ALL } from '../lib/testing.js'

/**
 * Wraps a Pro-only page: sign-in prompt when logged out,
 * upsell card when on the free plan, content otherwise.
 */
export default function ProGate({ tool = 'This tool', children }) {
  const { data: session, isPending } = useSession()
  const user = session?.user

  if (UNLOCK_ALL) return children

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 h-24 animate-pulse rounded-sm border border-line bg-paper-raised" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 rounded-sm border border-line bg-paper-raised p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            pro tool
          </p>
          <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
            Sign in to use {tool}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            {tool} is part of FileForge Pro — sign in with any account to check
            your plan.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/login"
              className="bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="border border-line-strong px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] transition hover:border-copper hover:text-copper"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if ((user.plan ?? 'free') !== 'pro') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 rounded-sm border border-copper/60 bg-paper-raised p-8 text-center shadow-[0_0_80px_-32px_rgb(217_255_61/25%)]">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-copper">
            pro tool
          </p>
          <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
            {tool} comes with Pro
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            One $7 payment unlocks it for good — no subscription, no recurring
            charges.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/pricing"
              className="bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
            >
              Get Pro — $7 once
            </Link>
            <Link
              to="/convert"
              className="self-center border-b border-line-strong pb-0.5 font-mono text-xs uppercase tracking-[0.14em] text-ink-faint transition hover:border-copper hover:text-copper-deep"
            >
              keep using the free tools
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return children
}
