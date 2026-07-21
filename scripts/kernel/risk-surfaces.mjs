export const RISK_SURFACES = Object.freeze([
  'security_boundary',
  'data_migration',
  'public_contract',
  'schema_change',
  'runtime_authority',
  'installer',
]);

const highRiskSet = new Set(RISK_SURFACES);

const surfaceAliases = Object.freeze({
  security: 'security_boundary',
  securityboundary: 'security_boundary',
  datamigration: 'data_migration',
  'data-migration': 'data_migration',
  publicapi: 'public_contract',
  'public-api': 'public_contract',
  publiccontract: 'public_contract',
  schema: 'schema_change',
  schemachange: 'schema_change',
  runtimeauthority: 'runtime_authority',
  'runtime-authority': 'runtime_authority',
  installer: 'installer',
});

export const normalizeRiskSurface = (val) => {
  const clean = String(val || '').trim();
  const lower = clean.toLowerCase();
  const stripped = lower.replace(/[-_]/g, '');
  return surfaceAliases[stripped] || surfaceAliases[lower] || clean;
};

export const isHighRiskSurface = (surface) => {
  const normalized = normalizeRiskSurface(surface);
  return highRiskSet.has(normalized);
};
