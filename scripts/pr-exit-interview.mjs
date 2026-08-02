import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const EXIT_DIR = join(process.cwd(), '.kilo', 'memory', 'exit-interviews');
mkdirSync(EXIT_DIR, { recursive: true });

function today() { return new Date().toISOString().split('T')[0]; }

const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
const log = execSync('git log --oneline -3', { encoding: 'utf8' }).trim();
let prNumber = '';
try { prNumber = execSync(`gh pr list --head ${branch} --state open --json number --jq '.[0].number'`, { encoding: 'utf8' }).trim(); } catch {}

const interview = {
  date: today(),
  branch,
  pr: prNumber || 'N/A',
  commits: log.split('\n'),
  questions: {
    whatUserProblem: process.argv.includes('--problem') ? process.argv[process.argv.indexOf('--problem') + 1] : 'unspecified',
    whatChanged: process.argv.includes('--changed') ? process.argv[process.argv.indexOf('--changed') + 1] : 'unspecified',
    whatEvidence: process.argv.includes('--evidence') ? process.argv[process.argv.indexOf('--evidence') + 1] : 'unspecified',
    whatLearned: process.argv.includes('--learned') ? process.argv[process.argv.indexOf('--learned') + 1] : 'unspecified',
    permanentKnowledge: process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : 'unspecified',
    complexityDelta: process.argv.includes('--complexity') ? process.argv[process.argv.indexOf('--complexity') + 1] : 'unknown',
    understandableInSixMonths: process.argv.includes('--understandable') ? 'yes' : 'unknown',
  },
  generatedAt: new Date().toISOString(),
};

const path = join(EXIT_DIR, `${today()}-${branch.replace(/\//g, '-')}.json`);
writeFileSync(path, JSON.stringify(interview, null, 2));
console.log(JSON.stringify(interview, null, 2));
