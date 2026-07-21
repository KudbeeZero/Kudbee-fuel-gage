import { proposeAction } from '../services/governance/router.js';
import { runAudit } from '../services/agents/hermes.js';

async function main() {
  console.log('[HermesTest] Seeding a proposed action for HERMES to audit...');
  await proposeAction({
    action: 'SEED_PROMOTABLE_LOGIC',
    tags: ['telemetry', 'trace', 'observability'],
    prompt: 'This is a long prompt that should be considered for promotion into the proven index by HERMES auditor',
    id: 'hermes-test-seed-1'
  });
  console.log('[HermesTest] Seeded proposed action hermes-test-seed-1');

  console.log('[HermesTest] Running HERMES audit...');
  const result = await runAudit();
  console.log('[HermesTest] Audit result:', JSON.stringify(result, null, 2));

  const promoted = result.promoted || 0;
  const logicFindings = result.logicFindings || [];
  const hasPromotableFinding = logicFindings.some(f => f.type === 'promotable_logic_pair');

  if (promoted > 0 && hasPromotableFinding) {
    console.log('\n[HermesTest] PASS: HERMES audit detected promotable logic and created PROPOSED actions');
    process.exit(0);
  } else {
    console.log('\n[HermesTest] FAIL: HERMES audit did not create expected PROPOSED actions');
    console.log(`  promoted=${promoted}, hasPromotableFinding=${hasPromotableFinding}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[HermesTest] Fatal:', err.message);
  process.exit(1);
});
