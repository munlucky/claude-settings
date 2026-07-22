export const STATES = Object.freeze(['FRAME','SHAPE','SLICE','SCHEDULE','EXECUTE','PROVE','CLOSE']);
export const TRANSITIONS = Object.freeze({
  FRAME: ['SHAPE','EXECUTE','CLOSE'],
  SHAPE: ['SLICE','EXECUTE','FRAME'],
  SLICE: ['SCHEDULE','EXECUTE','SHAPE'],
  SCHEDULE: ['EXECUTE','SHAPE'],
  EXECUTE: ['PROVE','SHAPE','FRAME'],
  PROVE: ['CLOSE','EXECUTE','SHAPE'],
  CLOSE: [],
});
export const canTransition = (from, to) => Boolean(TRANSITIONS[from]?.includes(to));
export const transition = (snapshot, to) => {
  if (!canTransition(snapshot.state, to)) throw new Error(`Invalid Kernel transition ${snapshot.state} -> ${to}`);
  return { ...snapshot, state: to, history: [...(snapshot.history || []), to] };
};
