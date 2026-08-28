# Architecture

A requirement is five separate questions, and keeping them separate is most of the design. Each
column arrived from something that went wrong rather than from a diagram drawn in advance.

```text
                            REQUIREMENT
   ┌────────────┬─────────────┬───────────────┬────────────┬──────────────┐
   ▼            ▼             ▼               ▼            ▼
authority   appliesWhen   prerequisites    carrier     observation
who says    when it       what must        how the     how anyone
it binds    applies       exist first      behaviour   would know it
                                           is caused   happened
```

Collapse any two and you get a familiar failure. Fold observation into carrier and a schema starts
claiming a citation is true. Fold prerequisites into judgment and a model invents the evidence a rule
demanded. Fold authority into recurrence and a habit becomes law.

The core is provider and host neutral, and a boundary test keeps it that way.

```text
core/discovery/       evidence-backed candidate decisions, across framings
core/coverage/        weak support, blind spots, unresolved boundaries
core/ratification/    append-only human authority: what you saw, and what you did
core/architecture/    requirement → minimum carrier, and decisions apart from their realizations
core/delivery/        what each execution surface actually delivers, per carrier
core/state/           the six objects, prerequisites, and the request binding
core/runtime/         provider, model and configuration binding
core/inference/       the one seam a model reaches through, and the budget that bounds it
renderers/            SkillPackage generation
adapters/             host installation
providers/            inference backends
```

Four identities, and every one of them exists because assuming it was the same as another cost
something.

```text
StandardVersion     what good means             human-owned, immutable, content-addressed
SkillVersion        how one model produces it   machine-owned, replaceable
RuntimeBinding      what actually served it     observed, never inherited across a change
InvocationRequest   what was actually asked     bound, and proven equal to what was served
```

### Contributing, and what the checks are for

```bash
npm ci
npm run typecheck     # strict, plus four flags beyond it
npm run lint          # type-aware; every disabled rule states its reason
npm test              # the suite
npm run build         # what a user installs
```

CI runs exactly those four and then runs the built binary. The tests worth reading first are
witnesses rather than units. `tests/atelier-carrier-delivery.test.ts` proves a compiled contract
reaches the provider. `tests/atelier-reachability.test.ts` walks the import graph and refuses to let
a module go dark without someone writing down why. `tests/atelier-documented-claims.test.ts` holds
this file to what the code actually does, which is why the commands above are the commands that exist.

MIT.

---

[← back to the README](../README.md)
