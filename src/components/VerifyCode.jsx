import { useEffect, useRef, useState } from 'react'

// Themed six-digit code entry. One <input> per digit with paste support,
// auto-advance and a resend cooldown — matches the forge aesthetic.
export default function VerifyCode({ email, onVerified, onBack, initialNotice = '' }) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(initialNotice)
  const [pending, setPending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputsRef = useRef([])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  function setDigit(index, value) {
    const clean = value.replace(/\D/g, '')
    setDigits((prev) => {
      const next = [...prev]
      if (clean.length > 1) {
        // pasted (or autofilled) the whole code
        for (let i = 0; i < 6 && i < clean.length; i += 1) next[i] = clean[i]
        inputsRef.current[Math.min(clean.length, 5)]?.focus()
      } else {
        next[index] = clean
        if (clean) inputsRef.current[index + 1]?.focus()
      }
      return next
    })
  }

  function onKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  async function submit(event) {
    event?.preventDefault()
    const code = digits.join('')
    if (code.length !== 6 || pending) return
    setPending(true)
    setError('')
    try {
      const res = await fetch('/api/verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Verification failed.')
      onVerified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
      setDigits(['', '', '', '', '', ''])
      inputsRef.current[0]?.focus()
    } finally {
      setPending(false)
    }
  }

  async function resend() {
    if (cooldown > 0) return
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/verify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not resend the code.')
      if (data.delivered) {
        setNotice(`A fresh code is on its way to ${email}.`)
      } else {
        setNotice(data.devCode ? `Email delivery isn't configured yet — your code is ${data.devCode}.` : `Code resent to ${email}.`)
      }
      setCooldown(45)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.')
    }
  }

  return (
    <div className="mt-8">
      <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
        enter the 6-digit code sent to
      </p>
      <p className="mt-1 text-center text-sm font-medium break-all">{email}</p>

      {notice && (
        <p role="status" className="mt-4 border border-copper/40 bg-copper-wash px-3 py-2.5 text-center font-mono text-xs leading-relaxed text-copper-deep">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 border border-red-900/60 bg-red-950/30 px-3 py-2.5 text-center font-mono text-xs leading-relaxed text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-6 flex justify-center gap-2 sm:gap-3">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el
            }}
            value={digit}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            aria-label={`Code digit ${index + 1}`}
            className={`size-12 rounded-sm border bg-paper-raised text-center font-mono text-xl font-bold outline-none transition focus:border-copper sm:size-14 ${
              digit ? 'border-copper/70 text-copper' : 'border-line-strong'
            }`}
          />
        ))}
        <button type="submit" hidden disabled={pending} aria-hidden="true" tabIndex={-1} />
      </form>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={pending || digits.join('').length !== 6}
        className="!mt-7 w-full rounded-sm bg-copper py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-60"
      >
        {pending ? 'Verifying…' : 'Verify account'}
      </button>

      <div className="mt-5 flex items-center justify-center gap-4 font-mono text-xs text-ink-faint">
        <button
          type="button"
          onClick={() => void resend()}
          disabled={cooldown > 0}
          className="border-b border-line-strong pb-0.5 uppercase tracking-[0.12em] transition hover:border-copper hover:text-copper-deep disabled:opacity-50"
        >
          {cooldown > 0 ? `resend in ${cooldown}s` : 'resend code'}
        </button>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="border-b border-line-strong pb-0.5 uppercase tracking-[0.12em] transition hover:border-copper hover:text-copper-deep"
          >
            back
          </button>
        )}
      </div>
    </div>
  )
}
