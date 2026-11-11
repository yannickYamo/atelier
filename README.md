# Atelier

Atelier learns your standard from your best work, writes to it, and shows you what it holds. Point it at the pieces you'd sign and, if you have one, the method you follow. You get an agent that writes new pieces your way, and a record of your standard that you own.

[![CI](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml/badge.svg)](https://github.com/yannickYamo/atelier/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

<p align="center"><img src="docs/how-it-works.svg" alt="Your best work goes in. Atelier learns your taste and shows each habit beside a sentence of yours. It writes every new piece in your voice, for that request. It reads each piece before you do: made-up facts flagged, copied passages caught. Next: expert agents." width="100%"></p>

## The standard is the product

Every team will run agents, and out of the box they all write the same way. What is scarce is your own standard: how you open, what you cut, what you would never say, the method you follow without thinking about it.

Atelier captures that standard from finished work on day zero, before any agent has run. It is a record you own: your pieces, your method, your rules, and the pieces you accepted. It has a version. Any text can be checked against it. It moves to another tool, another machine or another model, and stays the same when the model underneath changes. [What a standard holds](docs/STANDARD.md).

Part of a standard can be decided: a length, a structure, a word you never use, a figure that must come from your notes. Atelier holds every piece to that part. The rest is taste. For that part it shows you what it learned and the sentence of yours it learned it from, and writes from it.

One standard, one agent. An agency keeps one per client. A content team keeps one per voice.

## How it learns your taste

You point it at finished work you're happy with. Ten blog posts, a year of newsletters, the essays you still link to. It reads what all of them have in common.

Some of that is countable: how long your paragraphs run, how your pieces open, which words never appear, how often you ask the reader a question. Some of it isn't. Where you commit and where you hedge. How you close. What you always cut before sending.

Most of this was never written down anywhere. People know good when they see it and can't say why. Atelier does the saying part, then shows it back to you in plain words: each habit with how often you do it and a sentence of yours it was read from. If one is wrong, say so in your own words and it changes.

A rule you state is fixed. A model can't quietly reword it later.

## Written from your pieces, read before it reaches you

A new piece is written from your own pieces of the kind you asked for, whole, with the material you attached and the task, then reviewed once: anything you wouldn't write is fixed, and the rest is left alone. The rules you stated yourself are shown to the writer in your words, and a sentence that still breaks one is rewritten, that sentence only.

Then every piece gets read before it reaches you, whoever wrote it. The counted habits get checked. Any figure or name that isn't in the material you provided is listed beside the piece for you to check, and never written into it. Any paragraph lifted out of your own examples gets flagged too, because a story of yours it wasn't given isn't yours to retell back at you.

Not happy with a piece? Say what was wrong in your own words, and only the sentences you mean change. Every run is recorded: what it was written from, what was checked, and what was found.

## Where it works

- **Blog posts and essays:** your voice, your openings, no invented anecdotes or numbers.
- **Newsletters:** the same voice issue after issue, every figure traced back to the notes you attached.
- **Release notes, announcements, internal memos:** anything your team writes often and wants to sound like itself.
- **Many voices at once:** an agency or a content team builds one agent per client or per author, from the pieces that already exist, and runs each by name.

Decision documents (PRDs, positioning, strategy) aren't covered yet: Atelier keeps their voice and checks their facts, but doesn't yet make the call well. See [EVALS](EVALS.md).

You still read it. You still sign it. The judgment moved earlier in the loop, not out of it.

## Why not just prompt it

A system prompt can only ask for what you can articulate. A model judge scores a draft 7 out of 10 against its own idea of good, which is the average of everyone's writing and therefore nobody's. Neither one knows what *your* good is, so neither can hold a draft to it.

And the failure isn't only stylistic. Fluent drafts invent. They attribute, they quantify, they tell a story that sounds like one of yours because it was assembled out of one of yours. You're the one signing it.

## What's shown so far

- **46 of 46 planted inventions caught** in drafts the check had never seen.
- **Your counted rules held:** 31% of answers broke one, against 76% for a hand-written skill.
- **Writing level with pasting your own posts** into the same model, on 25 blind-judged briefs, and ahead of asking it bare on 24 of them.

How each was measured, and what isn't established yet, is in [EVALS](EVALS.md).

## Try it

```bash
git clone https://github.com/yannickYamo/atelier && cd atelier
npm install && npm run build && npm link

atelier new ./my-posts "blog posts like these" --method method.md --name posts   # build the agent from your pieces (the method is optional)
atelier run "a post on why we moved off the queue" --with notes=notes.md   # write in your voice
atelier verify --skill posts draft.md --with notes=notes.md   # read any draft, yours or an agent's
```

At a terminal, `atelier new` ends by showing the agent at work: what it understood, a few questions only you can answer, two pieces written on the spot as previews, and one round of changes. A change you ask for and confirm is carried to every later piece. The previews are never added to your own pieces: the agent is built from your work, not from its drafts.

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
| **Pasting your examples** | The look, plus whatever it invents | Writing as good, with every figure checked against your material, your rules held and your own paragraphs left yours |
| **A model judge** | 7 out of 10 | The sentence, and the habit it broke |
| **Reading every draft yourself** | Your evenings | Your attention, spent only where a call is yours to make |

## Where it's going

One standard has three uses. Writing from it is what ships today. Reviewing someone else's draft against it comes next: `atelier verify` is the start. The third is grading: the same rules and accepted pieces as the grader when you train or choose a model.

Writing is the first expert we taught it, not the last. An expert isn't defined by how their output looks. It's defined by why they decide what they decide: which number they question, what they cut, when they push back on the brief. And it's rarely the procedure someone wrote down for them. It's the judgment that never made it into the procedure. Atelier is learning that part, and then holding every agent to it.

## Why I built it

I was the person signing agent-written drafts I hadn't fully read. The responsibility didn't shrink when the typing did. It moved, from writing the sentence to signing for it. Atelier exists so that signature means something again.

## More

[USAGE](docs/USAGE.md) has every command. [AGENTS.md](AGENTS.md) is the short version for a coding agent. [EVALS](EVALS.md) has what was measured and what was not. [MEASUREMENTS](MEASUREMENTS.md) lists every figure a code comment states. Node 22 or later; writing and the deeper reads need `ANTHROPIC_API_KEY` or an OpenAI-compatible backend, and `atelier check` tests it before anything is spent. No account, no telemetry: everything stays in `~/.atelier`.

## License

MIT. See [LICENSE](LICENSE). Reports of what it got right and wrong on your own writing are welcome: see [CONTRIBUTING](CONTRIBUTING.md).
