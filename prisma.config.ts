import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma CLI (migrate, studio) connects as the table owner.
// The running app uses DATABASE_URL with the restricted `rotiqa_app` role instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL,
  },
})
