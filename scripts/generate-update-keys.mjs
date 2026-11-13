#!/usr/bin/env node
/**
 * SideFlow Ed25519 Release Manifest Key Generator & Signer
 *
 * Usage:
 *   1. Generate a new Ed25519 keypair for GitHub Releases:
 *        node scripts/generate-update-keys.mjs
 *      - Add Private Key PEM to GitHub Actions secret: UPDATE_SIGNING_PRIVATE_KEY
 *      - Paste Public Key PEM into DEFAULT_UPDATE_PUBLIC_KEY_PEM in electron/updateVerifier.ts
 *
 *   2. Sign `release/latest.yml` in CI (reads UPDATE_SIGNING_PRIVATE_KEY from env):
 *        node scripts/generate-update-keys.mjs --sign release/latest.yml
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const signIdx = args.indexOf('--sign');

if (signIdx !== -1) {
  const targetFile = args[signIdx + 1];
  if (!targetFile) {
    console.error('Missing target file path after --sign');
    process.exit(1);
  }
  const privKeyPem = (process.env.UPDATE_SIGNING_PRIVATE_KEY || '').trim();
  if (!privKeyPem) {
    console.error('UPDATE_SIGNING_PRIVATE_KEY environment variable is not set.');
    process.exit(1);
  }
  const resolved = path.resolve(targetFile);
  const bytes = fs.readFileSync(resolved);
  const privateKey = crypto.createPrivateKey(privKeyPem);
  const signature = crypto.sign(null, bytes, privateKey).toString('base64');
  const sigPath = `${resolved}.sig`;
  fs.writeFileSync(sigPath, `${signature}\n`, 'utf-8');
  console.log(`Signed ${path.basename(resolved)} -> ${path.basename(sigPath)}`);
  process.exit(0);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

console.log('=== SideFlow Ed25519 Update Signing Keypair ===\n');
console.log('1. Save as GitHub Repository Secret `UPDATE_SIGNING_PRIVATE_KEY`:');
console.log(privateKey);
console.log(
  '2. Paste into `DEFAULT_UPDATE_PUBLIC_KEY_PEM` in `electron/updateVerifier.ts`:'
);
console.log(publicKey);
