#!/usr/bin/env node

/**
 * Setup Verification Script
 * Checks if the backend is properly configured
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying CollabCanvas Backend Setup...\n');

let hasErrors = false;
let warnings = [];

// Check Node.js version
const nodeVersion = process.versions.node;
const [major] = nodeVersion.split('.').map(Number);
console.log(`✓ Node.js version: ${nodeVersion}`);
if (major < 18) {
  console.error('❌ Node.js 18 or higher is required');
  hasErrors = true;
}

// Check required files
const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'src/server.ts',
  'src/config/database.ts',
  'src/config/firebase.ts',
  'src/routes/index.ts',
  'src/websocket/WebSocketServer.ts',
];

console.log('\n📁 Checking required files:');
requiredFiles.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`  ✓ ${file}`);
  } else {
    console.error(`  ❌ ${file} - MISSING`);
    hasErrors = true;
  }
});

// Check .env file
console.log('\n⚙️  Checking configuration:');
if (fs.existsSync(path.join(__dirname, '.env'))) {
  console.log('  ✓ .env file exists');
  
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const requiredVars = [
    'DATABASE_HOST',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
  ];
  
  requiredVars.forEach(varName => {
    if (envContent.includes(varName)) {
      console.log(`    ✓ ${varName} configured`);
    } else {
      console.error(`    ❌ ${varName} - MISSING`);
      hasErrors = true;
    }
  });

  // Check Firebase config
  if (envContent.includes('FIREBASE_SERVICE_ACCOUNT_PATH')) {
    const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_PATH=(.+)/);
    if (match) {
      const firebasePath = match[1].trim();
      if (fs.existsSync(path.join(__dirname, firebasePath))) {
        console.log('    ✓ Firebase service account file found');
      } else {
        console.error(`    ❌ Firebase service account file not found: ${firebasePath}`);
        hasErrors = true;
      }
    }
  } else if (envContent.includes('FIREBASE_PROJECT_ID')) {
    console.log('    ✓ Firebase environment variables configured');
  } else {
    console.error('    ❌ Firebase configuration missing');
    hasErrors = true;
  }
} else {
  console.error('  ❌ .env file not found');
  console.log('    → Copy ENV_TEMPLATE.md content to .env');
  hasErrors = true;
}

// Check node_modules
console.log('\n📦 Checking dependencies:');
if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('  ✓ node_modules exists');
  
  const criticalPackages = [
    'express',
    'ws',
    'pg',
    'firebase-admin',
    'typescript',
  ];
  
  criticalPackages.forEach(pkg => {
    if (fs.existsSync(path.join(__dirname, 'node_modules', pkg))) {
      console.log(`    ✓ ${pkg}`);
    } else {
      console.error(`    ❌ ${pkg} not installed`);
      hasErrors = true;
    }
  });
} else {
  console.error('  ❌ node_modules not found');
  console.log('    → Run: npm install');
  hasErrors = true;
}

// Check TypeScript compilation
console.log('\n🔨 Checking TypeScript:');
if (fs.existsSync(path.join(__dirname, 'node_modules', '.bin', 'tsc'))) {
  console.log('  ✓ TypeScript compiler available');
} else {
  console.error('  ❌ TypeScript not installed');
  hasErrors = true;
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('\n❌ Setup verification FAILED');
  console.log('\nPlease fix the errors above and run this script again.');
  console.log('For help, see QUICKSTART.md or README.md\n');
  process.exit(1);
} else {
  console.log('\n✅ Setup verification PASSED!');
  console.log('\nYour backend is ready to run!');
  console.log('\nNext steps:');
  console.log('  1. Make sure PostgreSQL is running');
  console.log('  2. Create database: createdb gauntletaidb');
  console.log('  3. Run schema: psql gauntletaidb < ../gauntlet-ai-frontend/@docs/DATABASE_SCHEMA.sql');
  console.log('  4. Start server: npm run dev');
  console.log('\n' + '='.repeat(50) + '\n');
}

if (warnings.length > 0) {
  console.log('\n⚠️  Warnings:');
  warnings.forEach(warning => console.log(`  - ${warning}`));
  console.log('');
}

