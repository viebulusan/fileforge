import pg from 'pg'
import { generateKeys } from '../api/_lib/pro.js'

const count = Number(process.argv[2] ?? 5)
const note = process.argv[3] ?? 'starter batch'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  const keys = generateKeys(count, note)
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    for (const { key, note: n } of keys) {
      await pool.query(
        'INSERT INTO license_keys (key, note) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        [key, n],
      )
    }
    console.log(`minted ${keys.length} key(s):`)
    for (const { key } of keys) console.log(`  ${key}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
