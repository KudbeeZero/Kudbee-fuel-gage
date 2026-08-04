/**
 * THINKBOX PR-003 — Environment Provisioning Engine
 *
 * Orchestrator: reads ProjectIntelligenceManifest and generates provisioning
 * configurations (Dockerfile, docker-compose, devcontainer, nix flake) based on
 * detected languages, runtimes, services, and scripts.
 */

import type { ProjectIntelligenceManifest } from '../intelligence/types.ts';
import type { ProvisionConfig, ProvisionResult } from './types.ts';
import { generateNodeProvisioning } from './node.ts';

function detectPrimaryLanguage(manifest: ProjectIntelligenceManifest): string {
  // Priority order based on ecosystem maturity
  if (manifest.languages.includes('typescript') || manifest.languages.includes('javascript')) return 'node';
  if (manifest.languages.includes('python')) return 'python';
  if (manifest.languages.includes('rust')) return 'rust';
  if (manifest.languages.includes('go')) return 'go';
  if (manifest.languages.includes('ruby')) return 'ruby';
  if (manifest.languages.includes('java')) return 'java';
  if (manifest.languages.includes('php')) return 'php';
  return 'unknown';
}

export function generateProvisioning(manifest: ProjectIntelligenceManifest): ProvisionResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const primaryLang = detectPrimaryLanguage(manifest);
    
    let config: ProvisionConfig;
    switch (primaryLang) {
      case 'node':
        config = generateNodeProvisioning(manifest);
        break;
      case 'python':
        // TODO: Implement Python provisioner
        warnings.push('Python provisioning not yet implemented');
        return { success: false, config: null, errors, warnings };
      case 'rust':
        // TODO: Implement Rust provisioner
        warnings.push('Rust provisioning not yet implemented');
        return { success: false, config: null, errors, warnings };
      case 'go':
        // TODO: Implement Go provisioner
        warnings.push('Go provisioning not yet implemented');
        return { success: false, config: null, errors, warnings };
      default:
        warnings.push(`No provisioner available for language: ${primaryLang}`);
        return { success: false, config: null, errors, warnings };
    }

    return { success: true, config, errors, warnings };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { success: false, config: null, errors, warnings };
  }
}
