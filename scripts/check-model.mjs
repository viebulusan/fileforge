// Quick check that OPENROUTER_API_KEY works: node --env-file=.env scripts/check-model.mjs
const key = process.env.OPENROUTER_API_KEY
if (!key) {
  console.error('✗ OPENROUTER_API_KEY is not set in .env')
  process.exit(1)
}
const model = process.env.OPENROUTER_MODEL || 'ox-alpha'
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 2000,
    reasoning: { exclude: true },
  }),
})
if (!res.ok) {
  console.error(`✗ ${model} error (${res.status}):`, (await res.text()).slice(0, 200))
  process.exit(1)
}
const data = await res.json()
const text = data.choices?.[0]?.message?.content?.trim()
console.log(text ? `✓ ${model} responded: ${text.slice(0, 60)}` : `✗ ${model} returned no content`)
