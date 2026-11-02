# Atelier

Atelier is a tool that learns how you write from the pieces you'd sign, then writes new pieces that way and reads each one before you see it.

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-source--available-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

<p align="center"><img src="docs/how-it-works.svg" alt="Your best work goes in. Atelier learns your taste and you approve each habit it found. It writes every new piece in your voice, for that request. It reads each piece before you do: made-up facts flagged, copied passages caught. Next: expert agents." width="100%"></p>

## How it learns your taste

You point it at finished work you're happy with. Ten blog posts, a year of newsletters, the essays you still link to. It reads what all of them have in common.

Some of that is countable: how long your paragraphs run, how your pieces open, which words never appear, how often you ask the reader a question. Some of it isn't. Where you commit and where you hedge. How you close. What you always cut before sending.

Most of this was never written down anywhere. People know good when they see it and can't say why. Atelier does the saying part, then hands it back to you one rule at a time, in plain words. You keep the rules that are actually you and drop the rest.

What you approve is fixed. A model can't quietly reword it later.

## Your voice on every piece

Every new piece gets written against those rules, for that specific request: what you asked for, the material you attached, and which of your rules apply to this kind of writing. A release note and a long essay don't get the same set.

Then every piece gets read before it reaches you. The counted habits get checked. Any figure or name that isn't in the material you provided gets flagged. Any paragraph lifted out of your own examples gets flagged too, because a story of yours it wasn't given isn't yours to retell back at you.

The same rules run on every piece. So the tenth one sounds like the first, not like a model that drifted over a long afternoon.

## Where it works

- **Blog posts and essays:** your voice, your openings, no invented anecdotes or numbers.
- **Newsletters:** the same voice issue after issue, every figure traced back to the notes you attached.
- **Release notes, announcements, internal memos:** anything your team writes often and wants to sound like itself.

Decision documents (PRDs, positioning, strategy) aren't covered yet: Atelier keeps their voice and checks their facts, but doesn't yet make the call well. See [EVALS](EVALS.md).

You still read it. You still sign it. The judgment moved earlier in the loop, not out of it.

## Why not just prompt it

A system prompt can only ask for what you can articulate. A model judge scores a draft 7 out of 10 against its own idea of good, which is the average of everyone's writing and therefore nobody's. Neither one knows what *your* good is, so neither can hold a draft to it.

And the failure isn't only stylistic. Fluent drafts invent. They attribute, they quantify, they tell a story that sounds like one of yours because it was assembled out of one of yours. You're the one signing it.

## What's shown so far

- **Blind readers ranked Atelier's pieces first** on a single read, ahead of the same model given the author's own posts as examples.
- **0 invented specifics across 60 pieces.** Plain prompting and pasted examples produced between 37 and 67 per corpus.
- **46 of 46 planted inventions caught.**

How each was measured, and what isn't established yet, is in [EVALS](EVALS.md).

## Try it

```bash
npm install -g @yannickyamo/atelier

atelier new ./my-posts "blog posts like these" --name posts   # learn your taste from your pieces
atelier run "a post on why we moved off the queue" --with notes=notes.md   # write in your voice
atelier verify --skill posts draft.md --with notes=notes.md   # read any draft, yours or an agent's
```

`atelier setup` lets the coding agents in a project (Claude Code, Codex) call it on their own drafts. Not happy with a piece? `atelier fix "the opening was too abstract"` and say it in your own words. [examples/blog](examples/blog) has six posts to try it on.

Here is what comes back when an agent's draft invents a source and lifts a paragraph from one of your posts:

```text
  ✗ Every specific in the work is found in what you supplied: 1 not found in it, and still in the text
  ✗ No passage is lifted from one of your examples: a run of 33 words is shared with one of them (11 at most)
```

## Against the alternatives

| What you'd reach for | What you get | What Atelier adds |
|---|---|---|
| **A system prompt** | A request the model may or may not honour | Your habits read from your own work, held on every piece |
| **Pasting your examples** | The look, plus whatever it invents | The look, with every figure traced to your material and your own paragraphs left yours |
| **A model judge** | 7 out of 10 | The sentence, and the habit it broke |
| **Reading every draft yourself** | Your evenings | Your attention, spent only where a call is yours to make |

## Where it's going

Writing is the first expert we taught it, not the last. An expert isn't defined by how their output looks. It's defined by why they decide what they decide: which number they question, what they cut, when they push back on the brief. And it's rarely the procedure someone wrote down for them. It's the judgment that never made it into the procedure. Atelier is learning that part, and then holding every agent to it.

## Why I built it

I was the person signing agent-written drafts I hadn't fully read. The responsibility didn't shrink when the typing did. It moved, from writing the sentence to signing for it. Atelier exists so that signature means something again.

## More

[USAGE](docs/USAGE.md) has every command. [AGENTS.md](AGENTS.md) is the short version for a coding agent. [EVALS](EVALS.md) has what was measured and what was not. [MEASUREMENTS](MEASUREMENTS.md) lists every figure a code comment states. Node 22 or later; writing and the deeper reads need `ANTHROPIC_API_KEY` or an OpenAI-compatible backend, and `atelier check` tests it before anything is spent. No account, no telemetry: everything stays in `~/.atelier`.

## License

Source-available. Unmodified copies may be used and redistributed; modification is reserved to the authors. See [LICENSE](LICENSE). Reports of what it got right and wrong on your own writing are welcome: see [CONTRIBUTING](CONTRIBUTING.md).
