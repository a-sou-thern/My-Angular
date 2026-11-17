#!/usr/bin/env node
/**
 * Prepares the Bazel-built Angular packages in `dist/packages-dist` for publishing
 * under a different npm scope and version.
 *
 * What it does, for every package directory in the dist folder:
 *   1. Renames the package from `@angular/<name>` to `<scope>/<name>`.
 *   2. Replaces the stamped build version (e.g. `22.4.0-next.0+sha-ff38487`) with the
 *      release version everywhere it appears (package.json, peer dependencies, and the
 *      `VERSION` constants compiled into the JavaScript bundles).
 *
 * Import specifiers inside the code (e.g. `import ... from '@angular/core'`) are left
 * untouched on purpose. Consumers install the packages through npm aliases, for example:
 *
 *   npm i @angular/core@npm:@a-sou-thern/core@22.4.0
 *
 * which keeps the Angular CLI and every library that imports `@angular/*` working.
 *
 * Usage:
 *   node scripts/fork/prepare-publish.mjs --scope @a-sou-thern --version 22.4.0 [--dist dist/packages-dist]
 */

import {readdirSync, readFileSync, writeFileSync, statSync, existsSync} from 'node:fs';
import {join, extname} from 'node:path';
import {parseArgs} from 'node:util';

const {values} = parseArgs({
  options: {
    scope: {type: 'string'},
    version: {type: 'string'},
    dist: {type: 'string', default: 'dist/packages-dist'},
  },
});

const scope = values.scope;
const newVersion = values.version?.replace(/^v/, '');
const distDir = values.dist;

if (!scope || !/^@[a-z0-9][a-z0-9._-]*$/.test(scope)) {
  fail(`--scope must look like "@my-scope" (got "${scope}")`);
}
if (!newVersion || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(newVersion)) {
  fail(`--version must be a valid semver version like 22.4.0 or 22.4.0-rc.1 (got "${values.version}")`);
}
if (!existsSync(distDir)) {
  fail(`Dist directory "${distDir}" does not exist. Run the package build first.`);
}

const TEXT_EXTENSIONS = new Set(['.json', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.map', '.md']);

const packageDirs = readdirSync(distDir)
  .map((name) => join(distDir, name))
  .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, 'package.json')));

if (packageDirs.length === 0) {
  fail(`No packages found in "${distDir}".`);
}

const prepared = [];
for (const dir of packageDirs) {
  const pkgJsonPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const builtVersion = pkg.version;

  if (!builtVersion || builtVersion.includes('PLACEHOLDER')) {
    fail(`${pkg.name}: version was not stamped (${builtVersion}). Build with a stamping config.`);
  }

  // 1. Replace the stamped version in every text file of the package.
  let filesChanged = 0;
  for (const file of walk(dir)) {
    if (!TEXT_EXTENSIONS.has(extname(file))) continue;
    const content = readFileSync(file, 'utf8');
    if (!content.includes(builtVersion)) continue;
    writeFileSync(file, content.split(builtVersion).join(newVersion));
    filesChanged++;
  }

  // 2. Rename the package itself (only @angular/* packages are renamed).
  const updated = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const originalName = updated.name;
  if (originalName.startsWith('@angular/')) {
    updated.name = `${scope}/${originalName.slice('@angular/'.length)}`;
  }
  updated.version = newVersion;
  updated.publishConfig = {...(updated.publishConfig ?? {}), access: 'public'};
  // Point package metadata at the fork so npm shows the right source.
  if (process.env.GITHUB_REPOSITORY) {
    updated.repository = {
      type: 'git',
      url: `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`,
      ...(updated.repository?.directory ? {directory: updated.repository.directory} : {}),
    };
  }
  writeFileSync(pkgJsonPath, JSON.stringify(updated, null, 2) + '\n');

  prepared.push({dir, from: `${originalName}@${builtVersion}`, to: `${updated.name}@${newVersion}`, filesChanged});
}

for (const p of prepared) {
  console.log(`${p.from}  ->  ${p.to}  (${p.filesChanged} files updated)`);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function fail(message) {
  console.error(`prepare-publish: ${message}`);
  process.exit(1);
}
