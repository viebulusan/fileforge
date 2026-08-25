import LegalShell, { Section } from '../components/LegalShell.jsx'

export default function Privacy() {
  return (
    <LegalShell kicker="what we keep — and never touch" title="Privacy Policy" updated="August 23, 2026">
      <Section title="The short version">
        <p>
          Your files are processed on your device and are never uploaded to us.
          The only personal data we hold is what an account requires: your
          email, a password hash, your plan status and usage counters.
        </p>
      </Section>

      <Section title="What we store">
        <ul>
          <li><strong>Account:</strong> email address + a salted password hash (Better Auth on our hosted Postgres).</li>
          <li><strong>Plan status:</strong> free / pro, redeemed license keys.</li>
          <li><strong>Usage counters:</strong> per-tool tallies (e.g. document conversions used) so free allowances can be enforced.</li>
          <li><strong>Payments:</strong> PayPal order IDs, amount, payer email — for receipts and support. Card data never touches us.</li>
        </ul>
      </Section>

      <Section title="What we never receive">
        <ul>
          <li>Your converted files — image, PDF, audio and video work happens in your browser tab.</li>
          <li>Office documents — the optional conversion service runs on <em>your</em> machine via LibreOffice; files stay in local temp folders.</li>
          <li>Videos you download — those go from the source site straight through your local service to your disk.</li>
        </ul>
      </Section>

      <Section title="Third parties">
        <ul>
          <li><strong>PayPal</strong> processes payments; their privacy policy applies to the payment itself.</li>
          <li><strong>Originality checker:</strong> when you run it, a few distinctive sentences are queried against the open web to find matches. Queries are isolated fragments and are not linked back to you by us.</li>
          <li>We host the account database on managed cloud infrastructure (Neon Postgres).</li>
        </ul>
      </Section>

      <Section title="Cookies & local storage">
        <p>
          We set one essential session cookie so you stay signed in. No
          analytics cookies, no trackers, no advertising.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Ask us to delete your account and we remove your email, plan record,
          usage counters and payment references. Files were never ours to
          delete.
        </p>
      </Section>
    </LegalShell>
  )
}
