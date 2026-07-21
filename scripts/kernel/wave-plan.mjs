const overlaps=(a,b)=>a===b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.endsWith('/**')&&b.startsWith(a.slice(0,-3)) || b.endsWith('/**')&&a.startsWith(b.slice(0,-3));
const conflicts=(a,b)=>{
  const write=(a.predictedWriteSet||[]).some((x)=>(b.predictedWriteSet||[]).some((y)=>overlaps(x,y)));
  const shared=(a.sharedSurfaces||[]).some((x)=>(b.sharedSurfaces||[]).includes(x) && x!=='none');
  return write || shared;
};
export const planSafeWaves=(slices=[])=>{
  const pending=new Map(slices.map((s)=>[s.id,s]));
  const done=new Set(); const waves=[];
  while(pending.size){
    const ready=[...pending.values()].filter((s)=>(s.blockedBy||[]).every((d)=>done.has(d)));
    if(!ready.length) throw new Error('Cycle or missing dependency in Kernel slice graph');
    const wave=[]; const deferred=[];
    for(const slice of ready){
      if(wave.every((other)=>!conflicts(slice,other))) wave.push(slice); else deferred.push(slice.id);
    }
    waves.push({ index:waves.length+1, mode:'dry-run', slices:wave.map((s)=>s.id), deferred, parallelEligible:wave.length>1 });
    for(const s of wave){ pending.delete(s.id); done.add(s.id); }
  }
  return { defaultMode:'sequential', waves };
};
