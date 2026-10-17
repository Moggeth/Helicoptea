import fs from 'node:fs';

// Absolute CPU timings depend on the host. Local checks remain strict; hosted CI explicitly opts
// into reporting finite timing overruns. Never use this helper for behavior, counts or memory limits.
export function performanceBudget(check, name, ms, limit, detail, {
  advisory = process.env.HELICOPTEA_PERF_ADVISORY === '1',
  warn = console.warn,
  github = process.env.GITHUB_ACTIONS === 'true',
  summary = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  if (!Number.isFinite(ms) || ms < 0 || !advisory || ms < limit) {
    check(name, Number.isFinite(ms) && ms >= 0 && ms < limit, detail);
    return;
  }
  const message = `${name}: ${detail}; budget < ${limit.toFixed(3)} ms (advisory on this host)`;
  warn(`WARN  ${message}`);
  if (github) warn(`::warning title=CPU performance budget::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  if (summary) fs.appendFileSync(summary, `\n- CPU timing warning: ${message}\n`);
}
