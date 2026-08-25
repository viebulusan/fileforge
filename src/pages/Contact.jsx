import { useState } from 'react'

const inputClass =
  'w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-faint focus:border-copper'

export default function Contact() {
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const [error, setError] = useState('')
  const [emailed, setEmailed] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'sending') return
    const form = event.currentTarget
    setError('')
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.value,
          email: form.email.value,
          message: form.message.value,
          company: form.company.value, // honeypot — humans never fill this
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not send your message.')
      setEmailed(Boolean(data.emailed))
      setStatus('sent')
    } catch (err) {
      setStatus('idle')
      setError(err instanceof Error ? err.message : 'Could not send your message.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold normal-case text-copper">//</span>
        talk to the forge
      </p>
      <h1 className="mt-4 text-4xl font-bold uppercase tracking-[-0.02em]">Contact us</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
        Questions, bug reports, feature ideas or conversion problems — drop a
        line and we'll get back to you by email.
      </p>

      {status === 'sent' ? (
        <div className="mt-10 rounded-sm border border-copper/50 bg-paper-raised p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-copper">
            message received
          </p>
          <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
            Thanks — it's in the queue
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            {emailed
              ? "A copy landed in our inbox and we'll reply as soon as we can."
              : "Your message is saved securely and we'll reply as soon as we can."}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-10 space-y-4 rounded-sm border border-line bg-paper-raised/40 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
                name
              </span>
              <input type="text" name="name" required autoComplete="name" className={`mt-2 ${inputClass}`} />
            </label>
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
                email
              </span>
              <input type="email" name="email" required autoComplete="email" className={`mt-2 ${inputClass}`} />
            </label>
          </div>
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
              message
            </span>
            <textarea
              name="message"
              rows={7}
              required
              minLength={10}
              placeholder="What can we help you forge?"
              className={`mt-2 resize-y ${inputClass}`}
            />
          </label>
          {/* honeypot field — visually hidden, bots only */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pointer-events-none absolute size-0 opacity-0"
          />
          {error && (
            <p role="alert" className="border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs leading-relaxed text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full rounded-sm bg-copper px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-paper transition hover:bg-ink disabled:opacity-60 sm:w-auto"
          >
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}
    </div>
  )
}
