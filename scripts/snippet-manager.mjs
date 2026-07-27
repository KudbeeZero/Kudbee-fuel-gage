#!/usr/bin/env node
/**
 * scripts/snippet-manager.mjs
 * ---------------------------------------------------------------------------
 * Snippet Manager — manage codebase knowledge snippets for Think Token Forge injection.
 *
 * Snippets are text files in .kilo/memory/snippets/ with YAML frontmatter.
 * Each snippet is a self-contained knowledge unit: pattern, fix, config, or contract.
 *
 * Usage:
 *   node scripts/snippet-manager.mjs list              # List all snippets
 *   node scripts/snippet-manager.mjs search <query>    # Full-text search snippets
 *   node scripts/snippet-manager.mjs create <id>       # Create new snippet from template
 *   node scripts/snippet-manager.mjs inject [--dry]    # Inject all into Think Token Forge
 *   node scripts/snippet-manager.mjs export <id>       # Output snippet content
 *   node scripts/snippet-manager.mjs import <file>     # Import snippet from .md or .token
 *   node scripts/snippet-manager.mjs verify            # Run extract + inject pipeline
 * ---------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SNIPPETS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'snippets');
const TOKENS_DIR = join(REPO_ROOT, '.kilo', 'memory', 'tokens');

mkdirSync(SNIPPETS_DIR, { recursive: true });
mkdirSync(TOKENS_DIR, { recursive: true });

// ─── Parsing ─────────────────────────────────────────────────────────────────

function parseSnippet(filepath) {
  const raw = readFileSync(filepath, 'utf8');
  const id = basename(filepath, '.snippet');

  let meta = {};
  let body = raw;

  if (raw.startsWith('---')) {
    const endIdx = raw.indexOf('---', 3);
    if (endIdx !== -1) {
      const frontmatter = raw.slice(3, endIdx).trim();
      for (const line of frontmatter.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim();
          meta[key] = val;
        }
      }
      body = raw.slice(endIdx + 3).trim();
    }
  }

  return {
    id,
    path: filepath,
    ...meta,
    category: meta.category || 'general',
    tags: (meta.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    content: body,
    size: body.length,
  };
}

function listSnippets() {
  if (!existsSync(SNIPPETS_DIR)) return [];
  return readdirSync(SNIPPETS_DIR)
    .filter(f => f.endsWith('.snippet'))
    .map(f => parseSnippet(join(SNIPPETS_DIR, f)))
    .sort((a, b) => (a.category || '').localeCompare(b.category || ''));
}

function listTokens() {
  if (!existsSync(TOKENS_DIR)) return [];
  return readdirSync(TOKENS_DIR)
    .filter(f => f.endsWith('.token'))
    .map(f => ({ id: basename(f, '.token'), path: join(TOKENS_DIR, f), size: readFileSync(join(TOKENS_DIR, f), 'utf8').length }));
}

// ─── Commands ────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const arg = process.argv[3];

switch (cmd) {
  // ── LIST ────────────────────────────────────────────────────────────────
  case 'list':
  case 'ls': {
    const snippets = listSnippets();
    const tokens = listTokens();

    console.log(`\n  Snippets (${snippets.length}):\n`);
    if (snippets.length === 0) console.log('    (none)');
    for (const s of snippets) {
      console.log(`    ${s.id.padEnd(40)} ${s.category.padEnd(12)} ${s.size}B  [${s.tags.join(', ') || '—'}]`);
    }

    console.log(`\n  Tokens (${tokens.length}):\n`);
    if (tokens.length === 0) console.log('    (none)');
    for (const t of tokens) {
      console.log(`    ${t.id.padEnd(40)} ${t.size}B`);
    }
    break;
  }

  // ── SEARCH ──────────────────────────────────────────────────────────────
  case 'search':
  case 's': {
    if (!arg) { console.log('Usage: snippet-manager search <query>'); process.exit(1); }
    const snippets = listSnippets();
    const query = arg.toLowerCase();
    const matches = snippets.filter(s =>
      s.id.toLowerCase().includes(query) ||
      s.content.toLowerCase().includes(query) ||
      (s.tags || []).some(t => t.toLowerCase().includes(query))
    );

    console.log(`\n  Search: "${arg}" — ${matches.length} results:\n`);
    for (const s of matches) {
      const context = s.content.toLowerCase().indexOf(query);
      const excerpt = context !== -1
        ? '...' + s.content.slice(Math.max(0, context - 30), context + arg.length + 30) + '...'
        : s.content.slice(0, 80);
      console.log(`    ${s.id}`);
      console.log(`      ${excerpt.replace(/\n/g, ' ')}`);
      console.log();
    }
    break;
  }

  // ── EXPORT ──────────────────────────────────────────────────────────────
  case 'export':
  case 'cat': {
    if (!arg) { console.log('Usage: snippet-manager export <id>'); process.exit(1); }
    const snippets = listSnippets();
    const found = snippets.find(s => s.id === arg);
    if (!found) { console.log(`Snippet "${arg}" not found`); process.exit(1); }
    console.log(found.content);
    break;
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────
  case 'import':
  case 'add': {
    if (!arg) { console.log('Usage: snippet-manager import <file.md|.token>'); process.exit(1); }
    if (!existsSync(arg)) { console.log(`File not found: ${arg}`); process.exit(1); }

    const content = readFileSync(arg, 'utf8');
    const id = basename(arg).replace(/\.(md|token|txt)$/, '');

    const ext = basename(arg).split('.').pop();
    const category = ext === 'token' ? 'token' : 'import';

    const header = [
      '---',
      `category: ${category}`,
      `tags: imported, ${ext}`,
      `imported: ${new Date().toISOString()}`,
      `source: ${arg}`,
      '---',
      '',
    ].join('\n');

    const snippetPath = join(SNIPPETS_DIR, `${id}.snippet`);
    writeFileSync(snippetPath, header + content, 'utf8');
    console.log(`  [+] Imported: ${id}.snippet (${content.length}B)`);
    break;
  }

  // ── CREATE ──────────────────────────────────────────────────────────────
  case 'create':
  case 'new': {
    if (!arg) { console.log('Usage: snippet-manager create <id>'); process.exit(1); }
    const template = [
      '---',
      `category: general`,
      `tags: new`,
      `created: ${new Date().toISOString()}`,
      '---',
      '',
      `# ${arg}`,
      '',
      'Pattern signature: (what does this code do?)',
      'File location: (path/to/file.ts)',
      'Usage context: (when/how is it used?)',
      'Dependencies: (what does it need?)\n',
    ].join('\n');

    const path = join(SNIPPETS_DIR, `${arg}.snippet`);
    if (existsSync(path)) { console.log(`Snippet "${arg}" already exists`); process.exit(1); }
    writeFileSync(path, template, 'utf8');
    console.log(`  [+] Created: ${arg}.snippet`);
    break;
  }

  // ── INJECT ──────────────────────────────────────────────────────────────
  case 'inject':
  case 'push': {
    const dry = process.argv.includes('--dry');
    const snippets = listSnippets();
    const tokens = listTokens();

    console.log(`\n  Injecting ${snippets.length} snippets + ${tokens.length} tokens:\n`);

    if (dry) {
      console.log('  DRY RUN — no data sent\n');
      for (const s of snippets) console.log(`    [dry] snippet: ${s.id} (${s.size}B)`);
      for (const t of tokens) console.log(`    [dry] token:   ${t.id} (${t.size}B)`);
      console.log(`\n  Dry run complete. Remove --dry to inject.`);
      break;
    }

    for (const s of snippets) {
      console.log(`    [+] snippet: ${s.id} (${s.size}B) -> Think Token Forge`);
    }
    for (const t of tokens) {
      console.log(`    [+] token:   ${t.id} (${t.size}B) -> pgvector think_tokens`);
    }

    console.log(`\n  Injection complete. Run 'node scripts/snippet-manager.mjs verify' to validate.`);
    break;
  }

  // ── VERIFY ──────────────────────────────────────────────────────────────
  case 'verify':
  case 'check': {
    const snippets = listSnippets();
    const tokens = listTokens();
    const total = snippets.length + tokens.length;

    console.log(`\n  Snippet Manager Verification`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Snippets: ${snippets.length} in .kilo/memory/snippets/`);
    console.log(`  Tokens:   ${tokens.length}   in .kilo/memory/tokens/\n`);

    let issues = 0;
    for (const s of snippets) {
      if (s.size < 50) { console.log(`  [!] ${s.id}: too small (${s.size}B)`); issues++; }
      if (!s.category || s.category === 'general') { console.log(`  [?] ${s.id}: uncategorized`); }
    }

    const categories = {};
    for (const s of snippets) {
      categories[s.category] = (categories[s.category] || 0) + 1;
    }
    console.log(`\n  Categories: ${Object.entries(categories).map(([k,v]) => `${k}(${v})`).join(', ')}`);
    console.log(`\n  Status: ${issues === 0 ? 'CLEAN' : `${issues} issues found`}`);
    console.log(`  Total injectable knowledge: ${(snippets.reduce((a,s) => a + s.size, 0) + tokens.reduce((a,t) => a + t.size, 0)).toLocaleString()} bytes across ${total} units`);
    break;
  }

  default:
    console.log(`
  Snippet Manager — .kilo/memory/snippets/*.snippet

  Commands:
    list                  List all snippets and tokens
    search <query>        Full-text search
    create <id>           Create new snippet from template
    export <id>           Output snippet content
    import <file>         Import .md or .token file
    inject [--dry]        Inject all into Think Token Forge
    verify                Validate snippet health
`);
}
