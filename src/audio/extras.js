// Sounds for the extra set pieces. A sim module emits sim.emit('extra', { kind, pos, ... }); the matching
// render module registers a player with registerExtraSound(kind, (audio, e, now) => ...).
const PLAYERS = new Map();
export function registerExtraSound(kind, fn) { PLAYERS.set(kind, fn); }
export function extraSound(audio, e, now) { const f = PLAYERS.get(e.kind); if (f) f(audio, e, now); }
