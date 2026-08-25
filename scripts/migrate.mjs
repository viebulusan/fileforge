import pg from 'pg'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query(`
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
      CREATE TABLE IF NOT EXISTS license_keys (
        key TEXT PRIMARY KEY,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        redeemed_by TEXT,
        redeemed_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        paypal_order_id TEXT UNIQUE NOT NULL,
        amount_cents INT NOT NULL DEFAULT 700,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'created',
        payer_email TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        captured_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);
      CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
      CREATE TABLE IF NOT EXISTS tool_usage (
        user_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        uses INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, tool)
      );
    `)
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'plan'",
    )
    console.log('migration applied — user.plan present:', rows.length === 1)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
