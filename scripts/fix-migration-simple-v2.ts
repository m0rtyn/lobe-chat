#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Simple Migration History Fix
 *
 * This script populates the __drizzle_migrations table using the exact hashes
 * that Drizzle's migrate function expects, solving the "relation already exists" issue.
 */
import * as dotenv from 'dotenv';
import { join } from 'node:path';

dotenv.config();

const migrationsFolder = join(__dirname, '../src/database/migrations');

console.log('🔧 Simple Migration History Fix\n');

async function fix() {
  try {
    // Import dependencies
    const { serverDB } = await import('../src/database/server');
    const { readMigrationFiles } = await import('drizzle-orm/migrator');
    const { sql } = await import('drizzle-orm');

    console.log('📖 Reading migration files...');
    const migrations = readMigrationFiles({ migrationsFolder });
    console.log(`   Found ${migrations.length} migrations`);

    console.log('\n🗄️ Setting up migration table...');

    // Create schema if needed
    await serverDB.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);

    // Create table if needed
    await serverDB.execute(sql`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "hash" text NOT NULL,
        "created_at" bigint
      )
    `);

    // Clear existing records
    await serverDB.execute(sql`DELETE FROM "drizzle"."__drizzle_migrations"`);
    console.log('   Cleared existing records');

    console.log('\n📝 Inserting migration records...');

    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      const timestamp = migration.folderMillis || Date.now() - (migrations.length - i) * 1000;

      await serverDB.execute(sql`
        INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        VALUES (${migration.hash}, ${timestamp})
      `);

      console.log(`   ✅ ${i + 1}/${migrations.length}: ${migration.hash.slice(0, 12)}...`);
    }

    console.log('\n🧪 Testing migration...');

    // Test the migration system
    let migrate;
    if (process.env.DATABASE_DRIVER === 'node') {
      const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
      migrate = nodeMigrator.migrate;
    } else {
      const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
      migrate = neonMigrator.migrate;
    }

    await migrate(serverDB, { migrationsFolder });
    console.log('   ✅ Migration test successful!');

    console.log('\n🎉 Migration history fix completed!');
    console.log('   Your database is now ready for normal migration workflow.');
  } catch (error: any) {
    console.error('\n❌ Fix failed:', error.message);
    process.exit(1);
  }
}

fix().then(() => process.exit(0));
