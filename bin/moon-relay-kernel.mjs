#!/usr/bin/env node
import process from 'node:process';
import { resolveKernelRuntimeHome, readProjectTrack } from '../scripts/kernel/runtime-home.mjs';
import { resolveKernelNode } from '../scripts/kernel/runtime-resolver.mjs';
import { materializeKernelPackage } from '../scripts/kernel/package-build.mjs';
const args=process.argv.slice(2); const command=args[0]||'doctor'; const json=args.includes('--json');
const output=(value)=>console.log(json?JSON.stringify(value):Object.entries(value).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join('\n'));
try{
  if(command==='doctor'){ const runtimeHome=resolveKernelRuntimeHome(); const activeTrack=await readProjectTrack(process.cwd()); output({productId:'moon-relay-kernel',runtimeHome,activeTrack,status:activeTrack==='kernel'?'ready':'wrong_harness'}); }
  else if(command==='resolve-runtime'){ output(await resolveKernelNode({})); }
  else if(command==='package'){ const outArg=args.indexOf('--output'); const outputRoot=outArg>=0?args[outArg+1]:`${process.cwd()}/dist/moon-relay-kernel`; output(await materializeKernelPackage({sourceRoot:process.cwd(),outputRoot,dryRun:args.includes('--dry-run')})); }
  else { throw new Error(`Unknown command: ${command}`); }
}catch(error){ console.error(json?JSON.stringify({status:'error',message:error.message}):error.message); process.exitCode=1; }
