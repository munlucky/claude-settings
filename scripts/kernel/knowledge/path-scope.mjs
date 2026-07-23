import path from 'node:path';

export function matchPathScope(targetPath, scopes = []) {
  if (!scopes || scopes.length === 0) return true;
  const normalizedTarget = targetPath.replace(/\\/g, '/').toLowerCase();
  for (const scope of scopes) {
    const s = scope.replace(/\\/g, '/').toLowerCase();
    if (s === '*' || s === '**') return true;
    if (s.endsWith('/**')) {
      const prefix = s.slice(0, -3);
      if (normalizedTarget === prefix || normalizedTarget.startsWith(`${prefix}/`)) return true;
    } else if (s.endsWith('/*')) {
      const prefix = s.slice(0, -2);
      if (normalizedTarget.startsWith(`${prefix}/`)) return true;
    } else if (normalizedTarget === s || normalizedTarget.startsWith(`${s}/`)) {
      return true;
    }
  }
  return false;
}

export function scoreRelevance({ item, objective = '', paths = [] }) {
  let score = 0;
  const itemText = JSON.stringify(item).toLowerCase();
  const objWords = objective.toLowerCase().split(/\s+/).filter(Boolean);

  for (const word of objWords) {
    if (word.length > 3 && itemText.includes(word)) {
      score += 2;
    }
  }

  if (item && item.scope && Array.isArray(item.scope)) {
    for (const p of paths) {
      if (matchPathScope(p, item.scope)) {
        score += 5;
      }
    }
  }

  return score;
}

export function calculatePathRelevance(paths = [], scopes = []) {
  if (!scopes || scopes.length === 0) return 0;
  let matches = 0;
  for (const p of paths) {
    if (matchPathScope(p, scopes)) {
      matches += 5;
    }
  }
  return matches;
}
