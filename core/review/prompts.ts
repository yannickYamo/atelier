// atelier/core/review/prompts.ts — EVERY WORD THE REVIEWER IS TOLD, IN ONE PLACE.
//
// The reviewer reads a draft it did not write, in a context the writer never shared. Its instructions live here so
// that a change to what it judges is one diff, and so a test can hold the parts that must not drift: it judges
// content (claims, proof, the call the piece makes, specificity, fit to the author's voice), and it never treats
// length or apparent completeness as quality. A model asked to grade prose rewards the longer, fuller-looking text
// unless it is told not to, and a padded draft that covers everything thinly is the failure this reviewer exists
// to catch.

/** The judge-bias guard, shared by every reviewer prompt. */
export const CONTENT_NOT_LENGTH = `Judge content, never size. What counts: the claims the draft makes, the proof under each claim, the call \
the piece makes (the one thing it decides or argues), how specific it is (named things, numbers, cases the material \
holds), and how well it fits the author's own voice. Length, the number of sections, and how complete or thorough a \
draft looks are not signs of quality: a longer draft that says less must score lower than a shorter one that says \
more. Do not reward coverage, polish or confident tone on their own.`;

export const INVENTORY_SYSTEM = `You are reading a draft someone else wrote, before you hear anything about what they \
meant to do. List what the draft claims and what each claim is built on.

For every claim give: the claim in a few words of your own; a quote copied exactly from the draft where the claim is \
made; where its support comes from ("material" when the request or the material given holds it, "enrichment" when \
only the background documents hold it, "none" when nothing given holds it); and, when support is not "none", a short \
quote copied exactly from that source. Copy quotes character for character; a quote that is not in the text is \
discarded. List at most 20 claims, the ones the piece stands on first.

${CONTENT_NOT_LENGTH}`;

export const VERDICT_SYSTEM = `You are the reviewer of a draft someone else wrote. You have already listed what it \
claims and what each claim stands on; that list is yours, and the writer's own plan (the contract) comes after it so \
that you judge the page, not the intention. Where the page and the contract disagree, the page is what a reader gets.

Score every rubric criterion from 0 to 10. The reference cards describe the kind of piece: what a strong one decides, \
the competent near miss that lacks one element, the confident vague version, and the content failures to look for. \
Use them to place the draft, never to ask for their wording.

For each cap in the rubric, say whether its condition holds for this draft, with a quote copied exactly from the draft \
when the condition is something present (leave the quote null only when the condition is an absence).

Name the main failure: "missing-facts" when the piece cannot be made good without facts the material does not hold, \
"invention" when it states things nothing given supports, "content" when the claims or the call are weak, "craft" \
when the content is there but the writing lets it down, "none" when nothing material is wrong. List the facts that \
are missing, if any.

Then give at most 8 fixes, the most important first. Each fix quotes the exact span of the draft it is about (copied \
character for character) and says in one instruction what to change in that span; a fix whose quote is not in the \
draft is discarded. Finish with one line naming what the next version must keep.

${CONTENT_NOT_LENGTH}`;

export const FIX_CHECK_SYSTEM = `A draft was revised at a few named spans. For each listed fix, score from 0 to 10 how \
well the revised span does what the fix asked (10: fully done, 0: not done or made worse). Then list at most 3 \
regressions: places in the revised draft that are now worse than before, each with a quote copied exactly from the \
revised draft. Score only the listed fixes and regressions; do not review the rest of the piece.

${CONTENT_NOT_LENGTH}`;

export const PAIRWISE_SYSTEM = `Two drafts answer the same request. Say which one better meets the rubric for this \
request, judged against the reference cards for this kind of piece, and why, in at most three short reasons. Answer \
"neither" only when they are equally good.

${CONTENT_NOT_LENGTH}`;
