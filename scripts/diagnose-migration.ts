#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Migration State Diagnostic Script
 *
 * This script diagnoses the current state of the Drizzle migration system
 * and helps identify why migrations might be failing after a database restore.
 */
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DrizzleMigrationModel } from '../src/database/models/drizzleMigration';

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const migrationsFolder = join(__dirname, '../src/database/migrations');
const journalPath = join(migrationsFolder, 'meta/_journal.json');

console.log('🔍 Drizzle Migration State Diagnostic\n');
console.log(`Database URL: ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);
console.log(`Migration Driver: ${process.env.DATABASE_DRIVER || 'neon-serverless (default)'}\n`);

try {
  // Import the database
  const { serverDB } = await import('../src/database/server');
  const migrationModel = new DrizzleMigrationModel(serverDB);

  // Check database connectivity
  console.log('🔌 Database Connectivity:');
  try {
    await serverDB.execute('SELECT 1');
    console.log('   ✅ Database connection successful\n');
  } catch (error) {
    console.error('   ❌ Database connection failed:', error);
    process.exit(1);
  }

  // Check table count
  console.log('📊 Database State:');
  try {
    const tableCount = await migrationModel.getTableCounts();
    console.log(`   Tables in database: ${tableCount}`);

    if (tableCount === 0) {
      console.log('   ⚠️  Database appears to be empty');
    } else {
      console.log('   ✅ Database contains tables (restored from backup)');
    }
  } catch (error) {
    console.error('   ❌ Could not count tables:', error);
  }

  // Check migration history table
  console.log('\n📋 Migration History:');
  try {
    const migrationHistory = await migrationModel.getMigrationList();
    console.log(`   Migration records in database: ${migrationHistory.length}`);

    if (migrationHistory.length === 0) {
      console.log('   ❌ No migration history found - this is likely the problem!');
      console.log('   💡 The __drizzle_migrations table is empty or missing');
    } else {
      console.log('   ✅ Migration history table exists and has records');
      console.log(`   Latest migration hash: ${migrationHistory[0].hash.slice(0, 20)}...`);
      console.log(`   Oldest migration hash: ${migrationHistory.at(-1)!.hash.slice(0, 20)}...`);
    }
  } catch (error) {
    console.error('   ❌ Could not access migration history:', error);
    console.log('   💡 The __drizzle_migrations table likely does not exist');
  }

  // Check journal file
  console.log('\n📖 Migration Journal:');
  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    console.log(`   Journal entries: ${journal.entries.length}`);
    console.log(`   Journal version: ${journal.version}`);
    console.log(`   Journal dialect: ${journal.dialect}`);

    if (journal.entries.length > 0) {
      const latest = journal.entries.at(-1)!;
      console.log(`   Latest journal entry: ${latest.tag} (idx: ${latest.idx})`);
    }
  } catch (error) {
    console.error('   ❌ Could not read journal file:', error);
  }

  // Check migration files
  console.log('\n📁 Migration Files:');
  try {
    const fs = await import('node:fs/promises');
    const allFiles = await fs.readdir(migrationsFolder);
    const files = allFiles.filter((f) => f.endsWith('.sql')).sort();

    console.log(`   SQL migration files: ${files.length}`);
    if (files.length > 0) {
      console.log(`   First migration: ${files[0]}`);
      console.log(`   Last migration: ${files.at(-1)!}`);
    }
  } catch (error) {
    console.error('   ❌ Could not read migration files:', error);
  }

  // Summary and recommendations
  console.log('\n📝 Summary and Recommendations:\n');

  const tableCount = await migrationModel.getTableCounts();
  let migrationCount = 0;
  try {
    const migrationHistory = await migrationModel.getMigrationList();
    migrationCount = migrationHistory.length;
  } catch {
    // Migration table doesn't exist
  }

  if (tableCount > 0 && migrationCount === 0) {
    console.log('🔴 PROBLEM IDENTIFIED:');
    console.log('   Your database has tables (restored from backup) but no migration history.');
    console.log('   This causes Drizzle to think it needs to run all migrations from scratch.');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   1. Run the fix-migration-simple.ts script to reset the migration state');
    console.log('   2. Or manually populate the __drizzle_migrations table with proper records');
    console.log('');
    console.log('🚀 COMMAND TO FIX:');
    console.log('   tsx scripts/fix-migration-simple.ts');
  } else if (tableCount > 0 && migrationCount > 0) {
    console.log('🟡 POTENTIAL ISSUE:');
    console.log('   You have both tables and migration history, but migrations are still failing.');
    console.log('   This might be a Drizzle state inconsistency issue.');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   1. Try running the fix-migration-simple.ts script');
    console.log('   2. Check if migration file hashes match database records');
    console.log('');
    console.log('🚀 COMMAND TO TRY:');
    console.log('   tsx scripts/fix-migration-simple.ts');
  } else if (tableCount === 0) {
    console.log('🟢 NORMAL STATE:');
    console.log('   Your database appears to be empty, which is normal for a fresh setup.');
    console.log('   Regular migration commands should work fine.');
    console.log('');
    console.log('🚀 COMMAND TO RUN:');
    console.log('   bun db:migrate');
  } else {
    console.log('🔵 UNCLEAR STATE:');
    console.log('   The diagnostic could not determine the exact issue.');
    console.log('   Try running the migration fix script or check the logs above for errors.');
  }
} catch (error) {
  console.error('\n❌ Diagnostic failed:', error);
  console.log('\n🔧 Basic troubleshooting:');
  console.log('   1. Verify DATABASE_URL is correct');
  console.log('   2. Ensure database is accessible');
  console.log('   3. Check network connectivity to your Railway database');
}

process.exit(0);
