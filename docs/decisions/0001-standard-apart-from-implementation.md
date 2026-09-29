# 0001. The standard is kept apart from its implementation

**Context.** Prompt and skill optimizers change the text a model reads until a score goes up. For
writing, nobody can write that score, and an optimizer free to edit the rules can redefine "good" to
whatever it can reach.

**Decision.** What "good" means is a `StandardVersion`: rules the owner approved, hashed and immutable.
How it is carried to a model is a `SkillVersion`: carriers, examples, persona, schemas. Many skill
versions may serve one standard. Every automated change (`fix`, `tend`, `optimize`) asserts the
standard's hash before and after. Only commands the owner runs (`ratify-close`, `confirm`, `amend`) mint
a new standard, and a new version records the reason for the change.

**Cost.** A search may never rephrase a rule, which removes the main lever optimizers like GEPA use. See
[0004](0004-search-under-a-fixed-standard.md) for how phrasing could still be searched without giving
up the invariant.
