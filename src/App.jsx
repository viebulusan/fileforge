import { Routes, Route, Link } from 'react-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Layout from './components/Layout.jsx'
import Landing from './pages/Landing.jsx'
import Convert from './pages/Convert.jsx'
import Pricing from './pages/Pricing.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Account from './pages/Account.jsx'
import Download from './pages/Download.jsx'
import Contact from './pages/Contact.jsx'
import Documents from './pages/Documents.jsx'
import Tools from './pages/Tools.jsx'
import Terms from './pages/Terms.jsx'
import Privacy from './pages/Privacy.jsx'
import Disclaimer from './pages/Disclaimer.jsx'

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-copper">
        404
      </p>
      <h1 className="mt-4 text-4xl font-bold uppercase tracking-[-0.02em]">
        Nothing forged here
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        The page you're after doesn't exist — maybe a mistyped link.
      </p>
      <Link
        to="/"
        className="mt-8 inline-block bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
      >
        Back to the forge
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="/convert" element={<Convert />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/download" element={<Download />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/account" element={<Account />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    <Analytics />
    <SpeedInsights />
    </>
  )
}
