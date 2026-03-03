#!/bin/sh
# Database jadvallarini yaratish va seed qilish
npx drizzle-kit push --config=drizzle.config.ts
npx tsx server/seed.ts
echo "✅ Database tayyor!"
