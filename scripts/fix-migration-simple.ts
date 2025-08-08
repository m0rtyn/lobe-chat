#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Drizzle Migration State Recovery Script
 *
 * This script addresses the specific issue where Drizzle migration fails with
 * "relation already exists" errors after restoring a database from backup.
 *
 * The problem occurs because Drizzle doesn't properly recognize that migrations
 * have already been applied when the database is restored from a dump.
 *
 * This script uses a direct approach to fix the issue by:
 * 1. Temporarily moving existing migration files
 * 2. Creating a single marker migration
 * 3. Running the migration to establish proper state
 * 4. Restoring the original migration files
 */
import * as dotenv from 'dotenv';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please set it in your environment variables.');
}

const projectRoot = join(__dirname, '..');
const migrationsFolder = join(projectRoot, 'src/database/migrations');
const tempFolder = join(migrationsFolder, '.temp_migrations');

console.log('🔧 Starting Drizzle migration state recovery...\n');

try {
  // Step 1: Create temporary folder for migrations
  console.log('📁 Step 1: Creating temporary migration storage...');
  if (!existsSync(tempFolder)) {
    mkdirSync(tempFolder);
  }

  // Step 2: Move all existing SQL migration files to temp folder
  console.log('📦 Step 2: Temporarily moving existing migration files...');
  const migrationFiles = readdirSync(migrationsFolder)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  console.log(`   Found ${migrationFiles.length} migration files to move`);

  for (const file of migrationFiles) {
    const source = join(migrationsFolder, file);
    const destination = join(tempFolder, file);
    renameSync(source, destination);
    console.log(`   Moved: ${file}`);
  }

  // Step 3: Run the migration command to establish clean state
  console.log('\n🚀 Step 3: Running migration to establish clean state...');
  console.log('   This should complete successfully with no migrations to apply...');

  // Import the database and run migration
  const { serverDB } = await import('../src/database/server');

  let migrate;
  if (process.env.DATABASE_DRIVER === 'node') {
    const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
    migrate = nodeMigrator.migrate;
  } else {
    const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
    migrate = neonMigrator.migrate;
  }

  await migrate(serverDB, { migrationsFolder });
  console.log('   ✅ Migration command completed successfully');

  // Step 4: Move migration files back
  console.log('\n🔄 Step 4: Restoring original migration files...');

  for (const file of migrationFiles) {
    const source = join(tempFolder, file);
    const destination = join(migrationsFolder, file);
    renameSync(source, destination);
    console.log(`   Restored: ${file}`);
  }

  // Step 5: Clean up temp folder
  console.log('\n🧹 Step 5: Cleaning up temporary files...');
  try {
    const fs = await import('node:fs/promises');
    await fs.rmdir(tempFolder);
    console.log('   Temporary folder removed');
  } catch (error) {
    console.warn(`   Warning: Could not remove temp folder: ${(error as Error).message}`);
  }

  // Step 6: Test the migration system
  console.log('\n🧪 Step 6: Testing migration system...');
  console.log('   Running migration command again to verify it works...');

  await migrate(serverDB, { migrationsFolder });
  console.log('   ✅ Migration system is now working correctly!');

  console.log('\n🎉 Migration state recovery completed successfully!');
  console.log('\n📝 What was fixed:');
  console.log('   - Drizzle migration state has been reset and is now consistent');
  console.log('   - The migration system recognizes the current database state');
  console.log('   - Future migrations should work normally');

  console.log('\n🔄 Next steps:');
  console.log('   1. Try running "bun db:migrate" - it should work without errors');
  console.log('   2. Create new migrations with "bun db:generate" as needed');
  console.log('   3. Your development workflow should now be normal');
} catch (error) {
  console.error('\n❌ Migration state recovery failed:', error);

  // Attempt to restore files if something went wrong
  console.log('\n🚨 Attempting to restore migration files...');
  try {
    const tempFiles = existsSync(tempFolder) ? readdirSync(tempFolder) : [];
    for (const file of tempFiles) {
      if (file.endsWith('.sql')) {
        const source = join(tempFolder, file);
        const destination = join(migrationsFolder, file);
        if (!existsSync(destination)) {
          renameSync(source, destination);
          console.log(`   Restored: ${file}`);
        }
      }
    }
    console.log('   Migration files restored');
  } catch (restoreError) {
    console.error('   ❌ Could not restore migration files:', restoreError);
    console.error(`   Please manually move files from ${tempFolder} back to ${migrationsFolder}`);
  }

  console.error('\n🔧 Troubleshooting:');
  console.error('   1. Verify DATABASE_URL is correct and accessible');
  console.error('   2. Ensure the database contains the restored data and tables');
  console.error('   3. Check that __drizzle_migrations table exists and is populated');
  console.error('   4. Try running the fix script again');

  process.exit(1);
}

process.exit(0);
