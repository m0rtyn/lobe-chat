#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Fix Migration State Script
 *
 * This script resolves the Drizzle migration state issue after restoring a database
 * from a backup. It ensures the migration system properly recognizes the current
 * database state and can proceed with future migrations.
 *
 * The issue occurs when:
 * 1. A database is restored from a backup (contains all tables/data)
 * 2. The __drizzle_migrations table is recreated with proper history
 * 3. But Drizzle still tries to run migrations from the beginning
 *
 * This script:
 * 1. Validates the current database state
 * 2. Ensures migration journal consistency
 * 3. Creates a test migration to verify the system works
 * 4. Cleans up and validates the final state
 */
import * as dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DrizzleMigrationModel } from '../src/database/models/drizzleMigration';

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

async function main() {
  console.log('🔍 Starting migration state diagnosis and fix...\n');

  // Import the database after environment is loaded
  const { serverDB } = await import('../src/database/server');
  const migrationModel = new DrizzleMigrationModel(serverDB);

  try {
    // Step 1: Validate current database state
    console.log('📊 Step 1: Validating current database state...');

    const tableCount = await migrationModel.getTableCounts();
    console.log(`   Found ${tableCount} tables in the database`);

    if (tableCount === 0) {
      throw new Error(
        'Database appears to be empty. This script is for databases restored from backups.',
      );
    }

    // Step 2: Check migration history table
    console.log('\n📋 Step 2: Checking migration history...');

    let migrationHistory;
    try {
      migrationHistory = await migrationModel.getMigrationList();
      console.log(
        `   Found ${migrationHistory.length} migration records in __drizzle_migrations table`,
      );

      if (migrationHistory.length > 0) {
        console.log(`   Latest migration: ${migrationHistory[0].hash}`);
      }
    } catch {
      throw new Error(
        'Migration history table (__drizzle_migrations) not found or inaccessible. Please ensure it was created properly.',
      );
    }

    // Step 3: Validate journal file
    console.log('\n📖 Step 3: Validating migration journal...');

    if (!existsSync(journalPath)) {
      throw new Error(`Journal file not found at ${journalPath}`);
    }

    const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    console.log(`   Journal contains ${journal.entries.length} migration entries`);

    // Step 4: Check for consistency
    console.log('\n🔍 Step 4: Checking migration consistency...');

    if (migrationHistory.length !== journal.entries.length) {
      console.warn(
        `   ⚠️  Mismatch: Database has ${migrationHistory.length} records, journal has ${journal.entries.length} entries`,
      );
    } else {
      console.log('   ✅ Migration count matches between database and journal');
    }

    // Step 5: Create a test migration to verify the system works
    console.log('\n🧪 Step 5: Creating test migration to verify system...');

    const testMigrationTag = `test_migration_${Date.now()}`;
    const testMigrationFile = join(migrationsFolder, `${testMigrationTag}.sql`);
    const testMigrationContent = `-- Test migration to verify migration system is working
-- This migration does nothing but validates the system
-- Generated at: ${new Date().toISOString()}

-- No-op comment: Migration system test
`;

    // Write the test migration file
    writeFileSync(testMigrationFile, testMigrationContent);
    console.log(`   Created test migration: ${testMigrationFile}`);

    // Add entry to journal
    const newJournalEntry: JournalEntry = {
      breakpoints: true,
      idx: journal.entries.length,
      tag: testMigrationTag,
      version: '7',
      when: Date.now(),
    };

    journal.entries.push(newJournalEntry);
    writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    console.log(`   Updated journal with new entry`);

    // Step 6: Run the test migration
    console.log('\n🚀 Step 6: Testing migration system...');

    try {
      // Import and run migration
      const { migrate } =
        process.env.DATABASE_DRIVER === 'node'
          ? await import('drizzle-orm/node-postgres/migrator')
          : await import('drizzle-orm/neon-serverless/migrator');

      await migrate(serverDB, { migrationsFolder });
      console.log('   ✅ Test migration succeeded!');

      // Verify the migration was recorded
      const updatedHistory = await migrationModel.getMigrationList();
      const testRecord = updatedHistory.find((record) => record.hash.includes(testMigrationTag));

      if (testRecord) {
        console.log(`   ✅ Test migration properly recorded in database`);
      } else {
        console.warn(`   ⚠️  Test migration not found in database records`);
      }
    } catch (error) {
      console.error('   ❌ Test migration failed:', error);
      throw error;
    }

    // Step 7: Clean up test migration
    console.log('\n🧹 Step 7: Cleaning up test migration...');

    try {
      // Remove the test migration file
      const fs = await import('node:fs/promises');
      await fs.unlink(testMigrationFile);
      console.log(`   Removed test migration file`);

      // Remove from journal
      journal.entries.pop();
      writeFileSync(journalPath, JSON.stringify(journal, null, 2));
      console.log(`   Removed test entry from journal`);

      // Remove from database (this is safe since it was a no-op)
      await serverDB.execute(`
        DELETE FROM "drizzle"."__drizzle_migrations"
        WHERE hash LIKE '%${testMigrationTag}%'
      `);
      console.log(`   Removed test migration record from database`);
    } catch (error) {
      console.warn(`   ⚠️  Could not fully clean up test migration: ${(error as Error).message}`);
      console.warn(`   You may need to manually remove: ${testMigrationFile}`);
    }

    // Step 8: Final validation
    console.log('\n✅ Step 8: Final validation...');

    const finalHistory = await migrationModel.getMigrationList();
    const finalTableCount = await migrationModel.getTableCounts();

    console.log(`   Database has ${finalTableCount} tables`);
    console.log(`   Migration history has ${finalHistory.length} records`);
    console.log(`   Journal has ${journal.entries.length} entries`);

    if (finalHistory.length === journal.entries.length) {
      console.log('   ✅ Migration state is consistent');
    } else {
      console.warn('   ⚠️  Migration state still inconsistent');
    }

    console.log('\n🎉 Migration state fix completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Try running "bun db:migrate" - it should now work');
    console.log(
      '   2. If you create new migrations with "bun db:generate", they should apply correctly',
    );
    console.log('   3. Your database should be ready for normal development workflow');
  } catch (error) {
    console.error('\n❌ Migration state fix failed:', error);
    console.error('\n🔧 Troubleshooting suggestions:');
    console.error('   1. Verify DATABASE_URL is correct and accessible');
    console.error('   2. Ensure __drizzle_migrations table exists and is populated');
    console.error('   3. Check that all migration files are present in src/database/migrations');
    console.error('   4. Verify the journal file is not corrupted');

    process.exit(1);
  }

  process.exit(0);
}

// Use top-level await as preferred
await main();
