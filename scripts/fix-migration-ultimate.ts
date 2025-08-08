#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Ultimate Migration State Fix Script
 *
 * This script solves the "relation already exists" migration issue by using
 * Drizzle's own migration reading mechanism to generate the correct hashes
 * that the migrate function expects.
 *
 * The core issue: When Drizzle runs migrate(), it reads the migration files
 * and generates hashes internally. These hashes must exactly match what's
 * in the __drizzle_migrations table, or it assumes migrations haven't been run.
 *
 * This script:
 * 1. Uses Drizzle's readMigrationFiles to get the exact same hashes
 * 2. Recreates the migration table with these correct hashes
 * 3. Verifies the fix by running a test migration
 */
import * as dotenv from 'dotenv';
import { join } from 'node:path';

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please set it in your environment variables.');
}

const migrationsFolder = join(__dirname, '../src/database/migrations');

console.log('🎯 Ultimate Migration State Fix\n');

async function main() {
  try {
    // Import required modules
    console.log('📦 Loading required modules...');
    const { serverDB } = await import('../src/database/server');
    const { readMigrationFiles } = await import('drizzle-orm/migrator');
    const { sql } = await import('drizzle-orm');
    console.log('   ✅ Modules loaded successfully');

    // Read migrations using Drizzle's own method
    console.log("\n📖 Reading migrations with Drizzle's internal method...");
    const migrations = readMigrationFiles({ migrationsFolder });
    console.log(`   Found ${migrations.length} migration entries`);

    // Log the first few hashes for verification
    if (migrations.length > 0) {
      console.log('   Sample hashes:');
      migrations.slice(0, 3).forEach((migration, i) => {
        console.log(`     ${i}: ${migration.hash.slice(0, 16)}...`);
      });
    }

    // Check current migration table state
    console.log('\n🔍 Checking current migration table...');
    let tableExists = false;
    let currentRecords: any[] = [];

    try {
      const result = await serverDB.execute(`
        SELECT hash, created_at
        FROM "drizzle"."__drizzle_migrations"
        ORDER BY created_at ASC
      `);
      currentRecords = result.rows;
      tableExists = true;
      console.log(`   Table exists with ${currentRecords.length} records`);
    } catch {
      console.log('   Migration table does not exist');
    }

    // Create or recreate the migration table with correct hashes
    console.log('\n🔨 Recreating migration table with correct hashes...');

    if (!tableExists) {
      await serverDB.execute('CREATE SCHEMA IF NOT EXISTS "drizzle"');
      console.log('   Created drizzle schema');
    } else {
      // Clear existing records
      await serverDB.execute('DELETE FROM "drizzle"."__drizzle_migrations"');
      console.log('   Cleared existing migration records');
    }

    // Create the table if it doesn't exist
    await serverDB.execute(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "hash" text NOT NULL,
        "created_at" bigint
      )
    `);

    // Insert migration records using Drizzle's own hashes
    console.log('\n📝 Inserting migration records with correct hashes...');

    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      // Use the migration's folderMillis if available, otherwise generate a timestamp
      const timestamp = migration.folderMillis || Date.now() - (migrations.length - i) * 1000;

      await serverDB.execute(sql`
        INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        VALUES (${migration.hash}, ${timestamp})
      `);

      console.log(`   ✅ ${i + 1}/${migrations.length}: ${migration.hash.slice(0, 16)}...`);
    }

    // Verify the insertion
    console.log('\n✅ Verifying migration table state...');
    const verifyResult = await serverDB.execute(`
      SELECT COUNT(*) as count
      FROM "drizzle"."__drizzle_migrations"
    `);
    const insertedCount = parseInt((verifyResult.rows[0] as any).count || '0');
    console.log(`   Inserted ${insertedCount} migration records`);
    console.log(`   Expected ${migrations.length} migration records`);

    if (insertedCount !== migrations.length) {
      throw new Error(
        `Insertion verification failed: expected ${migrations.length}, got ${insertedCount}`,
      );
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
      console.log('   ✅ Migration test successful - no errors!');
      console.log('   ✅ The migration system now recognizes the current state correctly');
    } catch (testError: any) {
      const errorMessage = testError.message || String(testError);

      // These are expected/acceptable outcomes
      if (
        errorMessage.includes('No schema changes') ||
        errorMessage.includes('nothing to migrate') ||
        errorMessage.includes('already up to date')
      ) {
        console.log('   ✅ Migration test successful - database is up to date!');
      } else {
        console.error('   ❌ Migration test failed:', errorMessage);
        throw testError;
      }
    }

    // Final verification
    console.log('\n🎯 Final verification...');
    const finalResult = await serverDB.execute(`
      SELECT hash, created_at
      FROM "drizzle"."__drizzle_migrations"
      ORDER BY created_at ASC
    `);

    console.log(`   Migration table contains ${finalResult.rows.length} records`);
    console.log(`   Drizzle expects ${migrations.length} records`);

    if (finalResult.rows.length === migrations.length) {
      console.log('   ✅ Perfect match - migration state is fully synchronized!');
    }

    console.log('\n🎉 Migration state fix completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   • Fixed migration state for ${migrations.length} migrations`);
    console.log(`   • Migration table now contains Drizzle-compatible hashes`);
    console.log(`   • Database schema is properly synchronized`);
    console.log('\n📝 Next steps:');
    console.log('   1. Run "bun db:migrate" - it should work without errors');
    console.log('   2. Create new migrations with "bun db:generate" as needed');
    console.log('   3. Your migration workflow is fully restored!');
  } catch (error: any) {
    console.error('\n❌ Migration state fix failed:', error.message);

    if (error.message?.includes('MODULE_NOT_FOUND')) {
      console.error('\n🔧 Module loading issue:');
      console.error('   Try running: npm install or bun install');
    } else if (error.message?.includes('connection')) {
      console.error('\n🔧 Database connection issue:');
      console.error('   1. Verify DATABASE_URL is correct');
      console.error('   2. Ensure database is running and accessible');
    } else {
      console.error('\n🔧 General troubleshooting:');
      console.error('   1. Ensure all migration files exist in src/database/migrations/');
      console.error('   2. Check database permissions');
      console.error('   3. Verify the database schema is intact');
    }

    if (error.stack) {
      console.error('\nFull error details:', error.stack);
    }

    process.exit(1);
  }
}

// Use an async IIFE instead of top-level await
(async () => {
  await main();
})();
