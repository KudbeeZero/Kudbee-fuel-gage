#!/usr/bin/env node

/**
 * Terminal Diagnostic Script
 * 
 * Comprehensive diagnostic sweep for terminal mounting failures and agent credential tracking.
 * 
 * Usage: node scripts/terminal-diagnostic.mjs
 * 
 * Checks:
 * 1. React version compatibility
 * 2. Agent credentials and qualifications
 * 3. Intelligence layer status
 * 4. Mount timeout analysis
 * 5. Dependency health
 * 6. Build artifacts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DIAGNOSTIC_OUTPUT = path.join(__dirname, '..', '.kilo', 'memory', 'terminal-diagnostics.json');
const AGENT_REGISTRY = path.join(__dirname, '..', 'config', 'agents.json');
const MOUNT_TIMEOUT_MS = 12000;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkReactVersions() {
  log('\n[1/6] Checking React version compatibility...', 'cyan');
  
  try {
    const webPackageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'package.json'), 'utf8')
    );
    
    const reactVersion = webPackageJson.dependencies?.react || 'not found';
    const reactDomVersion = webPackageJson.dependencies?.['react-dom'] || 'not found';
    
    const reactMatch = reactVersion.match(/(\d+\.\d+\.\d+)/);
    const reactDomMatch = reactDomVersion.match(/(\d+\.\d+\.\d+)/);
    
    const react = reactMatch ? reactMatch[1] : reactVersion;
    const reactDom = reactDomMatch ? reactDomMatch[1] : reactDomVersion;
    
    const versionsMatch = react === reactDom;
    
    return {
      react,
      reactDom,
      versionsMatch,
      status: versionsMatch ? 'PASS' : 'FAIL',
      message: versionsMatch 
        ? `React ${react} and react-dom ${reactDom} versions match ✓`
        : `Version mismatch: react ${react} vs react-dom ${reactDom} ✗`
    };
  } catch (error) {
    return {
      react: 'error',
      reactDom: 'error',
      versionsMatch: false,
      status: 'ERROR',
      message: `Failed to read package.json: ${error.message}`
    };
  }
}

function checkAgentCredentials() {
  log('\n[2/6] Checking agent credentials and qualifications...', 'cyan');
  
  try {
    if (!fs.existsSync(AGENT_REGISTRY)) {
      return {
        agents: [],
        activeCount: 0,
        inactiveCount: 0,
        status: 'ERROR',
        message: 'Agent registry not found'
      };
    }
    
    const registry = JSON.parse(fs.readFileSync(AGENT_REGISTRY, 'utf8'));
    const agents = registry.agents || [];
    
    const activeAgents = agents.filter(a => a.status === 'active');
    const inactiveAgents = agents.filter(a => a.status !== 'active');
    
    // Generate agent cards
    const agentCards = agents.map(agent => ({
      id: agent.agentId,
      name: agent.name || agent.agentId,
      status: agent.status,
      credentials: {
        hasPublicKey: !!agent.publicKey,
        keyFingerprint: agent.publicKey ? agent.publicKey.substring(0, 20) + '...' : 'none'
      },
      qualifications: agent.qualifications || [],
      accessLevel: agent.accessLevel || 'standard',
      intelligenceLayer: {
        thinkTokens: agent.thinkTokens || 0,
        reasonId: agent.reasonId || 'none',
        eq: agent.eq || 0
      }
    }));
    
    return {
      agents: agentCards,
      activeCount: activeAgents.length,
      inactiveCount: inactiveAgents.length,
      status: 'PASS',
      message: `Found ${agents.length} agents (${activeAgents.length} active, ${inactiveAgents.length} inactive)`
    };
  } catch (error) {
    return {
      agents: [],
      activeCount: 0,
      inactiveCount: 0,
      status: 'ERROR',
      message: `Failed to read agent registry: ${error.message}`
    };
  }
}

function checkIntelligenceLayer() {
  log('\n[3/6] Checking intelligence layer status...', 'cyan');
  
  try {
    const thinkTokensPath = path.join(__dirname, '..', '.kilo', 'memory', 'think-tokens.json');
    const reasonIdsPath = path.join(__dirname, '..', '.kilo', 'memory', 'reason-ids.json');
    
    let thinkTokens = 0;
    let reasonIds = 0;
    let avgEQ = 0;
    
    if (fs.existsSync(thinkTokensPath)) {
      const tokens = JSON.parse(fs.readFileSync(thinkTokensPath, 'utf8'));
      thinkTokens = Array.isArray(tokens) ? tokens.length : Object.keys(tokens).length;
    }
    
    if (fs.existsSync(reasonIdsPath)) {
      const ids = JSON.parse(fs.readFileSync(reasonIdsPath, 'utf8'));
      reasonIds = Array.isArray(ids) ? ids.length : Object.keys(ids).length;
    }
    
    // Calculate average EQ from agent registry
    if (fs.existsSync(AGENT_REGISTRY)) {
      const registry = JSON.parse(fs.readFileSync(AGENT_REGISTRY, 'utf8'));
      const agents = registry.agents || [];
      const eqScores = agents.map(a => a.eq || 0).filter(eq => eq > 0);
      avgEQ = eqScores.length > 0 
        ? eqScores.reduce((sum, eq) => sum + eq, 0) / eqScores.length 
        : 0;
    }
    
    return {
      thinkTokens,
      reasonIds,
      avgEQ: avgEQ.toFixed(2),
      status: 'PASS',
      message: `Think tokens: ${thinkTokens}, Reason IDs: ${reasonIds}, Avg EQ: ${avgEQ.toFixed(2)}`
    };
  } catch (error) {
    return {
      thinkTokens: 0,
      reasonIds: 0,
      avgEQ: '0.00',
      status: 'ERROR',
      message: `Failed to check intelligence layer: ${error.message}`
    };
  }
}

function analyzeMountTimeout() {
  log('\n[4/6] Analyzing mount timeout...', 'cyan');
  
  try {
    // Check if terminal bundle exists
    const terminalBundlePath = path.join(__dirname, '..', 'apps', 'web', 'dist', 'assets');
    
    if (!fs.existsSync(terminalBundlePath)) {
      return {
        mountTime: 'N/A',
        timeout: true,
        status: 'FAIL',
        message: 'Terminal bundle not found - build may have failed'
      };
    }
    
    const files = fs.readdirSync(terminalBundlePath);
    const terminalFiles = files.filter(f => f.startsWith('terminal-') && f.endsWith('.js'));
    
    if (terminalFiles.length === 0) {
      return {
        mountTime: 'N/A',
        timeout: true,
        status: 'FAIL',
        message: 'No terminal bundle found in dist/assets'
      };
    }
    
    // Check for vendor-react bundle
    const vendorReactFiles = files.filter(f => f.startsWith('vendor-react-') && f.endsWith('.js'));
    
    if (vendorReactFiles.length === 0) {
      return {
        mountTime: 'N/A',
        timeout: true,
        status: 'FAIL',
        message: 'vendor-react bundle missing - React chunking issue'
      };
    }
    
    // Check terminal bundle size
    const terminalBundle = path.join(terminalBundlePath, terminalFiles[0]);
    const stats = fs.statSync(terminalBundle);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    return {
      mountTime: `${MOUNT_TIMEOUT_MS / 1000}s (timeout)`,
      timeout: true,
      bundleSize: `${sizeKB} KB`,
      status: 'WARNING',
      message: `Terminal bundle exists (${sizeKB} KB) but mount timed out - check runtime errors`
    };
  } catch (error) {
    return {
      mountTime: 'N/A',
      timeout: true,
      status: 'ERROR',
      message: `Failed to analyze mount: ${error.message}`
    };
  }
}

function checkDependencyHealth() {
  log('\n[5/6] Checking dependency health...', 'cyan');
  
  try {
    const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
    
    if (!fs.existsSync(nodeModulesPath)) {
      return {
        status: 'FAIL',
        message: 'node_modules not found - run npm install'
      };
    }
    
    // Check critical dependencies
    const criticalDeps = ['react', 'react-dom', 'react-router', 'zustand'];
    const missingDeps = [];
    
    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      return {
        status: 'FAIL',
        message: `Missing dependencies: ${missingDeps.join(', ')}`
      };
    }
    
    return {
      status: 'PASS',
      message: 'All critical dependencies installed ✓'
    };
  } catch (error) {
    return {
      status: 'ERROR',
      message: `Failed to check dependencies: ${error.message}`
    };
  }
}

function checkBuildArtifacts() {
  log('\n[6/6] Checking build artifacts...', 'cyan');
  
  try {
    const distPath = path.join(__dirname, '..', 'apps', 'web', 'dist');
    
    if (!fs.existsSync(distPath)) {
      return {
        status: 'FAIL',
        message: 'Build artifacts not found - run npm run build'
      };
    }
    
    const terminalHtml = path.join(distPath, 'terminal.html');
    const indexHtml = path.join(distPath, 'index.html');
    
    const hasTerminalHtml = fs.existsSync(terminalHtml);
    const hasIndexHtml = fs.existsSync(indexHtml);
    
    if (!hasTerminalHtml || !hasIndexHtml) {
      return {
        status: 'FAIL',
        message: 'Missing HTML files in dist'
      };
    }
    
    // Check assets directory
    const assetsPath = path.join(distPath, 'assets');
    if (!fs.existsSync(assetsPath)) {
      return {
        status: 'FAIL',
        message: 'Missing assets directory in dist'
      };
    }
    
    const assets = fs.readdirSync(assetsPath);
    const jsFiles = assets.filter(f => f.endsWith('.js'));
    const cssFiles = assets.filter(f => f.endsWith('.css'));
    
    return {
      status: 'PASS',
      message: `Build artifacts present (${jsFiles.length} JS, ${cssFiles.length} CSS files) ✓`
    };
  } catch (error) {
    return {
      status: 'ERROR',
      message: `Failed to check build artifacts: ${error.message}`
    };
  }
}

function generateFixRecommendations(diagnostic) {
  log('\n[7/7] Generating fix recommendations...', 'cyan');
  
  const recommendations = [];
  
  // React version mismatch
  if (!diagnostic.react.versionsMatch) {
    recommendations.push({
      priority: 'HIGH',
      issue: 'React version mismatch',
      fix: `Pin both react and react-dom to the same version (e.g., 19.2.8) in apps/web/package.json`,
      command: 'npm install react@19.2.8 react-dom@19.2.8 --workspace=@kudbee/web'
    });
  }
  
  // Mount timeout
  if (diagnostic.mount.timeout) {
    if (diagnostic.mount.message.includes('vendor-react bundle missing')) {
      recommendations.push({
        priority: 'HIGH',
        issue: 'Vendor React bundle missing',
        fix: 'Rebuild with proper chunking configuration',
        command: 'npm run build --workspace=@kudbee/web'
      });
    } else if (diagnostic.mount.message.includes('runtime errors')) {
      recommendations.push({
        priority: 'MEDIUM',
        issue: 'Runtime errors preventing mount',
        fix: 'Check browser console for JavaScript errors',
        command: 'Check browser DevTools console for errors'
      });
    }
  }
  
  // Missing dependencies
  if (diagnostic.dependencies.status === 'FAIL') {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Missing dependencies',
      fix: 'Install missing dependencies',
      command: 'npm install --legacy-peer-deps'
    });
  }
  
  // Build artifacts
  if (diagnostic.build.status === 'FAIL') {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Build artifacts missing',
      fix: 'Rebuild the application',
      command: 'npm run build --workspace=@kudbee/web'
    });
  }
  
  // Agent issues
  if (diagnostic.agents.inactiveCount > 0) {
    recommendations.push({
      priority: 'LOW',
      issue: `${diagnostic.agents.inactiveCount} inactive agents`,
      fix: 'Review agent status and reactivate if needed',
      command: 'Check config/agents.json'
    });
  }
  
  return recommendations;
}

function formatAgentCard(agent) {
  return `
  ┌─────────────────────────────────────────┐
  │ Agent: ${agent.name.padEnd(33)}│
  │ ID: ${agent.id.padEnd(37)}│
  │ Status: ${agent.status.padEnd(33)}│
  │ Access: ${agent.accessLevel.padEnd(33)}│
  │ Credentials: ${agent.credentials.hasPublicKey ? '✓ Has public key' : '✗ No key'.padEnd(26)}│
  │ Think Tokens: ${String(agent.intelligenceLayer.thinkTokens).padEnd(27)}│
  │ Reason ID: ${agent.intelligenceLayer.reasonId.padEnd(30)}│
  │ EQ Score: ${String(agent.intelligenceLayer.eq).padEnd(31)}│
  └─────────────────────────────────────────┘`;
}

function printReport(diagnostic) {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════════╗', 'bold');
  log('║           TERMINAL DIAGNOSTIC REPORT                          ║', 'bold');
  log('╠════════════════════════════════════════════════════════════════╣', 'bold');
  log(`║  Timestamp: ${new Date().toISOString().padEnd(55)}║`, 'cyan');
  log(`║  Status: ${diagnostic.overallStatus.padEnd(58)}║`, 
      diagnostic.overallStatus === 'HEALTHY' ? 'green' : 'red');
  log('╠════════════════════════════════════════════════════════════════╣', 'bold');
  
  // React versions
  log(`║  React Version: ${diagnostic.react.react.padEnd(49)}║`, 
      diagnostic.react.versionsMatch ? 'green' : 'red');
  log(`║  React-DOM Version: ${diagnostic.react.reactDom.padEnd(47)}║`, 
      diagnostic.react.versionsMatch ? 'green' : 'red');
  log(`║  Mount Time: ${diagnostic.mount.mountTime.padEnd(54)}║`, 
      diagnostic.mount.timeout ? 'yellow' : 'green');
  log('╠════════════════════════════════════════════════════════════════╣', 'bold');
  
  // Agents
  log(`║  Agents: ${String(diagnostic.agents.agents.length).padEnd(58)}║`, 'cyan');
  log(`║  Active: ${String(diagnostic.agents.activeCount).padEnd(58)}║`, 'green');
  log(`║  Inactive: ${String(diagnostic.agents.inactiveCount).padEnd(56)}║`, 'yellow');
  log('╠════════════════════════════════════════════════════════════════╣', 'bold');
  
  // Intelligence layer
  log('║  Intelligence Layer:                                            ║', 'cyan');
  log(`║    Think Tokens: ${String(diagnostic.intelligence.thinkTokens).padEnd(50)}║`, 'green');
  log(`║    Reason IDs: ${String(diagnostic.intelligence.reasonIds).padEnd(52)}║`, 'green');
  log(`║    Avg EQ: ${String(diagnostic.intelligence.avgEQ).padEnd(56)}║`, 'green');
  log('╠════════════════════════════════════════════════════════════════╣', 'bold');
  
  // Checks
  log(`║  Dependencies: ${diagnostic.dependencies.status.padEnd(52)}║`, 
      diagnostic.dependencies.status === 'PASS' ? 'green' : 'red');
  log(`║  Build Artifacts: ${diagnostic.build.status.padEnd(49)}║`, 
      diagnostic.build.status === 'PASS' ? 'green' : 'red');
  log('╚════════════════════════════════════════════════════════════════╝', 'bold');
  
  // Agent cards
  if (diagnostic.agents.agents.length > 0) {
    log('\n' + '='.repeat(64), 'bold');
    log('  AGENT CARDS', 'bold');
    log('='.repeat(64), 'bold');
    
    diagnostic.agents.agents.forEach(agent => {
      log(formatAgentCard(agent), 'cyan');
    });
  }
  
  // Recommendations
  if (diagnostic.recommendations.length > 0) {
    log('\n' + '='.repeat(64), 'bold');
    log('  FIX RECOMMENDATIONS', 'bold');
    log('='.repeat(64), 'bold');
    
    diagnostic.recommendations.forEach((rec, index) => {
      log(`\n[${index + 1}] ${rec.issue}`, rec.priority === 'HIGH' ? 'red' : 'yellow');
      log(`    Priority: ${rec.priority}`, rec.priority === 'HIGH' ? 'red' : 'yellow');
      log(`    Fix: ${rec.fix}`, 'cyan');
      log(`    Command: ${rec.command}`, 'green');
    });
  }
  
  console.log('\n');
}

async function runDiagnostic() {
  log('Starting terminal diagnostic sweep...', 'bold');
  log('Timestamp: ' + new Date().toISOString(), 'cyan');
  
  const diagnostic = {
    timestamp: new Date().toISOString(),
    react: checkReactVersions(),
    agents: checkAgentCredentials(),
    intelligence: checkIntelligenceLayer(),
    mount: analyzeMountTimeout(),
    dependencies: checkDependencyHealth(),
    build: checkBuildArtifacts(),
    recommendations: []
  };
  
  // Generate recommendations
  diagnostic.recommendations = generateFixRecommendations(diagnostic);
  
  // Determine overall status
  const allPass = [
    diagnostic.react.status === 'PASS',
    diagnostic.agents.status === 'PASS',
    diagnostic.intelligence.status === 'PASS',
    !diagnostic.mount.timeout,
    diagnostic.dependencies.status === 'PASS',
    diagnostic.build.status === 'PASS'
  ].every(Boolean);
  
  diagnostic.overallStatus = allPass ? 'HEALTHY' : 'FAILING';
  
  // Print report
  printReport(diagnostic);
  
  // Save to memory
  try {
    const outputDir = path.dirname(DIAGNOSTIC_OUTPUT);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(DIAGNOSTIC_OUTPUT, JSON.stringify(diagnostic, null, 2));
    log(`Diagnostic report saved to: ${DIAGNOSTIC_OUTPUT}`, 'green');
  } catch (error) {
    log(`Failed to save diagnostic report: ${error.message}`, 'red');
  }
  
  // Exit with appropriate code
  process.exit(allPass ? 0 : 1);
}

// Run diagnostic
runDiagnostic().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
