import { createHash } from 'node:crypto';
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
export const digestObject = (value) => createHash('sha256').update(stable(value)).digest('hex');
export const makeContextReceipt = ({ stage, policyRevision, included, omitted, tokenEstimate }) => {
  const payload = { schemaVersion: 1, stage, policyRevision, tokenEstimate, included, omitted };
  const digest = digestObject(payload);
  return { ...payload, receiptId: `ctx-${digest.slice(0, 12)}`, digest };
};
