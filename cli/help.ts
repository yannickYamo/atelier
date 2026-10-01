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
  new: 'atelier new <folder-of-your-best-work> "<what the skill is for>" [--name <name>] [--mode generate|guard|respond] [--exemplar <file>] [--reserve <file>]... [--held-out <n>] [--class <kind>] [--accept] [--set <id>=<choice>]...\n  Read your work, show the rules it found with a suggested ruling for each, and build the skill once you accept. Run it again to continue.',
  verify: 'atelier verify --skill <name> <file> [--class <kind>] [--with <name>=<file>]... [--allow-unsourced] [--taste [--task "<task>"]] [--repair [--placeholders]] [--profile] [--json]   (or pipe the text in)\n  Check any text against every measured rule in the standard, with the exact spans that break one, and for stories or figures not in the skill\'s material (UNSOURCED). Exits 1 when a REQUIRED rule is broken, 2 when it could not check (including a --class the standard does not measure). --taste also reads the rules no count can check (a model call); a miss where the reader has earned VETO fails too. --repair rewrites only the spans that break a REQUIRED rule and prints the text (the guard for text written elsewhere); an invented story is cut unless --placeholders. --profile shows where the text sits, layer by layer, on the counted features of your style the skill holds.',
  mcp: 'atelier mcp\n  Serve the standard over the Model Context Protocol (stdio): atelier_list_skills, atelier_rules, atelier_verify. Read-only; no model is called. The plugin registers it for you.',
  material: 'atelier material --skill <name> <file>...   or: --list · --clear\n  Notes, stories and figures you vouch for. Served with every task; a story or figure in the output that is not here becomes a placeholder for you to fill.',
  review: 'atelier review [--accept] [--set <id>=<choice>]...\n  The rules waiting for your ruling, with suggestions. --accept records them as shown; --set changes one (reject, approve, required, preferred, exemplar, tolerated, incidental).',
  skill: 'atelier skill "<your rules>" [--name <name>] [--yes]\n  atelier skill --from <path-to-your-work> [--reserve <file>]... [--name <name>]\n  Create a skill from rules you state, or from work you show.',
  create: 'atelier create <path-to-your-work> [--reserve <file>]... [--work-type <type>]\n  Read your work, seal the corpus, and propose rules. Nothing is compiled until you approve.',
  intake: 'atelier intake <path> [--work-type <type>] [--reserve <file>]... [--exclude <file>]... [--dry-run]\n  Read and seal the corpus. Reserved pieces are never read by discovery.',
  discover: 'atelier discover [--cap <usd>] [--max-calls <n>] [--skip-methods] [--no-contrast] [--contrast-cap <usd>]\n  Propose rules from the sealed corpus. Spends inference budget. Also has the model write plain drafts on your topics and proposes rules from the habits it has that you do not (--no-contrast skips it).',
  pending: 'atelier pending [--json]\n  Show the proposals waiting for your decision.',
  ratify: 'atelier ratify --decisions <json>   or: atelier ratify --page <file.html>\n  Rule on every proposal at once, or write a page to rule on them in a browser.',
  'ratify-one': 'atelier ratify-one --id <id> --decision <decision>\n  Rule on one proposal.',
  add: 'atelier add --statement "<rule>" --kind GENERATIVE|BOUNDARY [--applies-when "<condition>"] [--materiality <level>] [--measure <observer>:<params>] [--phase ACCURACY|STYLE]\n  Add a rule in your own words. --phase ACCURACY makes the repair loop fix it before any style rule. --measure makes it checkable: LEXICON:leverage=>use|utilize · SENTENCE_LENGTH:medianMax=15,p90Max=28 · PARAGRAPH_LENGTH:maxSentences=4 · HEDGE_RATE:maxPer1000=3 · PATTERN_RATE:pattern=EM_DASH,maxPer1000=0,prefer= - · FRAGMENT_SHARE:maxWords=5,maxShare=0.2',
  'ratify-close': 'atelier ratify-close [--work-type <kind>] [--reason "<why>"]\n  Close ratification and mint the standard. --work-type is required when you wrote every rule yourself.',
  build: 'atelier build --name <name> [--description "<text>"] [--exemplar <file>|none] [--class <kind>|none] [--contrast auto|none] [--voice auto|none] [--persona auto|none]\n  Compile the ratified standard and install the skill. From a corpus it also serves a few of your whole pieces and a persona of how you sound (each point with how often, quoted from your pieces); --voice none or --persona none turns them off. --class names the kind of document the rules were measured on (blog-post, support-reply); verify and invoke refuse text declared as another kind. --exemplar ships one complete piece of your own for the model to take its voice from. --contrast ships up to six "write this, not that" pairs from the loop\'s past repairs (auto, the default).',
  confirm: 'atelier confirm --skill <name> --rule <rule> [--drop]\n  Confirm or drop a boundary on a rule. <rule> is its id, its key (R-…) or its number in atelier plan.',
  inspect: 'atelier inspect --skill <name>\n  What is installed, and whether it matches what was built.',
  history: 'atelier history --skill <name>\n  Every version of a skill, what it superseded, and which rules moved.',
  tells: 'atelier tells --skill <name> [--learn [--probe <n>] [--include-reserved]] [--add "<phrase>"]... [--strike "<phrase>"]...\n  The machine-writing phrases this skill catches: learned from its own drafts (a phrase it repeats across three or more unrelated topics that your pieces never use, and whose absence cannot be chance), plus any you add, less any you strike. Your reserved pieces are not read unless you pass --include-reserved, which ends their use as a blind test. Checked on every output where the standard holds the machine-tell rule. Implementation, not standard.',
  fidelity: 'atelier fidelity --skill <name> [--read <file> | --set drafts=4,editBudget=2,retrievalK=3,notesCap=6 | --next | --distill [--cap <usd>] | --rollback]\n  Where the skill\'s outputs sit against the range your own pieces span, feature by feature, with drift alarms; and the implementation releases that steer them (drafts, structural edits, passages retrieved, experience notes). Every change is a new release you can roll back. Never changes a rule. Only --distill calls a model.',
  tend: 'atelier tend --skill <name> [--cap <usd>] [--auto]\n  Look after a skill in one command: find what keeps going wrong, check the taste reader and the regression floor, and run one round of search. With --auto, a winner the promotion gate allows is installed. Never changes a rule. Suitable for cron.',
  taste: 'atelier taste --skill <name> [--read <file> [--task "<task>"]] [--calibrate | --list | --label <token>=followed|missed|unsure ...] [--reader-model <model>]\n  The taste reader: reads text against the rules no count can check (argument, figure, register, cadence), twice and with quotes; shows what it has earned from your labels and what the standard covers. --calibrate asks you, blind to its verdict, whether a passage follows a rule; only readings held back from display are asked about. --list prints each with a token for --label. See docs/TASTE.md.',
  mine: 'atelier mine --skill <name> [--phrase]   |   atelier mine --skill <name> --add <n> --materiality required|preferred [--statement "<rule>"]\n  What keeps going wrong: recurring complaints no rule covers, rules that keep being missed, rules the first draft keeps breaking, repairs refused for changing meaning. Each with its remedy; a recurring gap becomes a rule only with --add.',
  optimize: 'atelier optimize --skill <name> [--candidates <n>] [--finalists <n>] [--screen-model <model>] [--no-reflect] [--promote] [--cap <usd>]   |   atelier optimize --skill <name> --report\n  One round of search over how the skill is implemented, never over what its rules say: changes proposed by reflection on real failures and by the fixed ordering, screened on a cheap model, the Pareto front confirmed against the regression floor, and adopted only when the promotion gate allows it (--promote). --report compares how often each proposer\'s changes were kept.',
  floor: 'atelier floor --skill <name> [--setup [--runs <n>]] [--corpus <folder>] [--tasks <file>] [--margin <rule>=<n>]... [--enforce <rule>]... [--observe <rule>]... [--baseline] [--qualify] [--check <version> [--target <rule>] [--promote]] [--fires <n>] [--cap <usd>]\n  The regression floor: what a new version may not make worse, and by how much. --setup does it all in one go: tasks from your titles, margins, enforce the REQUIRED counted rules, baseline, qualify. Margins come from your own pieces; --baseline freezes the active version\'s scores; --qualify measures the false-alarm rate; --check compares a candidate and says what the promotion gate allows.',
  rollback: 'atelier rollback --skill <name> --to <version>\n  Reinstall an earlier version.',
  revert: 'atelier revert\n  Undo the last build in this project.',
  compare: 'atelier compare --skill <name> --candidate <hash> --rule <id>\n  Blind A/B a candidate against the active version.',
  reject: 'atelier reject --skill <name> --candidate <hash> [--why "<reason>"]\n  Reject a candidate implementation.',
  promote: 'atelier promote --skill <name> --candidate <hash> --why "<what made you pick it>" [--override "<why a recorded rejection is wrong>"]\n  Install a candidate implementation. The standard does not move. A candidate the promotion gate or a repair already rejected needs --override, which is recorded.',
  judgements: 'atelier judgements --skill <name>\n  Every A/B pick recorded for a skill.',
  invoke: 'atelier invoke --skill <name> "<task>" [--with <name>=<file>]... [--json | --answer-only] [--drafts <n>] [--edits <n>] [--no-fidelity] [--class <kind>] [--no-repair] [--no-taste] [--allow-unsourced] [--placeholders]\n  Run the skill on a task. A skill built from a corpus writes several drafts (its implementation release says how many; four by default), keeps the one that breaks the fewest rules and lands most of its measured features inside the range your own pieces span, then redrafts its form toward that range where it is still outside (--edits 0 to stop that; --no-fidelity to run without the loop). An invented story, unnamed quotation or figure is cut and listed (--placeholders leaves a slot instead). The draft is checked against every measured rule and only the spans that break a REQUIRED one are rewritten (at most twice, plus one pass first for invented claims and ACCURACY rules); a rewrite that changes a figure, name, negation or qualifier is refused; --no-repair delivers the raw draft. The taste reader then reads the output against the rules no count can check (two or three model calls; about three per draft more once it has earned VETO); --no-taste turns it off. With --answer-only stdout carries only the answer, and --json one JSON object; everything else goes to stderr.',
  amend: 'atelier amend --skill <name> --rule <rule> [--statement "<new wording>"] [--materiality REQUIRED|PREFERRED|…] [--measure <observer>:<params>|none] [--phase ACCURACY|STYLE] [--applies-when "<condition>"|GENERAL] --reason "<why>"\n  Reword, reweigh, re-target, re-scope or re-phase a rule, recorded as a supersession. <rule> is its id, its key (R-…) or its number in atelier plan.',
  sharpen: 'atelier sharpen --rule <id>\n  Ask the questions that would make a rule\'s condition precise.',
  answer: 'atelier answer --rule <id> --pick <option>\n  Answer a boundary probe.',
  improve: 'atelier improve --skill <name> [--invocation <id> --complaint "<what was wrong>"]\n  Propose one alternative implementation for a complaint.',
  feedback: 'atelier feedback --skill <name> --verdict GOOD|CLOSE|BAD [--note "<text>"]\n  Record a verdict on the last output.',
  fix: 'atelier fix "<what was wrong>" [--pick a|b|same] [--reflect] [--floor-cap <usd>]\n  Correct the latest output. Repairs the implementation, or asks whether the standard should change. --reflect lets a model choose the change by reading your complaint, instead of the fixed ordering (recorded, so atelier optimize --report can compare the two). With an earned regression floor, a counted win is confirmed on its tasks (up to --floor-cap) and may install itself.',
  check: 'atelier check [--role discovery|target] [--no-negative-probe]\n  Verify the configured model backend actually works, and record what was measured.',
  profiles: 'atelier profiles\n  Every backend checked so far.',
  export: 'atelier export --skill <name> [--out <file>]\n  The skill as one file, its examples inlined: for an agent or a system prompt with no access to the skill folder.',
  carriers: 'atelier carriers [--skill <name>] [--host codex]\n  Which parts of a skill reach the model on each host.',
  plan: 'atelier plan --skill <name> [--json]\n  Every rule and the mechanism that carries it.',
  contract: 'atelier contract --skill <name> [--bare] [--cap <usd>]\n  Test the skill against no skill at all.',
  reference: 'atelier reference --skill <name> [--loop]   then: atelier reference --skill <name> --score --labels <json>\n  Test the skill blind against work you reserved.',
  record: 'atelier record --from-hook prompt|stop\n  Internal: called by the host plugin\'s hooks.',
  status: 'atelier status [--skill <name>]\n  Where the run in this project stands; with --skill, where that skill stands, on one page: its rules, what they cover, what the taste reader holds, the regression floor, uses, and what waits for you.',
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
