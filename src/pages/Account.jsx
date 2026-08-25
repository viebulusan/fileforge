import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useSession, signOut } from '../lib/auth-client.js'

export default function Account() {
  const { data: session, isPending, refetch } = useSession()
  const [key, setKey] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState('')
  // Optimistic plan: flips the moment a redeem succeeds so the page updates
  // without waiting on (or depending on) the session store's refetch.
  const [planOverride, setPlanOverride] = useState(null)
  const [licenseKey, setLicenseKey] = useState(null)

  const user = session?.user
  const isProEarly = planOverride === 'pro' || (user?.plan ?? 'free') === 'pro'

  useEffect(() => {
    if (!isProEarly) return
    let alive = true
    fetch('/api/pro/key')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.key) setLicenseKey(data.key)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isProEarly])

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <p className="font-mono text-xs text-ink-faint">loading…</p>
      </div>
    )
  }

  const user = session?.user
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-5 py-28 text-center">
        <h1 className="text-xl font-bold">You're signed out</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Sign in to see your plan and redeem license keys.
        </p>
        <div className="mt-7 flex justify-center gap-4 text-sm">
          <Link
            to="/login"
            className="rounded-sm bg-copper px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-sm border border-line-strong px-5 py-2.5 transition hover:border-copper hover:text-copper-deep"
          >
            Create account
          </Link>
        </div>
      </div>
    )
  }

  const isPro = planOverride === 'pro' || (user.plan ?? 'free') === 'pro'

  async function redeem(event) {
    event.preventDefault()
    const trimmed = key.trim()
    if (!trimmed || redeeming) return
    setRedeeming(true)
    setError('')
    setMessage(null)
    try {
      const res = await fetch('/api/pro/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? `Redemption failed (${res.status})`)
      } else {
        setMessage('Pro unlocked — every tool on this device is yours now.')
        setKey('')
        // Optimistic flip first (instant UI), then push the fresh session
        // through the store so every useSession() subscriber catches up.
        setPlanOverride('pro')
        await refetch?.()
      }
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold normal-case text-copper">//</span>
        your forge
      </p>
      <h1 className="mt-4 text-4xl font-bold uppercase tracking-[-0.02em]">Account</h1>

      <div className="mt-8 rounded-sm border border-line bg-paper-raised p-6">
        <dl className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-mono text-xs uppercase tracking-wide text-ink-faint">
              name
            </dt>
            <dd className="truncate text-sm font-medium">{user.name}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
            <dt className="font-mono text-xs uppercase tracking-wide text-ink-faint">
              email
            </dt>
            <dd className="truncate text-sm font-medium">{user.email}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
            <dt className="font-mono text-xs uppercase tracking-wide text-ink-faint">
              plan
            </dt>
            <dd className="flex items-center gap-3 text-sm font-medium">
              {isPro ? (
                <span className="border border-copper/40 bg-copper-wash px-2.5 py-1 font-mono text-xs uppercase tracking-[0.14em] text-copper">
                  pro
                </span>
              ) : (
                <>
                  Free
                  <Link
                    to="/pricing"
                    className="border-b border-copper pb-0.5 font-mono text-xs normal-case tracking-normal text-copper-deep"
                  >
                    upgrade
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>

        {isPro && licenseKey && (
          <p className="mt-4 border-t border-line pt-4 font-mono text-xs leading-relaxed text-ink-faint">
            your license key: <span className="font-bold tracking-wider text-copper">{licenseKey}</span>
            {' — '}
            proof of purchase; redeemable on another account if you ever switch.
          </p>
        )}

        {!isPro && (
          <form onSubmit={redeem} className="mt-7 border-t border-line pt-6">
            <label
              htmlFor="license-key"
              className="block font-mono text-xs uppercase tracking-wide text-ink-faint"
            >
              have a pro key? redeem it here
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="license-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="FF-XXXX-XXXX-XXXX-XXXX"
                spellCheck="false"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-sm border border-line-strong bg-paper px-4 py-2.5 font-mono text-sm uppercase outline-none transition placeholder:normal-case placeholder:text-ink-faint focus:border-copper"
              />
              <button
                type="submit"
                disabled={redeeming || key.trim().length === 0}
                className="rounded-sm bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-40"
              >
                {redeeming ? 'Checking…' : 'Redeem'}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 font-mono text-xs text-red-400">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="mt-3 font-mono text-xs text-copper">
                {message}
              </p>
            )}
          </form>
        )}

        <div className="mt-7 border-t border-line pt-6">
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-sm border border-line-strong px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-ink-soft transition hover:border-red-400/50 hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
