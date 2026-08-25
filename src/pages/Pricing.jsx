import { useState } from 'react'
import { Link } from 'react-router'
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useSession } from '../lib/auth-client.js'

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID

const freePlan = {
  name: 'Free',
  price: '$0',
  period: 'forever',
  blurb: 'Everything most people need, running entirely on your device.',
  features: [
    'Image conversions',
    'All PDF tools',
    'Documents ⇄ PDF — 3 conversions free',
    'Writing tools — 250 words per run',
    'Video downloader — 3 free downloads',
    'No file-size ceiling we impose',
  ],
}

function ProBadge() {
  return (
    <span className="mt-8 block rounded-sm border border-copper/40 bg-copper-wash px-4 py-2.5 text-center font-mono text-xs font-bold uppercase tracking-[0.14em] text-copper">
      Pro active
    </span>
  )
}

function SignInToBuy() {
  return (
    <Link
      to="/login"
      className="mt-8 block rounded-sm bg-copper px-4 py-2.5 text-center font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
    >
      Sign in to buy
    </Link>
  )
}

function KeyOnlyFallback() {
  return (
    <>
      <Link
        to="/account"
        className="mt-8 block rounded-sm bg-copper px-4 py-2.5 text-center font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
      >
        Redeem your key
      </Link>
      <p className="mt-3 text-center font-mono text-xs text-ink-faint">
        paypal isn't set up on this deployment — redeem a license key on your
        account page instead
      </p>
    </>
  )
}

function PaypalCheckout({ onCaptured }) {
  const [paid, setPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  async function createOrder() {
    setError('')
    const res = await fetch('/api/paypal/order', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error ?? 'Could not start the payment.')
    return data.orderId
  }

  async function approve(data) {
    setPaying(true)
    try {
      const res = await fetch('/api/paypal/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderID }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'Payment could not be completed.')
      // Push the fresh plan through the session store so the badge flips
      // without a manual refresh.
      await onCaptured?.()
      setPaid(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.')
    } finally {
      setPaying(false)
    }
  }

  if (paid) {
    return (
      <p role="status" className="mt-8 rounded-sm border border-copper/40 bg-copper-wash px-4 py-2.5 text-center font-mono text-xs leading-relaxed text-copper-deep">
        Payment received — Pro is unlocked. Every tool is yours now.
      </p>
    )
  }

  return (
    <div className="mt-8">
      <div className={paying ? 'pointer-events-none opacity-60' : ''}>
        <PayPalScriptProvider
          options={{
            clientId: PAYPAL_CLIENT_ID,
            currency: 'USD',
            intent: 'capture',
            disableFunding: 'card',
          }}
        >
          <PayPalButtons
            style={{ layout: 'vertical', shape: 'rect', color: 'black', height: 42 }}
            createOrder={createOrder}
            onApprove={approve}
            onCancel={() => setError('Payment cancelled — nothing was charged.')}
            onError={() => setError('PayPal could not be reached. Try again.')}
            disableFunding={['card']}
          />
        </PayPalScriptProvider>
      </div>
      {paying && (
        <p className="mt-3 text-center font-mono text-xs text-ink-faint">
          finishing your payment…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 font-mono text-xs text-red-400">
          {error}
        </p>
      )}
      <p className="mt-4 text-center">
        <Link
          to="/account"
          className="border-b border-line-strong pb-0.5 font-mono text-xs text-ink-faint transition hover:text-copper-deep hover:border-copper"
        >
          have a key? redeem it here
        </Link>
      </p>
      <p className="mt-2 text-center">
        <Link
          to="/convert"
          className="border-b border-line-strong pb-0.5 font-mono text-xs text-ink-faint transition hover:text-copper-deep hover:border-copper"
        >
          continue with the free plan
        </Link>
      </p>
    </div>
  )
}

function ProCta() {
  const { data: session, refetch } = useSession()
  const user = session?.user
  // Optimistic plan: flips the moment a payment captures so the badge shows
  // without waiting on (or depending on) the session store's refetch.
  const [planOverride, setPlanOverride] = useState('')

  if (!PAYPAL_CLIENT_ID) return <KeyOnlyFallback />
  if (!user) return <SignInToBuy />
  if (planOverride === 'pro' || (user.plan ?? 'free') === 'pro') return <ProBadge />
  return (
    <PaypalCheckout
      onCaptured={() => {
        setPlanOverride('pro')
        return refetch?.()
      }}
    />
  )
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
      <p className="flex items-center justify-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold normal-case text-copper">//</span>
        one paid tier, no asterisks
      </p>
      <h1 className="mt-4 text-center text-4xl font-bold uppercase tracking-[-0.02em]">
        Pay for power, not permission
      </h1>
      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <div className="rounded-sm border border-line bg-paper-raised p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold uppercase tracking-[0.08em]">{freePlan.name}</h2>
          </div>
          <p className="mt-5">
            <span className="font-mono text-4xl font-bold tracking-tight text-copper">
              {freePlan.price}
            </span>{' '}
            <span className="font-mono text-xs text-ink-faint">{freePlan.period}</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">{freePlan.blurb}</p>
          <ul className="mt-7 space-y-2.5 text-sm">
            {freePlan.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <span className="size-1 rounded-full bg-copper-deep" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            to="/convert"
            className="mt-8 block rounded-sm border border-line-strong px-4 py-2.5 text-center font-mono text-xs font-bold uppercase tracking-[0.14em] transition hover:border-copper hover:text-copper"
          >
            Start converting
          </Link>
        </div>

        <div className="rounded-sm border border-copper/60 bg-paper-raised p-8 shadow-[0_0_80px_-32px_rgb(217_255_61/25%)]">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold uppercase tracking-[0.08em]">Pro</h2>
            <span className="border border-copper/40 bg-copper-wash px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-copper">
              unlocks a/v + more
            </span>
          </div>
          <p className="mt-5">
            <span className="font-mono text-4xl font-bold tracking-tight text-copper">$7</span>{' '}
            <span className="font-mono text-xs text-ink-soft">once</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            The heavy machinery: ffmpeg media conversion, the video downloader,
            the office suite and unlimited writing tools.
          </p>
          <ul className="mt-7 space-y-2.5 text-sm">
            {[
              'Everything in Free — unlimited',
              'Audio & video conversions',
              'Video downloader — unlimited, YouTube, Instagram & more',
              'Unlimited documents ⇄ PDF (Word, PPT, XLSX & OpenDocument)',
              'Unlimited writing tools (paraphrase · AI scan · originality)',
              'Supports ongoing development',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <span className="size-1 rounded-full bg-copper" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <ProCta />
        </div>
      </div>

      <p className="mt-8 text-center">
        <Link
          to="/convert"
          className="border-b border-line-strong pb-0.5 font-mono text-xs text-ink-faint transition hover:border-copper hover:text-copper"
        >
          not ready to upgrade? continue with the free plan →
        </Link>
      </p>

      <p className="mx-auto mt-10 max-w-md text-center font-mono text-xs leading-relaxed text-ink-faint">
        paypal checkout · no subscriptions to manage · free tier never expires
      </p>
    </div>
  )
}
