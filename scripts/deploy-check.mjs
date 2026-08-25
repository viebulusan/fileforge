// Deployment preflight: node scripts/deploy-check.mjs
// Verifies everything the Vercel deployment needs is present and sane.
// Run before (and after) wiring env vars in the Vercel dashboard.

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

let failures = 0
const ok = (msg) => console.log(`  ✓ ${msg}`)
const bad = (msg) => {
  failures += 1
  console.log(`  ✗ ${msg}`)
}
const warn = (msg) => console.log(`  ! ${msg}`)

function loadEnv(path) {
  const env = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) env[match[1]] = match[2].trim()
  }
  return env
}

const env = { ...loadEnv('.env') }

console.log('── required for deployment ──')
for (const key of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'OPENROUTER_API_KEY']) {
  if (env[key]) ok(`${key} is set`)
  else bad(`${key} is missing`)
}
if (env.OPENROUTER_API_KEY?.startsWith('sk-or-')) ok('OPENROUTER_API_KEY looks like an OpenRouter key')
else warn('OPENROUTER_API_KEY does not start with sk-or- — double-check it')

console.log('── recommended ──')
if (env.OPENROUTER_MODEL) ok(`OPENROUTER_MODEL pinned (${env.OPENROUTER_MODEL})`)
else warn('OPENROUTER_MODEL not pinned — code default applies')
if (env.VITE_PAYPAL_CLIENT_ID) ok('VITE_PAYPAL_CLIENT_ID set (checkout live)')
else warn('VITE_PAYPAL_CLIENT_ID unset — pricing shows key-redeem fallback')
if (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET) ok('PayPal server credentials set')
else warn('PayPal server credentials missing — checkout will fail')
if (env.PAYPAL_API_BASE?.includes('sandbox')) warn('PAYPAL_API_BASE is sandbox — switch to api-m.paypal.com for real sales')
else ok('PayPal API base is production (or unset)')
if (env.VITE_DOWNLOADER_URL || env.VITE_OFFICE_URL) {
  warn('VITE_DOWNLOADER_URL / VITE_OFFICE_URL set — remember these are localhost-only helpers; leave UNSET in Vercel unless self-hosted')
} else {
  ok('No localhost helper URLs baked in (correct for Vercel)')
}

console.log('── build ──')
for (const dir of ['dist', 'api', 'vercel.json']) {
  if (existsSync(dir)) ok(`${dir}/ exists`)
  else bad(`${dir} missing — run npm run build`)
}

console.log('── serverless functions parse ──')
try {
  execSync('find api -name "*.js" -exec node --check {} +', { stdio: 'pipe' })
  ok('all api/*.js parse')
} catch {
  bad('an api/*.js file has a syntax error')
}

console.log('')
if (failures > 0) {
  console.log(`✗ ${failures} blocker${failures === 1 ? '' : 's'} — fix above before deploying`)
  process.exit(1)
}
console.log('✓ ready to deploy — set the same required vars in the Vercel dashboard')
