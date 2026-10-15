#!/usr/bin/env node
/**
 * SideFlow Automated Release Orchestrator
 *
 * Automates the end-to-end release lifecycle for https://github.com/NeoShadow7366/SideFlow.git:
 *  1. Ensures git remote `origin` is configured to NeoShadow7366/SideFlow.
 *  2. Runs automated tests (`npm test`) and production build verification (`npm run build`).
 *  3. Auto-commits any uncommitted working-tree changes if present.
 *  4. Bumps semantic version (patch | minor | major | current | explicit x.y.z) in package.json.
 *  5. Creates annotated git tag `vX.Y.Z` and pushes branch + tag to `origin` (triggering GitHub Actions release).
 *  6. Optionally builds local Windows NSIS installer (`release/SideFlow-Setup-X.Y.Z.exe`) when `--local` is passed.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const REPO_URL = 'https://github.com/NeoShadow7366/SideFlow.git';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isLocalBuild = args.includes('--local');
const skipTests = args.includes('--skip-tests');

const positional = args.filter((a) => !a.startsWith('--'));
const bumpType = (positional[0] || 'patch').toLowerCase();

function run(cmd, options = {}) {
  const { silent = false, allowFail = false } = options;
  try {
    const out = execSync(cmd, {
      cwd: ROOT_DIR,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
    });
    return typeof out === 'string' ? out.trim() : '';
  } catch (err) {
    if (allowFail) return '';
    throw err;
  }
}

function readPackageJson() {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function computeNextVersion(currentVersion, type) {
  if (type === 'current') return currentVersion;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;

  const parts = currentVersion
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const [major = 1, minor = 0, patch = 0] = parts;

  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  console.log('\n========================================================');
  console.log('  SideFlow Automated Release Pipeline');
  console.log(`  Target Repository: ${REPO_URL}`);
  console.log('========================================================\n');

  // 1. Ensure git remote origin points to NeoShadow7366/SideFlow
  const currentRemote = run('git remote get-url origin', {
    silent: true,
    allowFail: true,
  });
  if (!currentRemote) {
    console.log(`[1/6] Configuring git remote 'origin' -> ${REPO_URL}`);
    if (!isDryRun) {
      run(`git remote add origin ${REPO_URL}`);
    }
  } else {
    console.log(`[1/6] Git remote 'origin' verified: ${currentRemote}`);
  }

  // 2. Run automated tests & build verification
  if (!skipTests) {
    console.log('\n[2/6] Running automated test suite (npm test)...');
    run('npm test');
  } else {
    console.log('\n[2/6] Skipping test suite (--skip-tests)...');
  }

  console.log('\n[3/6] Verifying production build (npm run build)...');
  run('npm run build');

  // 3. Determine version and tag
  const pkg = readPackageJson();
  const currentVersion = pkg.version || '1.0.0';
  const existingTags = run('git tag -l', { silent: true, allowFail: true })
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);

  let effectiveBump = bumpType;
  if (bumpType === 'auto') {
    effectiveBump = existingTags.includes(`v${currentVersion}`)
      ? 'patch'
      : 'current';
  }

  const nextVersion = computeNextVersion(currentVersion, effectiveBump);
  const nextTag = `v${nextVersion}`;

  console.log(
    `\n[4/6] Preparing release version: v${currentVersion} -> ${nextTag} (${effectiveBump})`
  );

  if (isDryRun) {
    console.log(
      `\n[DRY RUN] Would commit pending changes, tag ${nextTag}, and push to ${REPO_URL}.`
    );
    return;
  }

  // 4. Commit any pending working tree changes before tagging
  const dirtyStatus = run('git status --porcelain', { silent: true });
  if (dirtyStatus) {
    console.log('Staging and committing working tree changes...');
    run('git add -A');
    run(`git commit -m "chore: prepare release ${nextTag}"`);
  }

  // 5. Bump version in package.json (if version changed) and create git tag
  if (nextVersion !== currentVersion) {
    run(`npm version ${nextVersion} -m "chore(release): v%s"`);
  } else if (!existingTags.includes(nextTag)) {
    run(`git tag -a ${nextTag} -m "Release ${nextTag}"`);
  } else {
    console.log(`Tag ${nextTag} already exists locally.`);
  }

  // 6. Optional local NSIS installer packaging
  if (isLocalBuild) {
    console.log(
      '\n[5/6] Building local Windows Per-User NSIS Installer in release/...'
    );
    const hasGhToken = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    if (hasGhToken) {
      run('npm run electron:publish');
    } else {
      run('npm run electron:dist');
    }
  } else {
    console.log(
      '\n[5/6] Skipping local binary packaging (GitHub Actions will build & publish NSIS installer)...'
    );
  }

  // 7. Push branch and tag to GitHub to trigger .github/workflows/release.yml
  const currentBranch =
    run('git rev-parse --abbrev-ref HEAD', { silent: true }) || 'master';
  console.log(
    `\n[6/6] Pushing branch '${currentBranch}' and tag '${nextTag}' to origin...`
  );
  run(`git push -u origin ${currentBranch}`);
  run(`git push origin ${nextTag}`);

  console.log('\n========================================================');
  console.log(`  Release ${nextTag} pushed to GitHub!`);
  console.log(
    `  GitHub Actions is now building SideFlow-Setup-${nextVersion}.exe + latest.yml`
  );
  console.log(
    '  Track progress: https://github.com/NeoShadow7366/SideFlow/actions'
  );
  console.log(
    '  Releases page:  https://github.com/NeoShadow7366/SideFlow/releases'
  );
  console.log('========================================================\n');
}

main();
