# Contributing

Thanks for looking. Atelier is source-available, not open source: the license permits use and redistribution of
unmodified copies, and changes are made only by the authors and the people they name. What is open to everyone is evidence: a report of what Atelier got right and wrong on work whose standard you know. The rest of this
file is for the people who change the code.

## Run it

```bash
npm ci
npm run typecheck     # tsc, strict plus four flags beyond it
npm run lint          # type-aware eslint; `npm run lint:fix` for the mechanical half
npm test              # the whole suite, offline, about a minute
npm run build         # what a user installs
```

Before citing any gate in a commit message, run `npm run preflight`: typecheck, lint, test and
build in one command, no pipes, non-zero on any failure. (It aggregates the CI steps above; it is a
local convenience, not an extra check.)

CI runs exactly those four, in that order, and then runs the built binary.

`npm test` builds the plugin trees first, because two tests read them.

Security issues go to [`SECURITY.md`](SECURITY.md), and behaviour changes to
[`CHANGELOG.md`](CHANGELOG.md).

The lint is type-aware, so it needs the TypeScript project and takes a few seconds. It is configured
to catch what `tsc` cannot: a floating promise, an `any` that escaped a `JSON.parse`, a caught error
rethrown without its cause. Where a rule is off, `eslint.config.js` says why: a disabled rule with
no reason is indistinguishable from one nobody understood.

## Releasing (maintainer)

A dated CHANGELOG section means shipped, so the section is dated by the release, not before it.
1. `npm run preflight`: green or stop.
2. Rename `## [Unreleased]` to `## [x.y.z] — <date>`; bump `package.json` to match.
3. `git tag vx.y.z && git push --tags`. release.yml re-runs the checks, then creates the GitHub release
   with the version's CHANGELOG section as its notes. It also publishes to npm with provenance, but only
   when the `NPM_TOKEN` repository secret is set; without it the release stops at GitHub.
4. Add the npm install line to README **after** `npm view @yannickyamo/atelier` returns a version.

`main` and the release tags are what count; any other branch on the remote is a working branch.

## How a change is judged

A fix that passes the test written for the report that found it can still break something no test
measured. So:

1. **A change to generation, checking, repair or compiling is compared with the previous release before
   it ships.** A change that fails a blocking metric does not merge, however good its unit tests look.
2. **Fix classes, not probes.** A reported failure joins the battery as a class, with both polarities (what
   must be caught, what must survive), before it is fixed.
3. **No instrument acts without a qualification.** A new model reader starts report-only, is recorded on
   every run, and may cut or gate only through `core/loop/cut-authority.ts` once it is measured.
4. **Numbers in the README and CHANGELOG come from recorded runs,** or are removed.
5. **A release note says what improved, what held, and what got worse.**

## What this repository is careful about

Atelier compiles an expert's ratified standard into a skill. Three rules hold the whole design
together, and a change that crosses one of them needs to say so in the PR.

**The expert owns what good means.** `StandardVersion` is immutable and only a person mints one.
An optimizer may rewrite every component of a `SkillVersion` and can never add, drop, or reword a
requirement. `assertArchitectureServesStandard` enforces this and it is not advisory.

**Nothing unconfirmed shapes output.** A rule nobody has ratified is shown as an example, never as
an instruction. Recurrence establishes that an author did something; it never establishes that an
output failing to do it is worse.

**A carrier is not implemented until the model receives it.** A test asserting that `componentFor`
returned `EXAMPLE` proves nothing about delivery. Assert on the rendered package, or on the payload
the invocation path composes.

## Tests

Tests live in `tests/` and mirror the module they cover. Two conventions matter:

- **Assert on values, not on source text.** A test that greps a source file for a token will one day
  fail on the comment explaining the very fix it is checking. Read the schema, the rendered bytes, or
  the returned object.
- **Every guard needs its polarity.** A test that only checks the passing case will pass when the
  guard is deleted. Assert the refusal too.

## Scope

Carriers are added when a ratified standard cannot be delivered without one, and not before.
Building `SCAFFOLD` or `TOOL_POLICY` speculatively would rebuild the fixed-template system this
project exists to replace.

## The contribution that matters most

Evidence from a domain we did not design around.

Everything here has been tested on a small number of corpora and judges. The claim Atelier makes is
about writers in general, and there is no honest way for the people who wrote it to test that
alone. A team validating its own tool on its own work produces a result that reads like proof and is
not one.

Run it on your own work and tell us what happened. The unflattering reports are the useful ones.

- **Did it recover you, or a flattering stranger?** Which proposed rules did you reject, and what was
  wrong with them. A rule that reads like a compliment is the failure mode most worth seeing.
- **Did it hold on work it had never read?** Hold a piece back with `--reserve`, build the skill, then
  run it on that piece's task. This is the central claim and the one with the least evidence.
- **Which carrier did the work?** An instruction, an example, a schema, or nothing at all. If a rule
  only landed once it became an example, that is a result.
- **Where did it get in your way?** A ratification step that felt like paperwork is a design defect,
  not user error.
- **Did a repair actually improve anything?** `atelier improve` changes the implementation and leaves
  your standard alone. Whether the new version is better is a judgment only you can make.

`atelier inspect` prints what a report needs: the standard, the architecture, and which rule became
which artifact. Paste it into an issue.

There is no telemetry and there never will be, so nothing reaches us unless you choose to send it.

### The most useful reports

Roughly in order of how much each would move the project.

1. A result on writing in a form we have not tested: essays, newsletters, reports, speeches, fiction.
2. A held-out reproduction result, positive or negative.
3. A second provider verified by a real call. Run `atelier check --provider openai-compatible --backend ollama --model <id>` and open an issue with the output.
4. A rule your standard needed that Atelier could not express.
