import { evidenceTierForProof } from './proof-route.mjs';
export const selectEvidenceTier=({proofTier,sliceCount=1,longRunning=false})=> longRunning||sliceCount>1||proofTier==='T3'?'E2':evidenceTierForProof(proofTier);
export const buildEvidencePack=({objective,proofTier,sliceCount=1,longRunning=false,checks=[],acceptanceCoverage=[],completionDecision='blocked'})=>{
  const tier=selectEvidenceTier({proofTier,sliceCount,longRunning});
  if(tier==='E0') return {schemaVersion:1,tier,objective,status:completionDecision,evidenceRefs:checks.map((c)=>c.evidenceRef).filter(Boolean)};
  const qa={schemaVersion:1,tier,proofTier,checks};
  if(tier==='E1') return {schemaVersion:1,tier,taskContract:{objective},qaReport:qa,runSummary:{objective,status:completionDecision}};
  return {schemaVersion:1,tier,taskContract:{objective},sliceGraph:{sliceCount},qaReport:qa,releaseEvidence:{schemaVersion:1,tier:'E2',acceptanceCoverage,completionDecision}};
};
