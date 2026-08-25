import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

const PAIRS = [
  ['.heic', '.jpg'],
  ['.mov', '.mp4'],
  ['.docx', '.pdf'],
  ['.xlsx', '.csv'],
  ['.png', '.webp'],
  ['.wav', '.mp3'],
]

const MANIFEST = [
  {
    family: 'images',
    inputs: 'png jpg webp avif heic svg bmp gif',
    outputs: 'png · jpg · webp · avif · gif · bmp · tiff · ico · svg',
    note: 'free',
  },
  {
    family: 'pdf',
    inputs: 'pdf images',
    outputs: 'merge · extract pages · rotate · pdf ⇄ images',
    note: 'free',
  },
  {
    family: 'documents',
    inputs: 'xlsx xls csv tsv json md',
    outputs: 'xlsx · csv · json · html · pdf',
    note: 'free',
  },
  {
    family: 'writing tools',
    inputs: 'pasted text',
    outputs: 'paraphrase · ai scan · originality',
    note: 'free ≤250 words',
  },
  {
    family: 'audio / video',
    inputs: 'mp4 webm mov mkv mp3 wav flac ogg',
    outputs: 'any of the above · extract audio · gif',
    note: 'pro',
  },
  {
    family: 'office suite',
    inputs: 'word · powerpoint · excel · opendocument',
    outputs: 'clean pdf · pdf → word',
    note: 'free: 3 uses',
  },
  {
    family: 'video downloader',
    inputs: 'youtube facebook instagram + more',
    outputs: 'mp4 · mp3',
    note: 'coming soon',
  },
]

const FAQ = [
  {
    q: 'Are my files uploaded to a server?',
    a: 'No. Images, PDFs, documents, audio and video are converted inside your own browser tab. The only traffic leaving your machine is this page itself and anonymous web lookups for the originality checker.',
  },
  {
    q: 'Is there a file-size limit?',
    a: "Not one we impose. Because conversion happens on your device, the ceiling is your own machine's memory — files that would choke an upload form convert fine here.",
  },
  {
    q: 'How accurate is the AI scan?',
    a: 'The deep-analysis engine scores every sentence for machine-generated patterns and highlights them red (AI-like) or green (human-like). It is built as a screening signal for academic integrity work — strong evidence, but never sole proof.',
  },
  {
    q: 'What do I get for free — and what does Pro cost?',
    a: 'Everything in the converter is free. Documents→PDF includes 3 free uses per account, downloads are coming shortly (3 free uses), and writing tools run free up to 250 words per check. Pro unlocks all of it without limits for a single $7 payment — no subscription.',
  },
  {
    q: 'Can I download YouTube videos?',
    a: 'Very soon — the Download tab is in final testing. It will pull mp4 up to 4K and mp3 from YouTube and thousands of other sites, with 3 free downloads per account; Pro removes the cap.',
  },
  {
    q: 'Do I need an account?',
    a: 'Only for document conversion, downloads and the writing tools — so your free allowance follows you across devices. Browsing and converting never requires signing up.',
  },
]

function usePairCycle() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const reduce =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % PAIRS.length)
    }, 2600)
    return () => clearInterval(timer)
  }, [])
  return PAIRS[index]
}

export default function Landing() {
  const [from, to] = usePairCycle()
  const spotRef = useRef(null)

  function trackSpotlight(event) {
    const el = spotRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    el.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  return (
    <div>
      <section
        ref={spotRef}
        onMouseMove={trackSpotlight}
        className="relative overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(620px circle at var(--mx, 50%) var(--my, 45%), rgb(217 255 61 / 5%), transparent 65%)',
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-20 sm:px-8 sm:pt-28 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
              <span className="font-bold normal-case text-copper">//</span>
              browser-based conversion — nothing uploaded, ever
            </p>
            <h1 className="mt-6 text-[clamp(2.8rem,7vw,5.2rem)] font-bold uppercase leading-[0.95] tracking-[-0.03em]">
              Every format,
              <br />
              forged{' '}
              <span className="text-transparent transition-colors duration-300 [-webkit-text-stroke:1px_var(--color-line-strong)] hover:[-webkit-text-stroke-color:var(--color-copper)]">
                locally
              </span>
              .
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink-soft">
              Images, PDFs, documents, audio and video are transformed right here
              on your device. No queues on someone else's server. No waiting email
              with a download link.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/convert"
                className="inline-flex items-center gap-2.5 bg-copper px-7 py-4 font-mono text-[0.78rem] font-bold uppercase tracking-[0.18em] text-paper transition duration-300 hover:-translate-y-0.5 hover:bg-ink"
              >
                Open converter
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="size-3.5"
                >
                  <path strokeLinecap="round" d="M2 8h11m0 0-4-4m4 4-4 4" />
                </svg>
              </Link>
              <a
                href="#supported"
                className="inline-flex items-center border border-line-strong px-7 py-4 font-mono text-[0.78rem] font-medium uppercase tracking-[0.18em] text-ink transition duration-300 hover:-translate-y-0.5 hover:border-copper hover:text-copper"
              >
                See what's supported
              </a>
            </div>
            <p className="mt-9 font-mono text-xs uppercase tracking-[0.22em] text-ink-faint">
              drop files → pick a format → download.
            </p>
          </div>

        <div className="relative hidden select-none lg:block" aria-hidden="true">
          <div className="rounded-sm border border-line bg-paper-raised px-10 py-12">
            <div className="font-mono text-3xl font-medium">
              <span key={from} className="block animate-[fadein_.45s_ease]">
                {from}
              </span>
              <svg
                viewBox="0 0 40 16"
                className="my-3 h-4 w-10 text-copper"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" d="M2 8h32m0 0-6-6m6 6-6 6" />
              </svg>
              <span key={to} className="block animate-[fadein_.45s_ease] text-copper">
                {to}
              </span>
            </div>
          </div>
          <p className="mt-4 text-right font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            one mapping at a time — there are dozens
          </p>
        </div>
        </div>
      </section>

      <section id="supported" className="scroll-mt-16 border-y border-line bg-paper-raised">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
            <span className="font-bold normal-case text-copper">//</span>
            supported conversions
          </p>

          {/* mobile: stacked cards — tables overflow on phones */}
          <ul className="mt-8 grid gap-3 sm:hidden">
            {MANIFEST.map((row) => (
              <li key={row.family} className="rounded-sm border border-line bg-paper p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold capitalize">{row.family}</h3>
                  {row.note.startsWith('pro') ? (
                    <span className="shrink-0 border border-copper/40 bg-copper-wash px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider text-copper">{row.note}</span>
                  ) : (
                    <span className="shrink-0 font-mono text-[0.62rem] uppercase tracking-wider text-ink-faint">{row.note}</span>
                  )}
                </div>
                <dl className="mt-3 space-y-1.5 font-mono text-xs leading-relaxed text-ink-soft">
                  <div className="flex gap-2">
                    <dt aria-hidden="true" className="w-14 shrink-0 text-ink-faint">reads</dt>
                    <dd className="min-w-0 break-words">{row.inputs}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt aria-hidden="true" className="w-14 shrink-0 text-ink-faint">writes</dt>
                    <dd className="min-w-0 break-words">{row.outputs}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* sm and up: the table */}
          <table className="mt-8 hidden w-full border-collapse text-left sm:table">
            <thead>
              <tr className="border-b border-line-strong font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
                <th className="py-3 pr-4 font-normal">family</th>
                <th className="hidden py-3 pr-4 font-normal md:table-cell">reads</th>
                <th className="py-3 pr-4 font-normal">writes</th>
                <th className="py-3 text-right font-normal">plan</th>
              </tr>
            </thead>
            <tbody>
              {MANIFEST.map((row) => (
                <tr key={row.family} className="border-b border-line transition-colors last:border-0 hover:bg-copper-wash">
                  <td className="py-3.5 pr-4 font-semibold">{row.family}</td>
                  <td className="hidden py-3.5 pr-4 font-mono text-xs text-ink-soft md:table-cell">
                    {row.inputs}
                  </td>
                  <td className="py-3.5 pr-4 font-mono text-xs text-ink-soft">
                    {row.outputs}
                  </td>
                  <td className="py-3.5 text-right font-mono text-xs uppercase tracking-wider">
                    {row.note.startsWith('pro') ? (
                      <span className="border border-copper/40 bg-copper-wash px-2 py-0.5 text-copper">{row.note}</span>
                    ) : (
                      <span className="text-ink-faint">{row.note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
            <span className="font-bold normal-case text-copper">//</span>
            frequently asked questions
          </p>
          <h2 className="mt-4 text-3xl font-bold uppercase tracking-[-0.02em]">
            Straight answers
          </h2>
          <div className="mt-10 grid gap-x-12 gap-y-1 lg:grid-cols-2">
            {FAQ.map((item, index) => (
              <details key={item.q} className="group border-b border-line py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-semibold leading-relaxed">
                    <span aria-hidden="true" className="mr-3 font-mono text-xs text-copper">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 font-mono text-lg leading-none text-copper transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 pl-9 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
          {[
            {
              h: 'Private by physics',
              p: 'Conversion code runs inside your browser tab. Your files would have to leave the room to reach a server — ours never do.',
            },
            {
              h: 'No artificial limits',
              p: "Because nothing is uploaded, the only ceiling is your own machine. Big files convert exactly where they live.",
            },
            {
              h: 'Built for repetition',
              p: "Queue a whole folder, tune quality per file, and pull everything down as one archive when it's done.",
            },
          ].map((card) => (
            <div key={card.h} className="bg-paper p-8 transition-colors hover:bg-paper-raised">
              <span className="font-mono text-xs font-bold text-copper">01</span>
              <h2 className="mt-3 font-semibold">{card.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.p}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
