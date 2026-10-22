// THE OWNER'S CHOICES (stated before the runs, recorded in RESULTS.md as the owner's): on each STRICT skill, accept as
// unmeasured the required steps that are judgement (no check) and the unread part of any required rule read in part,
// with `atelier amend --accept-unmeasured <ids>`. A rule a check reads in full (the record's FULL), qualified or not, is
// not accepted. The ids are read off the probe's record (arms/probe/<fixture>-before.json), not chosen by hand.
// Usage: node accept.mjs <claims|labels>
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cli, ledger, log, spend, buildOf, HERE } from './lib.mjs';
const fx = process.argv[2]; const b = buildOf(fx, 1);
const probe = JSON.parse(readFileSync(join(HERE, 'arms', 'probe', `${fx}-before.json`), 'utf8'));
const ids = probe.entries.filter((e) => e.required && e.result === 'UNVERIFIED' && (e.reason === 'NOT_MACHINE_CHECKABLE' || e.reads === 'PARTIAL')).map((e) => e.id);
const notAccepted = probe.entries.filter((e) => e.required && e.result === 'UNVERIFIED' && !ids.includes(e.id) && e.reason !== 'LISTED_FOR_YOU').map((e) => ({ id: e.id, reason: e.reason, reads: e.reads }));
const s0 = spend().total;
const r = cli(['amend', '--skill', fx, '--accept-unmeasured', ids.join(','), '--reason', "the owner's choice: judgement steps and the unread part of a partly read required rule are accepted unmeasured (study 2026-10-22c)"], { data: b.data, tag: `amend:${fx}` });
const d = join(b.data, 'skills', fx); const a = JSON.parse(readFileSync(join(d, 'active.json'), 'utf8'));
const v = JSON.parse(readFileSync(join(d, 'versions', `${a.skillVersionHash}.json`), 'utf8')); const std = v.standardVersionHash ?? v.standard;
const sf = join(d, 'standards', `${std}.json`); const accepted = existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')).acceptedUnmeasured ?? null : null;
writeFileSync(join(HERE, 'arms', 'builds', fx, 'amend.txt'), `$ atelier amend --skill ${fx} --accept-unmeasured ${ids.join(',')} --reason "..."\n\n${r.stdout}\n--- stderr ---\n${r.stderr}`);
writeFileSync(join(HERE, 'arms', 'builds', fx, 'accepted.json'), JSON.stringify({ accepted: ids, notAccepted, standardAfter: std, acceptedInStandard: accepted }, null, 1));
ledger({ step: 'amend', fixture: fx, exit: r.status, accepted: ids, standardHash: std, meterUsd: spend().total - s0 });
log(`amend ${fx}: exit ${r.status}, accepted ${ids.join(',') || '(none)'}, standard ${std}`);
