#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Quick Migration Test
 *
 * Simple script to test if migrations work without making any changes
 */
import * as dotenv from 'dotenv';
import { join } from 'node:path';

dotenv.config();

const migrationsFolder = join(__dirname, '../src/database/migrations');

console.log('🚀 Quick Migration Test');

async function main() {
  try {
    const { serverDB } = await import('../src/database/server');

    console.log('Testing migration system...');

    let migrate;
    if (process.env.DATABASE_DRIVER === 'node') {
      const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
      migrate = nodeMigrator.migrate;
    } else {
      const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
      migrate = neonMigrator.migrate;
    }

    await migrate(serverDB, { migrationsFolder });
    console.log('✅ Migration test successful!');

  } catch (error: any) {
    console.error('❌ Migration test failed:', error.message);

    if (error.message?.includes('already exists')) {
      console.log('💡 This is the "relation already exists" error.');
      console.log('   Run: tsx scripts/fix-migration-ultimate.ts');
    }
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

async function main() {
  try {
    const { serverDB } = await import('../src/database/server');

    console.log('Testing migration system...');

    let migrate;
    if (process.env.DATABASE_DRIVER === 'node') {
      const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
      migrate = nodeMigrator.migrate;
    } else {
      const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
      migrate = neonMigrator.migrate;
    }

    await migrate(serverDB, { migrationsFolder });
    console.log('✅ Migration test successful!');

  } catch (error: any) {
    console.error('❌ Migration test failed:', error.message);

    if (error.message?.includes('already exists')) {
      console.log('💡 This is the "relation already exists" error.');
      console.log('   Run: tsx scripts/fix-migration-ultimate.ts');
    }
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

try {
  const { serverDB } = await import('../src/database/server');

  console.log('Testing migration system...');

  let migrate;
  if (process.env.DATABASE_DRIVER === 'node') {
    const nodeMigrator = await import('drizzle-orm/node-postgres/migrator');
    migrate = nodeMigrator.migrate;
  } else {
    const neonMigrator = await import('drizzle-orm/neon-serverless/migrator');
    migrate = neonMigrator.migrate;
  }

  await migrate(serverDB, { migrationsFolder });
  console.log('✅ Migration test successful!');
} catch (error: any) {
  console.error('❌ Migration test failed:', error.message);

  if (error.message?.includes('already exists')) {
    console.log('\n💡 This is the "relation already exists" error.');
    console.log('   Run: tsx scripts/fix-migration-ultimate.ts');
  }
}

process.exit(0);
