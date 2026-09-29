# 0005. Forced tool choice where a model accepts it

**Context.** Every model call asks for one tool call whose input is the answer, and forces it
(`tool_choice: tool`). Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 reject forced tool choice with a 400, so
a person who set one of them as their model got an error on every call.

**Decision.** `providers/anthropic.ts` keeps forcing the call wherever a model accepts it. When the API
answers with its "tool_choice … not supported for this model" error, the provider remembers that model
and asks with `auto` plus an instruction to call the tool. A reply without the tool call still fails
closed.

**Not chosen: structured outputs** (`output_config.format`). They do not support the number bounds and
some array constraints these schemas carry, and moving every instrument to them would change what the
qualification studies measured. The claim reader runs on Claude Haiku 4.5, which accepts forced tool
choice, so its measured behaviour is unchanged.

**Cost.** On the newer models the call is a request, not a guarantee; the fail-closed check is what
holds.
