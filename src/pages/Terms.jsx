import LegalShell, { Section } from '../components/LegalShell.jsx'

export default function Terms() {
  return (
    <LegalShell kicker="the rules" title="Terms & Conditions" updated="August 23, 2026">
      <Section title="1 · The service">
        <p>
          FileForge is a file-conversion studio that runs primarily inside your
          own browser. Images, PDFs, documents, audio and video are processed
          on your device. An optional local companion service (document
          conversion, video downloading) runs on your own machine and is never
          reachable from the internet.
        </p>
      </Section>

      <Section title="2 · Accounts">
        <ul>
          <li>You need a free account for features that track allowances across sessions.</li>
          <li>One account per person. You are responsible for activity on your account.</li>
          <li>Do not share accounts or redeem license keys on behalf of others.</li>
        </ul>
      </Section>

      <Section title="3 · Pro & payments">
        <ul>
          <li>Pro is a one-time $7 payment — not a subscription.</li>
          <li>Payments are handled by PayPal. We never see or store card details.</li>
          <li>License keys are single-use and tied to the account that redeems them.</li>
          <li>The free tier's allowances (for example document conversions and word caps) may change; paid purchases are never downgraded.</li>
        </ul>
      </Section>

      <Section title="4 · Acceptable use">
        <ul>
          <li>Only convert or download content you own or have permission to use.</li>
          <li>The downloader must not be used to infringe copyright — you alone are responsible for what you fetch and keep.</li>
          <li>No unlawful, harmful or fraudulent use of the service.</li>
        </ul>
      </Section>

      <Section title="5 · No warranty">
        <p>
          The service is provided “as is”. Conversion quality depends on your
          browser, device and the files themselves. The AI scan and originality
          tools produce statistical estimates — signals, not verdicts — and
          must never be treated as proof or legal advice.
        </p>
      </Section>

      <Section title="6 · Liability">
        <p>
          To the maximum extent permitted by law, FileForge is not liable for
          lost or corrupted files, missed deadlines, or any indirect damages
          arising from use of the service. Your files stay with you; keep
          backups of anything important.
        </p>
      </Section>

      <Section title="7 · Changes">
        <p>
          These terms may change as features ship. Material changes will be
          noted on this page with a new “last updated” date. Continued use
          after changes means you accept them.
        </p>
      </Section>
    </LegalShell>
  )
}
