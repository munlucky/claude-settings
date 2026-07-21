import { makeContextReceipt } from './context-receipt.mjs';
const secretPattern = /(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/ig;
const forbiddenType = new Set(['raw-runtime-log','transcript','full-knowledge-graph-dump']);
const sanitize = (text) => String(text || '').replace(secretPattern, '$1=[REDACTED]');
const estimateTokens = (text) => Math.ceil(String(text).length / 4);
export const buildKernelContext = ({ stage, principles = [], taskContract, stageRecords = [], references = [], evidence = [], policyRevision = '1' }) => {
  const included=[]; const omitted=[];
  const accept=(record, layer)=>{
    if (forbiddenType.has(record.type)) { omitted.push({ id: record.id, reason: 'forbidden-type' }); return null; }
    const content=sanitize(record.content);
    included.push({ id: record.id, layer, revision: record.revision || 'unknown' });
    return content;
  };
  const blocks=[];
  blocks.push(`## Stable Principles\n${principles.map((p)=>`- ${p}`).join('\n')}`);
  blocks.push(`## Task Contract\n${sanitize(JSON.stringify(taskContract, null, 2))}`);
  const stageContent=stageRecords.map((r)=>accept(r,'stage-context')).filter(Boolean);
  if(stageContent.length) blocks.push(`## Stage Context\n${stageContent.join('\n\n')}`);
  const refs=references.map((r)=>accept(r,'on-demand-reference')).filter(Boolean);
  if(refs.length) blocks.push(`## On-demand References\n${refs.join('\n')}`);
  const ev=evidence.map((r)=>accept(r,'evidence-digest')).filter(Boolean);
  if(ev.length) blocks.push(`## Evidence Digest\n${ev.join('\n')}`);
  const promptBlock=blocks.join('\n\n');
  return { promptBlock, receipt: makeContextReceipt({ stage, policyRevision, included, omitted, tokenEstimate: estimateTokens(promptBlock) }) };
};
