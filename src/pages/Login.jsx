import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.js'
import VerifyCode from '../components/VerifyCode.jsx'

const inputClass =
  'w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 py-2.5 text-sm outline-none transition focus:border-copper'

export default function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState(null)
  // Kept only until verification completes, so the account can be signed in
  // on this device right after confirming the code.
  const credentialsRef = useRef({ email: '', password: '' })

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    const email = event.currentTarget.email.value
    const password = event.currentTarget.password.value
    const { error: authError } = await authClient.signIn.email({ email, password })
    setPending(false)
    if (authError) {
      if (authError.status === 403 || authError.code === 'EMAIL_NOT_VERIFIED') {
        // Account exists but never confirmed the emailed code. Ask for the
        // code here; on success we sign straight in on THIS device.
        credentialsRef.current = { email, password }
        setVerifyEmail(email)
        return
      }
      setError("That email and password don't match an account.")
      return
    }
    navigate('/account')
  }

  async function handleVerified() {
    const { email, password } = credentialsRef.current
    const { error: signInError } = await authClient.signIn.email({ email, password })
    if (signInError) navigate('/login')
    else navigate('/account')
  }

  if (verifyEmail) {
    return (
      <div className="mx-auto max-w-sm px-5 py-24">
        <h1 className="text-2xl font-bold uppercase tracking-[-0.02em]">Verify your email</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This account hasn't been confirmed yet — enter the code we emailed you to unlock it,
          and you'll be signed in on this device.
        </p>
        <VerifyCode
          email={verifyEmail}
          initialNotice="Request a code below, then confirm to finish signing in."
          onVerified={handleVerified}
          onBack={() => setVerifyEmail(null)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-24">
      <h1 className="text-2xl font-bold uppercase tracking-[-0.02em]">Sign in</h1>
      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <input type="email" name="email" placeholder="Email" required autoComplete="email" className={inputClass} />
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="!mt-6 w-full rounded-sm bg-copper py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        New here?{' '}
        <Link to="/signup" className="border-b border-copper pb-0.5 text-copper-deep">
          Create a free account
        </Link>
      </p>
    </div>
  )
}
