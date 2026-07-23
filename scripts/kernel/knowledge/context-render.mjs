import crypto from 'node:crypto';

export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let str = text;
  // Redact API keys, tokens, passwords
  str = str.replace(/(api[_-]?key|secret|token|password|auth_header)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{16,})["']?/gi, '$1: "[REDACTED]"');
  str = str.replace(/\b(sk-[a-zA-Z0-9]{20,})\b/g, '[REDACTED_KEY]');
  str = str.replace(/\b(ghp_[a-zA-Z0-9]{20,})\b/g, '[REDACTED_TOKEN]');
  return str;
}

export function renderPromptBlock({ stage, policyAnchors = [], semanticFacts = [], graphSynopsis = [], ontologyConstraints = [] }) {
  const lines = [`[Project Knowledge Context - Stage: ${stage}]`];

  if (policyAnchors.length > 0) {
    lines.push('\n### Policy Anchors:');
    for (const anchor of policyAnchors) {
      lines.push(`- ${redactSecrets(anchor.statement || anchor.title || JSON.stringify(anchor))}`);
    }
  }

  if (semanticFacts.length > 0) {
    lines.push('\n### Verified Facts:');
    for (const fact of semanticFacts) {
      lines.push(`- ${redactSecrets(fact.statement || JSON.stringify(fact))}`);
    }
  }

  if (ontologyConstraints.length > 0) {
    lines.push('\n### Ontology Constraints:');
    for (const constraint of ontologyConstraints) {
      lines.push(`- [${constraint.severity || 'invariant'}] ${redactSecrets(constraint.statement || JSON.stringify(constraint))}`);
    }
  }

  if (graphSynopsis.length > 0) {
    lines.push('\n### Architectural Relations:');
    for (const rel of graphSynopsis) {
      lines.push(`- ${redactSecrets(rel.statement || `${rel.from} -> ${rel.relation} -> ${rel.to}`)}`);
    }
  }

  return lines.join('\n');
}

export function computeContextDigest(contextPayload) {
  const normalized = JSON.stringify({
    projectId: contextPayload.projectId,
    knowledgeRevision: contextPayload.knowledgeRevision,
    stage: contextPayload.stage,
    strictness: contextPayload.strictness,
    promptBlock: contextPayload.promptBlock,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
