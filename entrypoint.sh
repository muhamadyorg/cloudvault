#!/bin/sh
set -e

echo "⏳ Database tayyor bo'lishini kutish..."
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "  ...database hali tayyor emas, 2s kutilmoqda"
  sleep 2
done
echo "✅ Database tayyor!"

echo "📦 Barcha jadvallarni yaratish..."
node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(async () => {
  await c.query(\`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW()
    )
  \`);
  await c.query(\`
    CREATE TABLE IF NOT EXISTS folders (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      parent_id VARCHAR,
      created_by VARCHAR NOT NULL,
      is_private BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  \`);
  await c.query(\`
    CREATE TABLE IF NOT EXISTS files (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size BIGINT NOT NULL,
      path TEXT NOT NULL,
      folder_id VARCHAR,
      uploaded_by VARCHAR NOT NULL,
      is_private BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  \`);
  await c.query(\`
    CREATE TABLE IF NOT EXISTS upload_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size BIGINT NOT NULL,
      temp_path TEXT NOT NULL,
      target_folder_id VARCHAR,
      requested_by VARCHAR NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )
  \`);
  await c.query(\`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  \`);
  await c.query(\`
    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  \`);
  await c.query(\`
    CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire)
  \`);
  await c.end();
  console.log('✅ Barcha jadvallar tayyor!');
}).catch(e => { console.error(e.message); process.exit(1); });
"

echo "🌱 Admin va user akkauntlarini yaratish..."
npx tsx server/seed.ts || true

echo "🚀 CloudVault ishga tushmoqda - port 5000..."
exec node dist/index.cjs
