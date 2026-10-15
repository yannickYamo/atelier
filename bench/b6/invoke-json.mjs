// bench/b6/invoke-json.mjs — THE RECORD OF ONE `atelier invoke --json`, BLOCKED OR NOT.
//
// `invoke --json` exits 1 on a BLOCKED run, with its whole record on stdout. Read through execFileSync, that exit throws,
// and a bench that does not catch it loses the record of exactly the runs it most needs to count. A BLOCKED record on
// exit 1 is a result like any other; any other failure is still thrown.

/** The parsed JSON record of `run()` (a call that returns stdout, or throws as execFileSync does). */
export function invokeRecord(run) {
  let raw;
  try { raw = run(); } catch (e) {
    const out = typeof e?.stdout === 'string' ? e.stdout : Buffer.isBuffer(e?.stdout) ? e.stdout.toString('utf8') : '';
    if (e?.status !== 1 || !out.trim()) throw e;
    let j;
    try { j = JSON.parse(out); } catch { throw e; }
    if (j?.eval?.record?.state !== 'BLOCKED') throw e;
    return j;
  }
  return JSON.parse(raw);
}

/** What a bench item keeps of an invoke record beside its text: the run, what broke, and the state it ended in (BLOCKED or not). */
export function itemMeta(j) {
  return { invocationId: j.invocationId, rulesBroken: j.rulesBroken, cut: j.cut, toCheck: j.toCheck, fidelity: j.fidelity ?? null, state: j?.eval?.record?.state ?? null };
}
