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

echo "📦 Jadvallarni yaratish (db:push)..."
npm run db:push

echo "🌱 Admin va user akkauntlarini yaratish..."
npx tsx server/seed.ts || true

echo "🚀 CloudVault ishga tushmoqda - port 5000..."
exec node dist/index.cjs
