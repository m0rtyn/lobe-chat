#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Migration State Diagnosis Script
 *
 * This script provides comprehensive diagnosis of the migration state issue
 * to help understand exactly what's happening and why Drizzle is failing.
 */
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please set it in your environment variables.');
}

const migrationsFolder = join(__dirname, '../src/database/migrations');

console.log('🔍 Migration State Diagnosis Report\n');
console.log('='.repeat(60));

async function diagnose() {
  try {
    // Load dependencies
    console.log('\n📦 Loading dependencies...');
    const { serverDB } = await import('../src/database/server');
    const { readMigrationFiles } = await import('drizzle-orm/migrator');
    const { DrizzleMigrationModel } = await import('../src/database/models/drizzleMigration');

    console.log('   ✅ Dependencies loaded successfully');

    // 1. Database Connection Test
    console.log('\n🔌 1. Database Connection Test');
    console.log('-'.repeat(30));
    try {
      await serverDB.execute('SELECT 1 as test');
      console.log('   ✅ Database connection successful');
      console.log(`   Database URL: ${process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@')}`);
    } catch (error) {
      console.error('   ❌ Database connection failed:', error);
      return;
    }

    // 2. Migration Files Analysis
    console.log('\n📁 2. Migration Files Analysis');
    console.log('-'.repeat(30));
    try {
      const migrations = readMigrationFiles({ migrationsFolder });
      console.log(`   Found ${migrations.length} migrations using readMigrationFiles()`);

      if (migrations.length > 0) {
        console.log('\n   First 5 migrations:');
        migrations.slice(0, 5).forEach((migration, i) => {
          console.log(`     ${i + 1}. Hash: ${migration.hash.slice(0, 16)}...`);
          console.log(`        Folder: ${migration.folderMillis}`);
          console.log(`        SQL preview: ${migration.sql[0]?.slice(0, 50)}...`);
        });
      }

      // Read the client migrations.json for comparison
      const clientMigrationsPath = join(__dirname, '../src/database/client/migrations.json');
      try {
        const clientMigrations = JSON.parse(readFileSync(clientMigrationsPath, 'utf8'));
        console.log(`\n   Client migrations.json contains ${clientMigrations.length} entries`);

        if (clientMigrations.length !== migrations.length) {
          console.warn(
            `   ⚠️  Mismatch: Server migrations: ${migrations.length}, Client migrations: ${clientMigrations.length}`,
          );
        }
      } catch {
        console.warn('   ⚠️  Could not read client migrations.json');
      }
    } catch (error) {
      console.error('   ❌ Failed to read migration files:', error);
      return;
    }

    // 3. Database Schema Analysis
    console.log('\n🗄️  3. Database Schema Analysis');
    console.log('-'.repeat(30));
    try {
      const migrationModel = new DrizzleMigrationModel(serverDB);
      const tableCount = await migrationModel.getTableCounts();
      console.log(`   Total tables in database: ${tableCount}`);

      // Check for key tables that should exist
      const keyTables = ['users', 'sessions', 'messages', 'agents'];
      for (const table of keyTables) {
        try {
          await serverDB.execute(`SELECT COUNT(*) FROM "${table}" LIMIT 1`);
          console.log(`   ✅ Table "${table}" exists`);
        } catch {
          console.log(`   ❌ Table "${table}" missing`);
        }
      }
    } catch (error) {
      console.error('   ❌ Schema analysis failed:', error);
    }

    // 4. Migration History Table Analysis
    console.log('\n📋 4. Migration History Table Analysis');
    console.log('-'.repeat(30));
    try {
      const result = await serverDB.execute(`
        SELECT hash, created_at
        FROM "drizzle"."__drizzle_migrations"
        ORDER BY created_at ASC
      `);

      console.log(`   Migration table contains ${result.rows.length} records`);

      if (result.rows.length > 0) {
        console.log('\n   First 5 recorded migrations:');
        result.rows.slice(0, 5).forEach((row: any, i) => {
          console.log(`     ${i + 1}. Hash: ${row.hash.slice(0, 16)}...`);
          console.log(`        Created: ${new Date(parseInt(row.created_at)).toISOString()}`);
        });

        console.log('\n   Last 5 recorded migrations:');
        result.rows.slice(-5).forEach((row: any, i) => {
          console.log(`     ${result.rows.length - 4 + i}. Hash: ${row.hash.slice(0, 16)}...`);
          console.log(`        Created: ${new Date(parseInt(row.created_at)).toISOString()}`);
        });
      }
    } catch (error) {
      console.error('   ❌ Migration table not found or inaccessible:', error);
    }

    // 5. Hash Comparison
    console.log('\n🔐 5. Hash Comparison Analysis');
    console.log('-'.repeat(30));
    try {
      const migrations = readMigrationFiles({ migrationsFolder });
      const result = await serverDB.execute(`
        SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC
      `);

      const dbHashes = result.rows.map((row: any) => row.hash);
      const fileHashes = migrations.map((m) => m.hash);

      console.log('   Comparing hashes between filesystem and database...');

      let matches = 0;
      const maxCheck = Math.min(dbHashes.length, fileHashes.length);

      for (let i = 0; i < maxCheck; i++) {
        const dbHash = dbHashes[i];
        const fileHash = fileHashes[i];
        const match = dbHash === fileHash;

        if (match) {
          matches++;
        } else {
          console.log(`   ❌ Mismatch at position ${i + 1}:`);
          console.log(`      DB:   ${dbHash.slice(0, 16)}...`);
          console.log(`      File: ${fileHash.slice(0, 16)}...`);
        }
      }

      console.log(`   ✅ ${matches}/${maxCheck} hashes match`);

      if (matches === maxCheck && dbHashes.length === fileHashes.length) {
        console.log('   ✅ Perfect hash alignment - migration state should be correct');
      } else {
        console.log('   ❌ Hash misalignment detected - this is likely the root cause');
      }
    } catch (error) {
      console.error('   ❌ Hash comparison failed:', error);
    }

    // 6. Test Migration Run
    console.log('\n🧪 6. Test Migration Run');
    console.log('-'.repeat(30));
    try {
      console.log('   Attempting to run migration...');

      let migrate;
      if (process.env.DATABASE_DRIVER === 'node') {
        const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
        migrate = nodeMigrator.migrate;
      } else {
        const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
        migrate = neonMigrator.migrate;
      }

      await migrate(serverDB, { migrationsFolder });
      console.log('   ✅ Migration run successful - no issues detected');
    } catch (error: any) {
      console.error('   ❌ Migration failed:', error.message);

      if (error.message?.includes('already exists')) {
        console.log('   🔍 This is the "relation already exists" error you\'re experiencing');
        console.log("   💡 The issue is that Drizzle thinks migrations haven't been run");
      }
    }

    // 7. Recommendations
    console.log('\n💡 7. Recommendations');
    console.log('-'.repeat(30));

    console.log('   Based on the diagnosis above:');
    console.log('   1. If hash misalignment was detected, run fix-migration-ultimate.ts');
    console.log('   2. If migration table is missing, run populate-migration-history.ts');
    console.log('   3. If database connection fails, check your DATABASE_URL');
    console.log('   4. If migration files are missing, restore them from your repository');

    console.log('\n🎯 Summary');
    console.log('-'.repeat(30));
    const migrations = readMigrationFiles({ migrationsFolder });
    const drizzleMigrationModule = await import('../src/database/models/drizzleMigration');
    const migrationModel = new drizzleMigrationModule.DrizzleMigrationModel(serverDB);
    const tableCount = await migrationModel.getTableCounts();

    try {
      const result = await serverDB.execute(
        `SELECT COUNT(*) as count FROM "drizzle"."__drizzle_migrations"`,
      );
      const migrationCount = parseInt((result.rows[0] as any).count || '0');

      console.log(`   📁 Migration files: ${migrations.length}`);
      console.log(`   🗄️  Database tables: ${tableCount}`);
      console.log(`   📋 Migration records: ${migrationCount}`);

      if (migrations.length === migrationCount && tableCount > 0) {
        console.log('   ✅ Migration state appears consistent');
      } else {
        console.log('   ⚠️  Migration state inconsistency detected');
      }
    } catch {
      console.log('   ❌ Could not complete summary analysis');
    }
  } catch (error) {
    console.error('\n❌ Diagnosis failed:', error);
  }
}

// Use an async IIFE instead of top-level await
(async () => {
  await diagnose();
})();
