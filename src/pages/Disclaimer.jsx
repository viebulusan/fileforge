import LegalShell, { Section } from '../components/LegalShell.jsx'

export default function Disclaimer() {
  return (
    <LegalShell kicker="honest limits" title="Disclaimer" updated="August 23, 2026">
      <Section title="Conversion fidelity">
        <p>
          Conversions are best-effort renders of your input. Complex layouts,
          exotic fonts, DRM-protected media and heavily compressed sources may
          convert imperfectly or not at all. Always keep the original file.
        </p>
      </Section>

      <Section title="AI scan is an estimate">
        <p>
          The AI scan measures statistical patterns (sentence rhythm,
          vocabulary, stock phrases) and returns a score. It cannot prove a
          text was or wasn't machine-written, and it can be wrong in both
          directions. Treat the result as one signal among many — never as a
          verdict about a person.
        </p>
      </Section>

      <Section title="Originality checker">
        <p>
          The originality tool spot-checks sentences against the open web and
          reports exact matches only. A clean result does not guarantee
          plagiarism-free work; paraphrased or offline sources will not appear.
        </p>
      </Section>

      <Section title="Downloader & copyright">
        <p>
          The downloader fetches whatever URL you give it. You are solely
          responsible for respecting copyright, terms of service of source
          platforms, and local law. Downloading material you have no right to
          keep is not permitted under our <strong>terms</strong>.
        </p>
      </Section>

      <Section title="No professional advice">
        <p>
          Nothing produced by FileForge's writing tools constitutes legal,
          academic-integrity or professional advice.
        </p>
      </Section>
    </LegalShell>
  )
}
