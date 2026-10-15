/** The parsed JSON record of `run()`: its stdout, or a BLOCKED record on exit 1 (./invoke-json.mjs). */
export function invokeRecord(run: () => string): { output: string; eval?: { record?: { state?: string } } } & Record<string, unknown>;
export function itemMeta(j: unknown): { invocationId: unknown; rulesBroken: unknown; cut: unknown; toCheck: unknown; fidelity: unknown; state: string | null };
