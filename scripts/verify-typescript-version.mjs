#!/usr/bin/env node
/**
 * Verify the repository TypeScript 7/TypeScript 6 side-by-side contract.
 *
 * @typescript/native owns the TypeScript 7 compiler and its `tsc` binary.
 * The `typescript` alias intentionally resolves to TypeScript 6 for
 * compiler-API consumers such as the current typescript-eslint release.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

try {
  process.loadEnvFile('.env');
} catch {}

const root = process.cwd();
const nativeSpec = 'npm:typescript@^7.0.2';
const apiSpec = 'npm:@typescript/typescript6@^6.0.2';
const nativeMinimum = [7, 0, 2];
const apiMajor = 6;
const failures = [];
const warnings = [];
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

const pass = (id, detail) => console.log(`[PASS] ${id}: ${detail}`);
const warn = (id, detail) => {
  warnings.push(`${id}: ${detail}`);
  console.warn(`[WARN] ${id}: ${detail}`);
};
const fail = (id, detail) => {
  failures.push(`${id}: ${detail}`);
  console.error(`[FAIL] ${id}: ${detail}`);
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function parseVersion(value) {
  const match = String(value || '').match(/(?:^|@|-)v?(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function versionAtLeast(version, minimum) {
  if (!version) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

function versionIsMajor(version, major) {
  return Boolean(version) && version[0] === major;
}

function packageMetadata(packageName) {
  try {
    const packagePath = requireFromRoot.resolve(`${packageName}/package.json`);
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    try {
      const entry = requireFromRoot.resolve(packageName);
      let directory = path.dirname(entry);
      while (directory !== root && directory !== path.dirname(directory)) {
        const packagePath = path.join(directory, 'package.json');
        if (fs.existsSync(packagePath)) {
          const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
          if (metadata.name === packageName) return metadata;
        }
        directory = path.dirname(directory);
      }
    } catch {}
  }
  return null;
}

function packageVersion(packageName) {
  return packageMetadata(packageName)?.version || null;
}

function requireVersion(packageName) {
  try {
    return requireFromRoot(packageName).version || null;
  } catch (error) {
    fail(`runtime:${packageName}`, `could not load compiler API (${error.code || 'load error'})`);
    return null;
  }
}

function workspacePackagePaths() {
  const rootPackage = readJson('package.json');
  const paths = [];
  for (const pattern of rootPackage.workspaces || []) {
    const parent = pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern;
    const parentPath = path.join(root, parent);
    if (!fs.existsSync(parentPath)) continue;
    const entries = pattern.endsWith('/*')
      ? fs
          .readdirSync(parentPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(parent, entry.name))
      : [parent];
    for (const entry of entries) {
      if (fs.existsSync(path.join(root, entry, 'package.json'))) paths.push(entry);
    }
  }
  return paths.sort();
}

function directDeclarations(metadata, dependencyName) {
  return dependencySections
    .filter((section) => metadata[section]?.[dependencyName])
    .map((section) => ({ section, spec: metadata[section][dependencyName] }));
}

function isCompilerWorkspace(packagePath, metadata) {
  if (packagePath === '.') return true;
  if (directDeclarations(metadata, '@typescript/native').length > 0) return true;
  if (directDeclarations(metadata, 'typescript').length > 0) return true;
  return Object.values(metadata.scripts || {}).some((command) => /\btsc\b/.test(command));
}

function compilerWorkspaces() {
  return [['.', readJson('package.json')]].concat(
    workspacePackagePaths()
      .map((packagePath) => [packagePath, readJson(path.join(packagePath, 'package.json'))])
      .filter(([packagePath, metadata]) => isCompilerWorkspace(packagePath, metadata))
  );
}

function verifyManifestAliases(entries) {
  let aliasWorkspaceCount = 0;
  let apiAliasesValid = true;
  for (const [packagePath, metadata] of entries) {
    const nativeDeclarations = directDeclarations(metadata, '@typescript/native');
    const apiDeclarations = directDeclarations(metadata, 'typescript');
    const hasAnyCompilerAlias = nativeDeclarations.length > 0 || apiDeclarations.length > 0;

    if (!hasAnyCompilerAlias) {
      fail(`package:${packagePath}`, 'missing both required compiler aliases');
      apiAliasesValid = false;
      continue;
    }
    aliasWorkspaceCount += 1;

    for (const { section, spec } of nativeDeclarations) {
      if (spec === nativeSpec) pass(`package:${packagePath}:${section}:@typescript/native`, spec);
      else {
        fail(
          `package:${packagePath}:${section}:@typescript/native`,
          `spec is ${JSON.stringify(spec)}, expected ${nativeSpec}`
        );
      }
    }
    if (nativeDeclarations.length === 0) {
      fail(`package:${packagePath}:@typescript/native`, `missing direct alias ${nativeSpec}`);
    }

    for (const { section, spec } of apiDeclarations) {
      if (spec === apiSpec) pass(`package:${packagePath}:${section}:typescript`, spec);
      else {
        fail(
          `package:${packagePath}:${section}:typescript`,
          `spec is ${JSON.stringify(spec)}, expected ${apiSpec}`
        );
        apiAliasesValid = false;
      }
    }
    if (apiDeclarations.length === 0) {
      fail(`package:${packagePath}:typescript`, `missing direct alias ${apiSpec}`);
      apiAliasesValid = false;
    }
  }
  pass(
    'compiler-workspaces',
    `${entries.length} compiler workspace manifests inspected; ${aliasWorkspaceCount} contain both aliases`
  );
  return { apiAliasesValid };
}

function verifyLockAliases(lockEntry, packageMetadata, label) {
  const expected = [
    ['@typescript/native', nativeSpec],
    ['typescript', apiSpec],
  ];
  let valid = true;
  for (const [dependencyName, expectedSpec] of expected) {
    const declarations = directDeclarations(lockEntry, dependencyName);
    const expectedManifestDeclarations = directDeclarations(packageMetadata, dependencyName);
    if (expectedManifestDeclarations.length === 0) {
      fail(`${label}:${dependencyName}`, 'manifest alias is missing');
      valid = false;
      continue;
    }
    if (declarations.length === 0) {
      fail(`${label}:${dependencyName}`, 'direct alias is missing from lockfile');
      valid = false;
      continue;
    }
    for (const { section, spec } of declarations) {
      if (spec === expectedSpec) pass(`${label}:${section}:${dependencyName}`, spec);
      else {
        fail(
          `${label}:${section}:${dependencyName}`,
          `spec is ${JSON.stringify(spec)}, expected ${expectedSpec}`
        );
        valid = false;
      }
    }
  }
  return valid;
}

function verifyPackageLock(entries) {
  const lockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    fail('package-lock', 'missing');
    return false;
  }
  const lock = readJson('package-lock.json');
  const packages = lock.packages || {};
  let valid = true;
  for (const [packagePath, metadata] of entries) {
    const entry = packages[packagePath === '.' ? '' : packagePath];
    if (!entry) {
      fail(`package-lock:${packagePath}`, 'workspace entry missing');
      valid = false;
      continue;
    }
    valid = verifyLockAliases(entry, metadata, `package-lock:${packagePath}`) && valid;
  }

  const nativeEntries = Object.entries(packages).filter(([key]) =>
    /(^|\/)node_modules\/@typescript\/native$/.test(key)
  );
  const apiEntries = Object.entries(packages).filter(([key]) =>
    /(^|\/)node_modules\/typescript$/.test(key)
  );
  valid = verifyResolvedEntry(
    nativeEntries,
    'package-lock:resolved-native',
    nativeMinimum,
    '7.x',
    valid
  );
  valid = verifyResolvedEntry(
    apiEntries,
    'package-lock:resolved-api',
    [6, 0, 0],
    '6.x',
    valid,
    apiMajor
  );
  return valid;
}

function verifyResolvedEntry(entries, label, minimum, expectedFamily, valid, expectedMajor = null) {
  if (entries.length === 0) {
    fail(label, 'resolved package entry missing');
    return false;
  }
  for (const [key, entry] of entries) {
    const version = parseVersion(entry.version);
    const familyValid =
      expectedMajor === null
        ? versionAtLeast(version, minimum)
        : versionIsMajor(version, expectedMajor);
    if (!familyValid) {
      fail(`${label}:${key}`, `version ${entry.version || 'unknown'} is not ${expectedFamily}`);
      valid = false;
    } else pass(`${label}:${key}`, entry.version);
  }
  return valid;
}

function stripTrailingCommas(text) {
  let output = '';
  let quote = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') {
      quote = true;
      output += character;
      continue;
    }
    if (character === ',') {
      let next = index + 1;
      while (/\s/.test(text[next] || '')) next += 1;
      if (text[next] === '}' || text[next] === ']') continue;
    }
    output += character;
  }
  return output;
}

function readBunLock() {
  const lockPath = path.join(root, 'bun.lock');
  if (!fs.existsSync(lockPath)) {
    fail('bun.lock', 'missing');
    return null;
  }
  try {
    return JSON.parse(stripTrailingCommas(fs.readFileSync(lockPath, 'utf8')));
  } catch {
    fail('bun.lock', 'could not parse lockfile');
    return null;
  }
}

function verifyBunLock(entries) {
  const lock = readBunLock();
  if (!lock) return false;
  const workspaces = lock.workspaces || {};
  let valid = true;
  for (const [packagePath, metadata] of entries) {
    const entry = workspaces[packagePath === '.' ? '' : packagePath];
    if (!entry) {
      fail(`bun.lock:${packagePath}`, 'workspace entry missing');
      valid = false;
      continue;
    }
    valid = verifyLockAliases(entry, metadata, `bun.lock:${packagePath}`) && valid;
  }

  valid = verifyBunResolved(
    lock.packages?.['@typescript/native'],
    'bun.lock:resolved-native',
    nativeMinimum,
    '7.x',
    valid
  );
  valid = verifyBunResolved(
    lock.packages?.typescript,
    'bun.lock:resolved-api',
    [6, 0, 0],
    '6.x',
    valid,
    apiMajor
  );
  return valid;
}

function verifyBunResolved(entry, label, minimum, expectedFamily, valid, expectedMajor = null) {
  const resolved = Array.isArray(entry) ? entry[0] : '';
  const version = parseVersion(resolved);
  const familyValid =
    expectedMajor === null
      ? versionAtLeast(version, minimum)
      : versionIsMajor(version, expectedMajor);
  if (!resolved || !familyValid) {
    fail(label, `resolved entry ${resolved || 'missing'} is not ${expectedFamily}`);
    return false;
  }
  pass(label, resolved);
  return valid;
}

function verifyNpxCompiler() {
  const result = spawnSync('npx', ['--no-install', 'tsc', '--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/Version\s+(\d+\.\d+\.\d+)/i);
  const version = match ? match[1] : null;
  if (result.status !== 0 || !version) {
    fail('npx-tsc', 'could not resolve a compiler version');
    return null;
  }
  if (versionAtLeast(parseVersion(version), nativeMinimum)) pass('npx-tsc', version);
  else fail('npx-tsc', `version ${version} is below TypeScript 7.0.2`);
  return version;
}

function verifyResolvedRuntime() {
  const nativePackageVersion = packageVersion('@typescript/native');
  const apiPackageVersion = packageVersion('typescript');
  const nativePackage = nativePackageVersion ? parseVersion(nativePackageVersion) : null;
  const apiPackage = apiPackageVersion ? parseVersion(apiPackageVersion) : null;

  if (nativePackageVersion && versionAtLeast(nativePackage, nativeMinimum))
    pass('native-package', nativePackageVersion);
  else
    fail(
      'native-package',
      `resolved version ${nativePackageVersion || 'missing'} is not TypeScript 7.0.2+`
    );

  if (apiPackageVersion && versionIsMajor(apiPackage, apiMajor))
    pass('api-package', apiPackageVersion);
  else
    fail('api-package', `resolved version ${apiPackageVersion || 'missing'} is not TypeScript 6.x`);

  const apiCompilerVersion = requireVersion('typescript');
  const apiCompiler = apiCompilerVersion ? parseVersion(apiCompilerVersion) : null;
  if (apiCompilerVersion && versionIsMajor(apiCompiler, apiMajor))
    pass('api-compiler', apiCompilerVersion);
  else
    fail(
      'api-compiler',
      `require('typescript').version is ${apiCompilerVersion || 'missing'}, expected 6.x`
    );

  return {
    nativePackageValid: Boolean(
      nativePackageVersion && versionAtLeast(nativePackage, nativeMinimum)
    ),
    apiPackageValid: Boolean(apiPackageVersion && versionIsMajor(apiPackage, apiMajor)),
    apiCompilerValid: Boolean(apiCompilerVersion && versionIsMajor(apiCompiler, apiMajor)),
  };
}

function reportParserCompatibility(apiAliasValid, runtime) {
  if (apiAliasValid && runtime.apiPackageValid && runtime.apiCompilerValid) {
    pass(
      'parser-compatibility',
      'TypeScript 6 API alias is active for typescript-eslint compiler-API consumers'
    );
  } else if (!apiAliasValid) {
    warn(
      'parser-compatibility',
      'TypeScript 6 API alias is absent; current typescript-eslint requires the side-by-side API compatibility strategy'
    );
  } else {
    fail(
      'parser-compatibility',
      'TypeScript 6 API alias is declared but does not resolve to a TypeScript 6 compiler API'
    );
  }
}

function reportOptionalTool(packageName) {
  const version = packageVersion(packageName);
  if (version) pass(`optional:${packageName}`, `available (${version})`);
  else console.log(`[INFO] optional:${packageName}: unavailable (not required)`);
}

const entries = compilerWorkspaces();
const manifestStatus = verifyManifestAliases(entries);
verifyPackageLock(entries);
verifyBunLock(entries);
const runtime = verifyResolvedRuntime();
verifyNpxCompiler();
reportParserCompatibility(manifestStatus.apiAliasesValid, runtime);
reportOptionalTool('tsgo');
reportOptionalTool('@typescript/native-preview');

console.log(
  `\nTypeScript side-by-side gate: ${failures.length === 0 ? 'PASS' : 'BLOCKED'}; ${warnings.length} warning(s); ${failures.length} failure(s)`
);
if (failures.length > 0) process.exitCode = 1;
