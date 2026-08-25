# Contributing

Thanks for looking. A few things that will make a change easy to accept.

## Run it

```bash
npm ci
npm run typecheck     # tsc, strict plus four flags beyond it
npm run lint          # type-aware eslint; `npm run lint:fix` for the mechanical half
npm test              # 705 tests, ~2s
npm run build         # what a user installs
```

CI runs exactly those four, in that order, and then runs the built binary.

`npm test` builds the plugin trees first, because two tests read them.

The lint is type-aware, so it needs the TypeScript project and takes a few seconds. It is configured
to catch what `tsc` cannot: a floating promise, an `any` that escaped a `JSON.parse`, a caught error
rethrown without its cause. Where a rule is off, `eslint.config.js` says why — a disabled rule with
no reason is indistinguishable from one nobody understood.

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

Everything here has been tested against one person's corpus and one team's judgment. The claim Atelier
makes is about experts in general, and there is no honest way for the people who wrote it to test that
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

### Good first contributions

Roughly in order of how much each would move the project.

1. A corpus in a domain we have not tested. Law, medicine, finance, design, teaching.
2. A held-out reproduction result, positive or negative.
3. A second provider verified by a real call. Run `atelier check --provider openai-compatible --backend ollama --model <id>` and open an issue with the output.
4. A host adapter. `adapters/host-adapter.ts` is the whole contract, and a host may only claim to deliver a carrier by naming the mechanism that does it.
5. A carrier that a real standard demanded and Atelier could not express.
