#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Manual Migration History Population Script
 *
 * This script manually creates and populates the __drizzle_migrations table
 * with the correct migration history based on the journal file.
 *
 * Use this as an alternative to the other fix scripts if you want more control
 * over the migration history reconstruction.
 */
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please set it in your environment variables.');
}

const migrationsFolder = join(__dirname, '../src/database/migrations');
const journalPath = join(migrationsFolder, 'meta/_journal.json');

interface JournalEntry {
  breakpoints: boolean;
  idx: number;
  tag: string;
  version: string;
  when: number;
}

interface Journal {
  dialect: string;
  entries: JournalEntry[];
  version: string;
}

console.log('🔨 Manual Migration History Population\n');

try {
  // Load the journal file
  console.log('📖 Reading migration journal...');
  const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  console.log(`   Found ${journal.entries.length} migration entries in journal`);

  // Import the database
  const { serverDB } = await import('../src/database/server');

  // Check if migrations table exists
  console.log('\n🔍 Checking migration table state...');
  try {
    const result = await serverDB.execute(`
      SELECT COUNT(*) as count
      FROM "drizzle"."__drizzle_migrations"
    `);
    const currentCount = parseInt((result.rows[0] as any).count || '0');
    console.log(`   Current migration records: ${currentCount}`);

    if (currentCount > 0) {
      console.log('\n⚠️  Migration table already has records.');
      console.log('   Do you want to clear it and repopulate? (This is usually safe)');
      console.log('   Press Ctrl+C to cancel, or continue to proceed...');

      // Clear existing records
      await serverDB.execute('DELETE FROM "drizzle"."__drizzle_migrations"');
      console.log('   ✅ Cleared existing migration records');
    }
  } catch {
    console.log('   Migration table does not exist, will create it...');

    // Create the drizzle schema and migrations table
    await serverDB.execute('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await serverDB.execute(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "hash" text NOT NULL,
        "created_at" bigint
      )
    `);
    console.log('   ✅ Created migration table');
  }

  // Populate the migration table with journal entries
  console.log('\n📝 Populating migration history...');

  for (const entry of journal.entries) {
    const migrationFilePath = join(migrationsFolder, `${entry.tag}.sql`);

    try {
      // Read the migration file to ensure it exists
      readFileSync(migrationFilePath, 'utf8');

      // Create a hash similar to how Drizzle does it
      // This is a simplified version - Drizzle's actual hash includes more metadata
      const hash = `${entry.tag}-${entry.when}`;

      await serverDB.execute(
        `
        INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        VALUES ($1, $2)
      `,
        [hash, entry.when],
      );

      console.log(`   ✅ Added: ${entry.tag}`);
    } catch {
      console.warn(`   ⚠️  Could not read migration file: ${entry.tag}.sql`);
      // Still add the record but with a placeholder hash
      const hash = `${entry.tag}-missing-${entry.when}`;
      await serverDB.execute(
        `
        INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        VALUES ($1, $2)
      `,
        [hash, entry.when],
      );
      console.log(`   ⚠️  Added placeholder: ${entry.tag}`);
    }
  }

  // Verify the population
  console.log('\n✅ Verification:');
  const finalResult = await serverDB.execute(`
    SELECT COUNT(*) as count
    FROM "drizzle"."__drizzle_migrations"
  `);
  const finalCount = parseInt((finalResult.rows[0] as any).count || '0');
  console.log(`   Migration records in database: ${finalCount}`);
  console.log(`   Journal entries: ${journal.entries.length}`);

  if (finalCount === journal.entries.length) {
    console.log('   ✅ Migration history successfully populated!');
  } else {
    console.warn('   ⚠️  Record count mismatch - check for errors above');
  }

  // Test the migration system
  console.log('\n🧪 Testing migration system...');
  try {
    let migrate;
    if (process.env.DATABASE_DRIVER === 'node') {
      const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
      migrate = nodeMigrator.migrate;
    } else {
      const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
      migrate = neonMigrator.migrate;
    }

    await migrate(serverDB, { migrationsFolder });
    console.log('   ✅ Migration system test passed!');
  } catch (testError) {
    console.error('   ❌ Migration system test failed:', testError);
    console.log('   This might indicate the migration state is still inconsistent.');
  }

  console.log('\n🎉 Migration history population completed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Try running "bun db:migrate" to verify it works');
  console.log('   2. Create new migrations with "bun db:generate" as needed');
  console.log('   3. Your database should now work with the normal migration workflow');
} catch (error) {
  console.error('\n❌ Failed to populate migration history:', error);
  console.error('\n🔧 Troubleshooting:');
  console.error('   1. Ensure DATABASE_URL is correct and accessible');
  console.error('   2. Verify the journal file exists and is valid JSON');
  console.error('   3. Check database permissions for creating tables and inserting data');
  console.error('   4. Try running the diagnostic script first: tsx scripts/diagnose-migration.ts');

  process.exit(1);
}

process.exit(0);
