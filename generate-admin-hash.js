#!/usr/bin/env node
/**
 * Script to generate SHA-256 hash for admin password
 * Usage: node generate-admin-hash.js "your-password"
 */

const crypto = require('crypto');

const password = process.argv[2];

if (!password) {
    console.log('Usage: node generate-admin-hash.js "your-password"');
    console.log('\nExample:');
    console.log('  node generate-admin-hash.js "mySecretPassword123"');
    process.exit(1);
}

const hash = crypto.createHash('sha256').update(password).digest('hex');

console.log('\n📝 Admin Password Hash Generator\n');
console.log('Password:', password);
console.log('SHA-256 Hash:', hash);
console.log('\n💡 Copy this hash to admin.js:');
console.log(`const ADMIN_HASH_SHA256 = '${hash}';`);
console.log('\n');

