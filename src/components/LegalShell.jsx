import { Link } from 'react-router'

export default function LegalShell({ kicker, title, updated, children }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold normal-case text-copper">//</span>
        {kicker}
      </p>
      <h1 className="mt-4 text-4xl font-bold uppercase tracking-[-0.02em]">{title}</h1>
      {updated && (
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.16em] text-ink-faint">
          last updated · {updated}
        </p>
      )}
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink-soft [&_a]:border-b [&_a]:border-line-strong [&_a]:transition hover:[&_a]:text-copper-deep [&_a:hover]:border-copper [&_h2]:mt-2 [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:text-ink [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_strong]:text-ink">
        {children}
      </div>
      <p className="mt-12 border-t border-line pt-6 font-mono text-xs leading-relaxed text-ink-faint">
        questions about this page?{' '}
        <Link to="/pricing">back to pricing</Link> ·{' '}
        <Link to="/">home</Link>
      </p>
    </div>
  )
}

export function Section({ title, children }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
