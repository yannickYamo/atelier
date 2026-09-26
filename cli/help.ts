// cli/help.ts — `atelier <command> --help`, answered without running the command.
//
// No command handled `--help`, so it was ignored and the command ran: `atelier abort --help` aborted
// and archived the run, `discover --help` spent API budget, `invoke --help` failed on "--help" as a
// skill name. Help is now answered in the dispatcher before any command is reached, from this one
// table, and the hint census reads it like every other printed `atelier …` line.
import { existsSync } from 'node:fs';
import { readJson } from '../core/state/read-json.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const USAGE: Readonly<Record<string, string>> = {
  new: 'atelier new <folder-of-your-best-work> "<what the skill is for>" [--name <name>] [--reserve <file>]...\n  Read your work, show the rules it found with a suggested ruling for each, and build the skill once you accept. Run it again to continue.',
  verify: 'atelier verify --skill <name> <file> [--json]   (or pipe the text in)\n  Check any text against every measured rule in the standard, with the exact spans that break one. Exits 1 when a REQUIRED rule is broken.',
  review: 'atelier review [--accept] [--set <id>=<choice>]...\n  The rules waiting for your ruling, with suggestions. --accept records them as shown; --set changes one (reject, approve, required, preferred, exemplar, tolerated, incidental).',
  skill: 'atelier skill "<your rules>" [--name <name>] [--yes]\n  atelier skill --from <path-to-your-work> [--reserve <file>]... [--name <name>]\n  Create a skill from rules you state, or from work you show.',
  create: 'atelier create <path-to-your-work> [--reserve <file>]... [--work-type <type>]\n  Read your work, seal the corpus, and propose rules. Nothing is compiled until you approve.',
  intake: 'atelier intake <path> [--work-type <type>] [--reserve <file>]... [--exclude <file>]... [--dry-run]\n  Read and seal the corpus. Reserved pieces are never read by discovery.',
  discover: 'atelier discover [--cap <usd>] [--max-calls <n>] [--skip-methods]\n  Propose rules from the sealed corpus. Spends inference budget.',
  pending: 'atelier pending [--json]\n  Show the proposals waiting for your decision.',
  ratify: 'atelier ratify --decisions <json>   or: atelier ratify --page <file.html>\n  Rule on every proposal at once, or write a page to rule on them in a browser.',
  'ratify-one': 'atelier ratify-one --id <id> --decision <decision>\n  Rule on one proposal.',
  add: 'atelier add --statement "<rule>" --kind GENERATIVE|BOUNDARY [--applies-when "<condition>"] [--materiality <level>] [--measure <observer>:<params>]\n  Add a rule in your own words. --measure makes it checkable: LEXICON:leverage|utilize · SENTENCE_LENGTH:medianMax=15,p90Max=28 · PARAGRAPH_LENGTH:maxSentences=4 · HEDGE_RATE:maxPer1000=3',
  'ratify-close': 'atelier ratify-close [--work-type <kind>] [--reason "<why>"]\n  Close ratification and mint the standard. --work-type is required when you wrote every rule yourself.',
  build: 'atelier build --name <name> [--description "<text>"]\n  Compile the ratified standard and install the skill.',
  confirm: 'atelier confirm --rule <id> [--drop]\n  Confirm or drop a boundary on a rule.',
  inspect: 'atelier inspect --skill <name>\n  What is installed, and whether it matches what was built.',
  history: 'atelier history --skill <name>\n  Every version of a skill and what it superseded.',
  rollback: 'atelier rollback --skill <name> --to <version>\n  Reinstall an earlier version.',
  revert: 'atelier revert\n  Undo the last build in this project.',
  compare: 'atelier compare --skill <name> --candidate <hash> --rule <id>\n  Blind A/B a candidate against the active version.',
  reject: 'atelier reject --skill <name> --candidate <hash> [--why "<reason>"]\n  Reject a candidate implementation.',
  promote: 'atelier promote --skill <name> --candidate <hash> --why "<what made you pick it>"\n  Install a candidate implementation. The standard does not move.',
  judgements: 'atelier judgements --skill <name>\n  Every A/B pick recorded for a skill.',
  invoke: 'atelier invoke --skill <name> "<task>"\n  Run the skill on a task.',
  amend: 'atelier amend --skill <name> --rule <id> [--statement "<new wording>"] [--materiality REQUIRED|PREFERRED|…] --reason "<why>"\n  Reword or reweigh a rule, recorded as a supersession.',
  sharpen: 'atelier sharpen --rule <id>\n  Ask the questions that would make a rule\'s condition precise.',
  answer: 'atelier answer --rule <id> --pick <option>\n  Answer a boundary probe.',
  improve: 'atelier improve --skill <name> [--invocation <id> --complaint "<what was wrong>"]\n  Propose one alternative implementation for a complaint.',
  feedback: 'atelier feedback --skill <name> --verdict GOOD|CLOSE|BAD [--note "<text>"]\n  Record a verdict on the last output.',
  fix: 'atelier fix "<what was wrong>"\n  Correct the latest output. Repairs the implementation, or asks whether the standard should change.',
  check: 'atelier check [--role discovery|target] [--no-negative-probe]\n  Verify the configured model backend actually works, and record what was measured.',
  profiles: 'atelier profiles\n  Every backend checked so far.',
  carriers: 'atelier carriers [--skill <name>] [--host codex]\n  Which parts of a skill reach the model on each host.',
  plan: 'atelier plan --skill <name> [--json]\n  Every rule and the mechanism that carries it.',
  contract: 'atelier contract --skill <name> [--bare] [--cap <usd>]\n  Test the skill against no skill at all.',
  reference: 'atelier reference --skill <name>   then: atelier reference --skill <name> --score --labels <json>\n  Test the skill blind against work you reserved.',
  record: 'atelier record --from-hook prompt|stop\n  Internal: called by the host plugin\'s hooks.',
  status: 'atelier status\n  Where the run in this project stands.',
  abort: 'atelier abort\n  Abandon the run in this project. What was decided is kept.',
  enrol: 'atelier enrol --kind DISCOVERY_STUDY|BEHAVIOUR_STUDY\n  Enrol this run in a study.',
  study: 'atelier study <subcommand> [options]\n  Evaluation apparatus. Not part of the product surface.',
};

export const wantsHelp = (args: readonly string[]): boolean => args.slice(1).some((a) => a === '--help' || a === '-h');

export function version(): string {
  // dist/cli/help.js in an install, cli/help.ts in a checkout: package.json is two or one level up.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, '..', '..', 'package.json'), join(here, '..', 'package.json')]) {
    if (!existsSync(p)) continue;
    const pkg = readJson<{ name?: string; version?: string }>(p, { what: 'package.json' });
    if (pkg.name === '@yannickyamo/atelier' && pkg.version) return pkg.version;
  }
  return 'unknown';
}
