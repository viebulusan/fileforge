import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.js'
import VerifyCode from '../components/VerifyCode.jsx'

const inputClass =
  'w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 py-2.5 text-sm outline-none transition focus:border-copper'

export default function Signup() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [stage, setStage] = useState('form') // form | verify
  const [email, setEmail] = useState('')
  const [initialNotice, setInitialNotice] = useState('')
  // Kept only until verification completes, so the account can be signed in.
  const credentialsRef = useRef({ email: '', password: '' })

  async function requestCode(address) {
    const res = await fetch('/api/verify/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: address }),
    })
    return res.json().catch(() => ({}))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const form = event.currentTarget
    if (form.password.value !== form.confirm.value) {
      setError("The two passwords don't match.")
      return
    }
    setPending(true)
    const credentials = {
      name: form.name.value,
      email: form.email.value,
      password: form.password.value,
    }
    const { error: authError } = await authClient.signUp.email({
      name: credentials.name,
      email: credentials.email,
      password: credentials.password,
    })
    setPending(false)
    if (authError) {
      setError("Couldn't create the account. Check your details and try again.")
      return
    }
    // The account now exists but is unverified and has no session. Ask for
    // the emailed code; on success we sign them in automatically.
    credentialsRef.current = { email: credentials.email, password: credentials.password }
    setEmail(credentials.email)
    try {
      const data = await requestCode(credentials.email)
      if (data?.error) throw new Error(data.error)
      if (!data.delivered) {
        setInitialNotice(
          data.devCode
            ? `Email delivery isn't configured on this deployment yet — your code is ${data.devCode}.`
            : 'Email delivery is still being configured — use resend to get your code.',
        )
      }
      setStage('verify')
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? `${sendError.message} You can resend once you're on the next screen.`
          : 'Could not send the verification code.',
      )
      setStage('verify')
    }
  }

  async function handleVerified() {
    // Verification alone doesn't create a session — sign in with the
    // credentials from the first step.
    const { error: signInError } = await authClient.signIn.email({
      email: credentialsRef.current.email,
      password: credentialsRef.current.password,
    })
    if (signInError) navigate('/login')
    else navigate('/account')
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-24">
      <h1 className="text-2xl font-bold uppercase tracking-[-0.02em]">Create account</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Free forever. An account only remembers your plan and preferences.
      </p>

      {stage === 'verify' ? (
        <VerifyCode
          email={email}
          onVerified={handleVerified}
          onBack={() => setStage('form')}
          initialNotice={initialNotice}
        />
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input type="text" name="name" placeholder="Name" required autoComplete="name" className={inputClass} />
          <input type="email" name="email" placeholder="Email" required autoComplete="email" className={inputClass} />
          <input
            type="password"
            name="password"
            placeholder="Password (min. 8 characters)"
            minLength={8}
            required
            autoComplete="new-password"
            className={inputClass}
          />
          <input
            type="password"
            name="confirm"
            placeholder="Confirm password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="!mt-6 w-full rounded-sm bg-copper py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-60"
          >
            {pending ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        Already have one?{' '}
        <Link to="/login" className="border-b border-copper pb-0.5 text-copper-deep">
          Sign in
        </Link>
      </p>
    </div>
  )
}
