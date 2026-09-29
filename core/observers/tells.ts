// atelier/core/observers/tells.ts — THE SENTENCES THAT MARK TEXT AS MACHINE-WRITTEN, AS MOVES, NOT STRINGS.
//
// A reader who has read a lot of model output recognises a small number of MOVES, whatever words carry
// them: announcing an insight others supposedly miss, grading your own list after writing it, stacking
// superlatives, prefacing candour, summing up with a totaliser, reading the reader's mind, dressing one
// problem up in another's clothes. Seven blind rounds found them in every version written by a model, at
// three to ten times the rate of the human authors measured, whatever the prompt.
//
// These are families of the MODEL's habits, so the catalogue is the same for every skill. What differs
// per author is how each family is held (./contrast.ts): a family the author uses in fewer than half of
// their pieces is banned in ours, because their typical piece has none; one they use in most pieces is
// held to their rate. An author who writes "let me be blunt" in most pieces is not forbidden to.
//
// The catalogue is a PRIOR, deliberately small and general. It is extended per skill from data (the
// phrases a skill's own drafts repeat across unrelated topics and its author never uses:
// ./tell-lexicon.ts) and by the owner, never by adding a string after each round.

/** A family of machine-writing moves, and how to find one instance. */
export interface TellFamily {
  readonly id: string; readonly label: string; readonly re: RegExp;
  /** found by position, not by pattern (see ./style.ts): the regex is unused */
  readonly positional?: true;
}

export const TELL_FAMILIES: readonly TellFamily[] = [
  { id: 'INSIGHT_CLAIM', label: 'an insight others supposedly miss ("the part people miss", "nobody talks about")',
    re: /\b(?:the (?:part|thing|connection|mistake|point|bit|piece)(?: that)? (?:people|most people|teams|most teams|everyone|nobody|almost everyone|leaders|engineers) (?:\w+ )?(?:miss|misses|get wrong|gets wrong|skip|skips|forget|overlook|underestimate)|(?:people|teams|most people|most teams|everyone) (?:consistently |usually |often |always )?(?:miss|get wrong|overlook|underestimate) (?:this|that|it)|nobody (?:talks|wants to talk|tells you) about|what (?:nobody|no one) tells you)\b/gi },
  { id: 'RETRO_EMPHASIS', label: 'grading your own list ("that last one deserves emphasis")',
    re: /\b(?:that|this) (?:last|third|second|first|final) (?:one|point|item|bit)\b[^.!?\n]{0,40}\b(?:deserves|matters|is the one|compounds)\b|\bdeserves (?:its own section|emphasis|a closer look|special attention)\b/gi },
  { id: 'SUPERLATIVE', label: 'a stacked superlative ("the single most important")',
    re: /\bthe single (?:most|biggest|highest|best|largest|greatest|clearest)\b/gi },
  { id: 'EPOCH', label: 'epoch framing ("in this particular year", "more important in 2026 than")',
    re: /\b(?:there['’]s|there has) never been a (?:better|more \w+) time\b|\bin this particular (?:year|moment)\b|\bmore (?:interesting|important|urgent|relevant) (?:\w+ )?(?:in|now than in) (?:19|20)\d\d\b/gi },
  { id: 'CANDOUR', label: 'announced candour ("let me be blunt", "I want to be careful about")',
    re: /\b(?:let me (?:be concrete|make (?:this|it) concrete|get concrete)|let me be (?:blunt|honest|clear|direct|frank)|I want to be (?:careful|honest|clear|precise) (?:about|here)|I'?ll (?:be honest|implicate myself|be blunt|be direct|be frank)|to be (?:blunt|brutally honest|perfectly honest)|confession time)\b/gi },
  { id: 'TOTALISER', label: 'a totaliser ("that\'s the whole game")',
    re: /\bthat'?s (?:the|really the) whole (?:game|trade|point|practice|thing|argument|essay|story|job|discipline|trick)\b|\bthat'?s it\. that'?s the\b/gi },
  { id: 'MIND_READING', label: 'reading the reader\'s mind ("you know the one")',
    re: /\byou know the one\b|\bI suspect you(?:'ve| have| already)\b|\byou'?ve (?:probably|likely|almost certainly) (?:seen|felt|been|had)\b|\bif you'?re like (?:me|most)\b/gi },
  { id: 'COSTUME', label: 'one thing in another\'s clothes ("a staffing problem wearing a monitoring costume")',
    re: /\b(?:wearing|dressed (?:up )?(?:as|in)) (?:an? |the )?[\w'’ -]{0,40}?(?:costume|clothes|trench ?coat|disguise|mask)\b/gi },
  { id: 'GOES_TO_DIE', label: '"where X goes to die"', re: /\bwhere [\w ]{1,24} go(?:es)? to die\b/gi },
  { id: 'STACCATO_NOT', label: 'staccato negation ("Not a process. Not a tool.")', re: /\bNot [^.!?\n]{1,40}\. Not [^.!?\n]{1,40}\./g },
  // Measured on three authors' corpora (0 per 1,000 words in every one) against model drafts in three
  // blind rounds (0.1 to 0.5): the announced reframe, the recurring thought, the awkward size.
  { id: 'REFRAME_ANNOUNCE', label: 'an announced reframe ("here\'s the part…", "the honest version is")',
    re: /\b(?:here['’]s (?:the|a) (?:reframe|part|thing|catch|twist|kicker|problem|shape|trick|uncomfortable|honest)|the honest (?:version|answer|truth) (?:is|of)|here['’]s where (?:it|this|things) gets?|the (?:real|actual) (?:reframe|lesson|takeaway) is)\b/gi },
  { id: 'RECURRING_THOUGHT', label: 'a recurring thought announced ("I keep coming back to")',
    re: /\bI keep (?:coming back to|bumping into|running into|returning to|circling back to)\b/gi },
  { id: 'AWKWARD_SIZE', label: '"the awkward middle"', re: /\bthe awkward (?:middle|size|stage|zone)\b/gi },
  // PUNCTUATION AND RHYTHM, measured on a rewrite that added both to a post that had neither: em dashes
  // went from 0 to 4.3 per 1,000 words against the target author's 1.1 (4 of their 19 pieces use one),
  // and runs of three or more very short sentences from 2 to 4 ("The bots run on time. The plan gets
  // made. The drafts arrive."), where the author had one in 9,944 words. Neither separated the author
  // from a plain model at discovery, so nothing learned held them: the catalogue holds them for everyone.
  { id: 'EM_DASH', label: 'an em dash', re: /—/g },
  { id: 'STACCATO_RUN', label: 'a run of three or more very short sentences ("The plan gets made. The drafts arrive.")',
    re: /(?<![^\s])(?:[^\s.!?]+ ){0,4}[^\s.!?]+[.!?]["”’)]?(?:\s+(?:[^\s.!?]+ ){0,4}[^\s.!?]+[.!?]["”’)]?){2,}/g },
  // THE OPENING VERDICT. A contrastive verdict as the piece's first line ("X isn't a meeting. It's a
  // written decision process.") is a model's opening, not a writer's; readers flagged it in four of five
  // pieces of one round. Found by position in ./style.ts, and held to how often the author opens that way.
  { id: 'VERDICT_OPENER', label: 'a contrastive verdict as the opening line', re: /(?!)/g, positional: true },
];

/**
 * THE CONTRASTIVE VERDICT, every spelling of it: "isn't X, it's Y", "not X. It's Y", "not X, but Y",
 * "X rather than Y" as a verdict, "has little to do with… what matters is". Capping one spelling moved
 * the move onto the next in every round, so the move is counted as one thing.
 */
export const CONTRAST_VERDICT = new RegExp([
  /\b(?:isn['’]t|is not|aren['’]t|are not|wasn['’]t|was not|not) [^.;!?\n]{1,70}?(?:[,;.:]|—|\s-\s)\s?(?:it['’]s|it is|that['’]s|they['’]re|they are|but|just|only)\b/.source,
  /\b(?:has|had) (?:little|nothing) to do with\b/.source,
  /\bwhat (?:really |actually )?matters (?:here )?is\b/.source,
  /\bthe real (?:question|problem|issue|point) (?:here )?is\b/.source,
  /\b(?:is|are|was|amounts to|describes|reads as|counts as) (?:a|an|the)? ?[\w'’ -]{1,40}? rather than (?:a|an|the)\b/.source,
].join('|'), 'gi');

/** Every instance of a catalogued tell in a line of prose, with the family it belongs to. */
export function findTells(prose: string): { index: number; length: number; family: TellFamily }[] {
  const out: { index: number; length: number; family: TellFamily }[] = [];
  for (const f of TELL_FAMILIES) {
    if (f.positional) continue;
    f.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = f.re.exec(prose)) !== null) out.push({ index: m.index, length: m[0].length, family: f });
  }
  return out.sort((a, b) => a.index - b.index);
}
