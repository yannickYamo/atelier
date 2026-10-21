import { citesLines } from "../../dist/core/loop/locators.js";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").replace(/\s+/g, " ").trim();
const lowered = (step) => ` ${step.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim()} `;
const tableColumns = (step) => {
  const said = /\btable\b[^.]*?\bcolumns?\s+(?:of\s+|named\s+|called\s+|:\s*)?(.+?)\s*(?:[.;]|$)/i.exec(step)?.[1];
  if (!said) return [];
  const columns = said.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((c) => norm(c));
  const more = /\b(?:one|each|every|per|in|with|for|row|rows|under|after|before|where|when|that|which|sorted|ordered)\b/;
  return columns.every((c) => c.length >= 2 && c.split(" ").length <= 5 && !more.test(c)) ? columns : [];
};
const COND = /\b(?:do not|don't|never|not|no(?!-)|unless|only when|only if|only for|only|if|when|where|whenever|except|optional(?:ly)?|rarely|sometimes|avoid|without|instead of|rather than|skip|replace)\b/i;
const WHEN = /^(?:only|unless|if|when|whenever|except|optional(?:ly)?|rarely|sometimes|skip|omit|leave (?:it )?out|drop)\b|\bonly[.!]?$|\b(?:optional(?:ly)?|omit|skip|leave (?:it )?out|drop)\b/i;
const OF_EVERY = /\b(?:each|every|all)\s+(?:sections?|parts?|headings?|pages?)\b/i;
const isConditional = (step) => OF_EVERY.test(step) || step.split(/(?<=[.:;!?])\s+/).some((c) => COND.test(c) && /\b(?:sections?|headings?|tables?|parts?|it|its|them)\b/i.test(c)) || step.split(/(?<=[.;!?])\s+/).some((c, i) => i > 0 && WHEN.test(c.trim()));
const PUTS = ["with", "in", "under", "include", "includes", "add", "adds", "have", "has", "contain", "contains", "write", "provide", "provides", "need", "needs", "there must be", "there is"];
const EDGE = /\b(?:opens?|starts?|begins?|leads?|ends?|closes?|finish(?:es)?|concludes?) with $/;
const SEQUENCE = "then|next|after that|after it|finally|lastly|last|first|second|third|fourth|fifth";
function placedAt(low, sec, sequenced) {
  const hits = [];
  for (const art of ["a", "an", "one"]) for (const kind of ["section", "heading", "line"]) {
    const phrase = ` ${art} ${norm(sec)} ${kind} `;
    for (let at = low.indexOf(phrase); at !== -1; at = low.indexOf(phrase, at + 1)) {
      const before = low.slice(0, at + 1);
      if (kind === "line" ? EDGE.test(before) : PUTS.some((w) => before.endsWith(` ${w} `))) hits.push(at);
      else if (kind !== "line" && /\b(?:section|heading|line) (?:and then|and|then) $/.test(before)) hits.push(at);
      else if (kind !== "line" && sequenced === norm(sec) && /^ (?:and )?(?:then|next|after that|after it|finally|lastly|last|first|second|third|fourth|fifth) $/.test(before)) hits.push(at);
    }
  }
  return hits.length ? Math.min(...hits) : -1;
}
function sectionsPlaced(step, sections) {
  const low = lowered(step);
  const sequenced = norm(new RegExp(String.raw`^\s*(?:and\s+)?(?:${SEQUENCE}),?\s+(?:a|an|one)\s+(.+?)\s+(?:section|heading)\s*(?:[:.;]|$|,?\s*(?:that|which|with|listing|holding|naming|giving)\b)`, "i").exec(step)?.[1] ?? "");
  return sections.map((sec) => ({ sec, name: norm(sec), at: placedAt(low, sec, sequenced) })).filter((x) => x.at !== -1 && x.name.length >= 3).sort((a, b) => a.at - b.at);
}
const NAME = String.raw`(?:["“']([^"”']{3,40})["”']|((?:\p{Lu}[\w'-]*\s?){1,5}))`;
const VERB = String.raw`(?:[Oo]pen|[Ss]tart|[Bb]egin|[Ll]ead|[Ee]nd|[Cc]lose|[Ff]inish|[Cc]onclude|[Ii]nclude|[Aa]dd|[Ww]rite|[Hh]ave|[Hh]as|[Cc]ontain)`;
const sectionsNamed = (step) => [
  ...step.matchAll(new RegExp(String.raw`\b(${VERB})\w*\s+(?:with\s+)?(?:an?\s+|the\s+|its\s+|one\s+)?${NAME}\s*(?:section|heading|part)\b`, "gu")),
  ...step.matchAll(new RegExp(String.raw`\b(${VERB})\w*\b[^.;]*?\b(?:section|heading|part)\s+(?:called|named|titled|headed)\s+${NAME}`, "gu")),
  ...step.matchAll(new RegExp(String.raw`\b([Uu]nder)\s+(?:the\s+|a\s+)?heading\s+${NAME}`, "gu"))
].map((m) => ({ verb: m[1].toLowerCase(), name: (m[2] ?? m[3]).trim(), at: m.index })).filter((x) => x.name.length >= 3).sort((a, b) => a.at - b.at);
const sectionsOutright = (step, sections) => [...step.matchAll(new RegExp("\\b(?:an?|one)\\s+((?:\\p{Lu}[\\w'-]*\\s?){1,4}?)\\s*(?:section|heading)\\b", "gu"))].map((m) => m[1].trim()).filter((n2) => !sections.some((sec) => norm(sec) === norm(n2)));
function optionsOf(step) {
  const said = /\b(?:section|heading)\b[^.;]*?\b(?:holds?|is|says?|reads?|gives?|states?|contains?|with)\s+(?:exactly\s+|only\s+)?one of(?: these| the following)?\s*:?\s+([^.;]+)/i.exec(step)?.[1];
  if (!said) return [];
  const options = said.replace(/\([^)]*\)/g, " ").split(/\s*,\s*(?:or\s+|and\s+)?|\s+or\s+/).map((o) => o.replace(/[*_`"“”']/g, "").replace(/\s+only$/i, "").trim()).filter(Boolean);
  return options.length >= 2 && options.length <= 6 && options.every((o) => o.split(/\s+/).length <= 4) ? options : [];
}
const SOFT = /\b(?:unless|if|when|whenever|except|sometimes|rarely|optional(?:ly)?|usually|about|around|roughly|approximately|ideally|aim|try|typically|possible|in most cases|generally|prefer(?:ably)?|normally|often|mostly|give or take|rule of thumb|excluding|not counting|depending)\b|~/i;
const QUOTED = String.raw`(?:["“]([^"”]{2,40})["”]|(?<![\p{L}])'([^']{2,40})'(?![\p{L}]))`;
const n = (x) => Number(x.replace(/,/g, ""));
const quotedIn = (t) => [...t.matchAll(new RegExp(QUOTED, "gu"))].map((m) => (m[1] ?? m[2]).trim());
const negated = (t) => /\b(?:not|never|cannot|no)\b|n't\b/i.test(t.replace(/\bno (?:more|fewer|longer|sentence)\b/gi, " "));
function longestSentence(step) {
  const longest = /\bno sentence\b[^.]*?\b(?:longer than|over|more than|above|exceed(?:s|ing)?)\s+(\d[\d,]*)\s+words\b/i.exec(step);
  return longest && !negated(step) ? { observer: "LENGTH", params: { unit: ["sentence"], max: n(longest[1]) } } : null;
}
const UNIT = String.raw`(words?|characters?|sentences?)`;
const unitOf = (u) => u.toLowerCase().startsWith("word") ? "words" : u.toLowerCase().startsWith("char") ? "characters" : "sentences";
const countsIn = (step) => [...step.matchAll(new RegExp(String.raw`\d[\d,]*\s+${UNIT}\b`, "gi"))];
const PART = /\b(?:per|each|every|title|headline|subject(?: line)?|summary|intro(?:duction)?|hook|bullets?|items?|paragraphs?|sections?|quot(?:e|es|ed|ation)|examples?|captions?|headings?|replies|posts|sentences?|lines?|lede|lead|abstract|descriptions?|tagline|opening|closing|first|last|a sentence)\b/i;
const ofAPart = (step, counts) => PART.test(counts.reduce((s, m) => s.replace(m[0], " "), step)) || counts.some((m) => /^\s+(?:of|in the|for|from|like|by)\b/i.test(step.slice((m.index ?? 0) + m[0].length)));
function rangeOf(step) {
  const m = new RegExp(String.raw`\b(?:between|from)\s+(\d[\d,]*)\s+(?:and|to)\s+(\d[\d,]*)\s+${UNIT}\b`, "i").exec(step) ?? new RegExp(String.raw`(?<![\d-])(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)\s+${UNIT}\b`, "i").exec(step);
  return m ? { unit: unitOf(m[3]), min: n(m[1]), max: n(m[2]) } : null;
}
const LEAST = new RegExp(String.raw`\b(at least|no fewer than|a minimum of|minimum of|over|(?<!\bno )more than)\s+(\d[\d,]*)\s+${UNIT}\b`, "i");
const MOST = new RegExp(String.raw`\b(at most|no more than|no longer than|up to|a maximum of|maximum of|under|fewer than|less than|below)\s+(\d[\d,]*)\s+${UNIT}\b`, "i");
function boundsOf(step, counts) {
  const least = LEAST.exec(step);
  const most = MOST.exec(least ? step.replace(least[0], " ") : step);
  if ((least ? 1 : 0) + (most ? 1 : 0) !== counts) return null;
  if (least && most && unitOf(least[3]) !== unitOf(most[3])) return null;
  const min = least ? n(least[2]) + (/over|more than/i.test(least[1]) ? 1 : 0) : null;
  const max = most ? n(most[2]) - (/under|fewer|less|below/i.test(most[1]) ? 1 : 0) : null;
  return { unit: unitOf((least ?? most)?.[3] ?? "words"), min, max };
}
function wholeLength(step, counts) {
  if (ofAPart(step, counts) || negated(step)) return null;
  const range = rangeOf(step);
  const b = range ? counts.length === 1 ? range : null : boundsOf(step, counts.length);
  if (!b || b.min === null && b.max === null || b.min !== null && b.max !== null && b.min > b.max) return null;
  return { observer: "LENGTH", params: { unit: [b.unit], ...b.min !== null ? { min: b.min } : {}, ...b.max !== null ? { max: b.max } : {} } };
}
const spoken = (sec) => norm(sec).replace(/^\d+ /, "");
const opensWith = (sec) => new RegExp(`^ (?:(?:keep|hold|limit|cap|write) )?(?:the |a |an |your )?${spoken(sec)} (?:section )?`);
const sectionsOpening = (step, sections) => {
  const low = lowered(step);
  return sections.filter((sec) => spoken(sec).length >= 3 && opensWith(sec).test(low));
};
function sectionLength(step, sections) {
  if (SOFT.test(step) || negated(step)) return null;
  const low = lowered(step);
  const counts = countsIn(step);
  const named = sectionsOpening(step, sections);
  if (named.length !== 1 || !counts.length) return null;
  const rest = low.replace(opensWith(named[0]), " ");
  if (/ (?:piece|whole|work|document|page|after|before|unlike|links?) /.test(rest) || PART.test(rest.replace(/\bsections?\b/g, " "))) return null;
  const range = rangeOf(step);
  const b = range ? counts.length === 1 ? range : null : boundsOf(step, counts.length);
  if (!b || b.min === null && b.max === null || b.min !== null && b.max !== null && b.min > b.max) return null;
  return { observer: "LENGTH", params: { unit: [b.unit], in: [named[0]], need: 1, ...b.min !== null ? { min: b.min } : {}, ...b.max !== null ? { max: b.max } : {} } };
}
const SMALL = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const SMALL_N = String.raw`(\d{1,2}|${Object.keys(SMALL).join("|")})`;
const smallOf = (x) => /^\d/.test(x) ? Number(x) : SMALL[x.toLowerCase()];
const CEILING_NEGATION = /\b(?:must|should|may|can|do|does|will)\s*(?:not|n't)\s+(?:ever\s+)?(?:exceed|run\s+(?:past|beyond|over|longer than)|go\s+(?:past|beyond|over)|be\s+longer than|(?:have|hold|contain)\s+more than)\b|\bnever\s+let\s+(?:a|any|the|your|each|every)?\s*paragraphs?\s+(?:exceed|run\s+(?:past|beyond|over|longer than)|go\s+(?:past|beyond|over)|(?:have|hold|contain)\s+more than)\b/i;
function paragraphLength(step) {
  const t = step.trim();
  if (!/\bparagraphs?\b/i.test(t) || /\b(?:first|last|final|opening|closing|second|third|next|previous|this|that)\s+paragraph\b/i.test(t)) return null;
  if (/\b(?:at least|no fewer than|minimum|a minimum of)\b/i.test(t)) return null;
  if (/\bthe\s+(?!paragraphs?\b)[\w-]+\s+paragraph\b(?!s)/i.test(t)) return null;
  if (/\b(?:open|opens|opening|begin|begins|start|starts|lead|leads|end|ends|ending|close|closes|closing|finish|finishes|conclude|concludes)\s+(?:with|on|by)\s+(?:a|an|one|a single)\s+(?:[\w-]+\s+)?paragraph\b(?!s)/i.test(t)) return null;
  const ceilingWords = /\bno\s+paragraph\b|\bnever\b|\bnot\b|n't\b/i;
  if (/\b(?:are|is)\s+(?:fine|ok|okay|allowed|acceptable|welcome)\b|\b(?:may|can)\b/i.test(t) && !ceilingWords.test(t)) return null;
  if (negated(t.replace(/\bno (?:paragraph|more than|longer than)\b/gi, " ").replace(/\bnever\s+(?:exceed(?:s|ing)?|run(?:s)?\s+(?:past|longer than|beyond)|(?:have|has|be)?\s*(?:more|longer)\s+than)\b/gi, " ").replace(new RegExp(CEILING_NEGATION.source, "gi"), " "))) return null;
  const afterParagraph = t.slice(t.search(/\bparagraphs?\b/i));
  if (/\b(?:keep|limit|hold|cap|restrict)\s+(?:the|your|its|their|this|that)\s+(?!paragraphs?\b)\w+/i.test(afterParagraph)) return null;
  if (new RegExp(String.raw`\b${SMALL_N}\s*(?:to|-|–|and)\s*${SMALL_N}\s+sentences?\b`, "i").test(t) || /\bbetween\b/i.test(t)) return null;
  if (new RegExp(String.raw`\b${SMALL_N}\s+paragraphs?\b`, "i").test(t)) return null;
  const counts = [...t.matchAll(new RegExp(String.raw`\b${SMALL_N}\s+sentences?\b`, "gi"))];
  if (counts.length !== 1) return null;
  const after = t.slice(t.search(/\bparagraphs?\b/i));
  const forms = [
    [new RegExp(String.raw`\b(?:at most|no more than|no longer than|up to|a maximum of|maximum of|max(?:imum)?|to|of|within)\s+${SMALL_N}\s+sentences?\b(?!\s+or\s+more)`, "i"), 0],
    [new RegExp(String.raw`\b${SMALL_N}\s+sentences?\s+(?:or\s+(?:fewer|less)|at most|max(?:imum)?)\b`, "i"), 0],
    // "Each paragraph: three sentences, max." The ceiling closes the clause; "three sentences, maximum two long" is not one.
    [new RegExp(String.raw`\b${SMALL_N}\s+sentences?,\s*(?:at most|max(?:imum)?)\.?(?=\s*(?:[;!]|$))`, "i"), 0],
    // "Cap every paragraph at three sentences": a cap or a limit set at a number.
    .../^\s*(?:cap|limit)\b/i.test(t) ? [[new RegExp(String.raw`\bat\s+${SMALL_N}\s+sentences?\b`, "i"), 0]] : [],
    [new RegExp(String.raw`\b(?:under|fewer than|less than|below)\s+${SMALL_N}\s+sentences?\b`, "i"), -1],
    [new RegExp(String.raw`\b(?:longer than|more than|over|past|beyond|exceed(?:s|ing)?)\s+${SMALL_N}\s+sentences?\b`, "i"), 0]
  ];
  for (const [re, shift] of forms) {
    const m = re.exec(after);
    if (!m) continue;
    if (/^\s+(?:of|from|after|before)\b/i.test(after.slice(m.index + m[0].length))) return null;
    if (/longer|more|over|past|beyond|exceed/i.test(m[0]) && !/^(?:at most|no more than|no longer than)/i.test(m[0]) && !/\bno paragraph\b|\bnever\b/i.test(t) && !CEILING_NEGATION.test(t)) return null;
    const max = smallOf(m[1]) + shift;
    return max >= 1 ? { observer: "PARAGRAPH_LENGTH", params: { maxSentences: max } } : null;
  }
  return null;
}
function edgeWords(step) {
  const edges = [...step.matchAll(/\b(last|final|closing|first|opening)\s+paragraph\b/gi)];
  if (/\b(?:last|final|closing|first|opening)\s+(?:line|sentence)\b/i.test(step)) return null;
  const edge = edges.length === 1 ? new RegExp(String.raw`\b(?:last|final|closing|first|opening)\s+paragraph\b[^.]*?\b(?:starts?|begins?|opens?)\s+with\s+((?:${QUOTED}\s*(?:,|or)?\s*)+)`, "iu").exec(step) : null;
  if (edge && !negated(step)) {
    const starts = quotedIn(edge[1]);
    if (starts.length) return { observer: "PRESENCE", params: { in: [/^(?:first|opening)$/i.test(edges[0][1]) ? "first" : "last"], starts } };
  }
  return null;
}
function bannedWords(step) {
  const banned = new RegExp(String.raw`\b(?:never|do not|don't|avoid)\s+(?:use|say|write|using|saying|writing)\s+(?:the\s+)?(?:words?|phrases?)?\s*((?:${QUOTED}\s*(?:,|or|and)?\s*)+)[.!]?\s*$`, "iu").exec(step.trim());
  if (banned) {
    const terms = quotedIn(banned[1]).map((t) => t.toLowerCase());
    if (terms.length) return { observer: "LEXICON", params: { terms } };
  }
  return null;
}
function statedCount(step) {
  if (SOFT.test(step)) return null;
  const longest = longestSentence(step);
  if (longest) return longest;
  const paragraph = paragraphLength(step);
  if (paragraph) return paragraph;
  const counts = countsIn(step);
  return counts.length ? wholeLength(step, counts) : edgeWords(step) ?? bannedWords(step);
}
const FORBIDS_OR_CONDITIONS = /\b(?:do not|don't|never|not|no(?!-)|unless|if|when|where|whenever|except|optional(?:ly)?|avoid|without|instead of|rather than)\b/i;
const A_CITED_LINE = String.raw`(?:\b(?:the|its|their|each|every|a|that|only)\s+(?:(?:exact|changed|specific|offending|relevant|added|new|modified|precise)\s+)?lines?\b(?!\s+(?:manager|items?|counts?|breaks?|spacing|lengths?|of\s+(?:the\s+|your\s+|a\s+)?(?:poem|email|letter|song|story|verse|post|essay|speech|piece)))|\b(?:file|path)(?:\s+(?:name|path))?\s+(?:and|with|plus|,)\s+(?:the\s+|a\s+|its\s+)?lines?(?:\s+numbers?)?\b(?!\s+(?:counts?|items?|manager|breaks?|lengths?))|\blines?\s+numbers?\b|\blines?\s+(?:in|of|from)\s+the\s+(?:diff|change|code|patch|file|source)\b)`;
const CITES_A_LINE = new RegExp(String.raw`\b(?:cit(?:e|es|ed|ing)|referenc(?:e|es|ed|ing)|point(?:s|ed|ing)?\s+(?:to|at)|quot(?:e|es|ed|ing))\b[^.;]*?${A_CITED_LINE}`, "i");
const GIVES_FILE_AND_LINE = /\b(?:giv(?:e|es|ing)|nam(?:e|es|ing)|stat(?:e|es|ing)|includ(?:e|es|ing)|say|says|writ(?:e|es|ing)|carr(?:y|ies|ying)|with|show|shows)\b[^.;]*?\b(?:file|path|filename)(?:\s+(?:name|path))?\s+(?:and|with|plus|,)\s+(?:the\s+|a\s+|its\s+)?lines?(?:\s+numbers?)?\b(?!\s+(?:counts?|items?|manager|breaks?|lengths?))/i;
const AN_ITEM = String.raw`(?:findings?|claims?|issues?|comments?|items?|remarks?|points?|risks?|problems?|defects?|suggestions?|nits?|bullets?)`;
const EACH_POINTS_AT = new RegExp(String.raw`\b(?:every|each|all|any)\s+(?:[\w-]+\s+){0,3}?${AN_ITEM}\b[^.;]*?\bpoints?\s+(?:at|to)\s+(?:the\s+|its\s+|a\s+)?(?:code|lines?|diff|change|source)\b`, "i");
const PER_ITEM = new RegExp(String.raw`\b(?:every|each|all|per)\s+(?:[\w-]+\s+){0,3}?${AN_ITEM}\b`, "i");
function citesPlaces(step, cites, sections = []) {
  if (FORBIDS_OR_CONDITIONS.test(step)) return null;
  if (!(cites(step) || CITES_A_LINE.test(step) || GIVES_FILE_AND_LINE.test(step) || EACH_POINTS_AT.test(step))) return null;
  const perItem = PER_ITEM.test(step);
  return { perItem, sections: perItem ? sectionsMentioned(step, sections) : [] };
}
function sectionsMentioned(step, sections) {
  const low = lowered(step);
  const forms = (sec) => {
    const n2 = norm(sec);
    return [.../* @__PURE__ */ new Set([n2, n2.replace(/s\b/g, ""), n2.replace(/(?<=\w)$/, "s")])];
  };
  return sections.filter((sec) => norm(sec).length >= 3 && forms(sec).some((f) => low.includes(` ${f} `)));
}
const NAMES_A_TEST = new RegExp(String.raw`\b(?:nam(?:e|es|ing)|add(?:s|ed|ing)?|writ(?:e|es|ing)|propos(?:e|es|ing)|suggest(?:s|ed|ing)?)\b[^.;]*?\btests?` + String.raw`(?:(?:'s)?\s+names?\b|(?:\s+(?:cases?|functions?))?(?=\s+(?:that|which|for|to|covering|catching|would|could|named|called|of)\b|\s*[.,;:)]|\s*$))`, "i");
const NOT_A_CODE_TEST = /\b(?:A\/B|AB|split|multivariate|usability|user|load|stress|penetration|pen|blood|driving|taste|beta|market|field|clinical|drug|smell|litmus|acid|stress|eye|hearing|personality|aptitude|IQ)[\s-]+tests?\b/i;
const namesTest = (step) => NAMES_A_TEST.test(step) && !FORBIDS_OR_CONDITIONS.test(step) && !NOT_A_CODE_TEST.test(step);
function sectionsCheck(sections, outline, where = {}) {
  return { observer: "PRESENCE", params: {
    sections: [...sections],
    body: 1,
    ...where.opens ? { opens: 1 } : {},
    ...where.closes ? { closes: 1 } : {},
    ...outline.labels ? { labels: 1 } : {},
    ...where.options?.length && sections.length === 1 ? { options: [...where.options] } : {}
  } };
}
const SOURCING = /\b(?:cit(?:e|es|ed|ation)|sourc(?:e|es|ed|ing)|attribut\w+|referenc\w+)\b/i;
const FIGURES = /\b(?:figure|number|statistic|stat|data|metric|price|pricing|revenue|percent\w*|quantit\w+)s?\b/i;
const ABOUT_FIGURES = /\b(?:figure|number|statistic|stat|data|claim|metric|price|pricing|revenue|percent\w*|quantit\w+)s?\b/i;
function checkNamedBy(step, outline, how = {}) {
  const said = ` ${norm(step)} `;
  const columns = tableColumns(step);
  if (columns.length >= 2) return { observer: "TABLE", params: { columns, minRows: 1 } };
  const conditional = isConditional(step);
  const low = lowered(step);
  const found = conditional ? [] : sectionsPlaced(step, outline.sections);
  const named = conditional ? [] : sectionsNamed(step);
  const outright = sectionsOutright(step, outline.sections);
  if (found.length && outright.length && !conditional) return sectionsCheck([...found.map((x) => x.sec), ...outright], outline);
  if (found.length && named.every((x) => found.some((f) => f.name === norm(x.name)))) {
    how.byName = found.some((f) => !named.some((x) => norm(x.name) === f.name));
    const before = (x) => low.slice(0, x.at + 1);
    const opens = /\b(?:opens?|starts?|begins?|leads?)(?: with)? $/.test(before(found[0]));
    const closes = /\b(?:ends?|closes?|finish(?:es)?|concludes?)(?: with)? $/.test(before(found[found.length - 1]));
    return sectionsCheck(found.map((x) => x.sec), outline, { opens, closes: closes && !(opens && found.length === 1), options: optionsOf(step) });
  }
  const sections = named.map((x) => x.name).filter((n2, i, all) => all.findIndex((o) => norm(o) === norm(n2)) === i);
  if (sections.length) {
    const opens = /^(?:open|start|begin|lead)/.test(named[0].verb);
    const closes = /^(?:end|close|finish|conclude)/.test(named[named.length - 1].verb);
    return sectionsCheck(sections, outline, { opens, closes: closes && !(opens && sections.length === 1), options: optionsOf(step) });
  }
  if (/\b(?:an?|one|two|three|\d+)\s+(?:[\w-]+\s+){0,3}tables?\b|\btables?\s+(?:with|of|showing|comparing|listing)\b/i.test(step) && outline.tables.length) {
    const columnsSaid = (t) => t.header.filter((h) => h.length >= 3 && said.includes(` ${norm(h)} `)).length;
    const best = [...outline.tables].sort((a, b) => columnsSaid(b) - columnsSaid(a))[0];
    if (columnsSaid(best) > 0 || outline.tables.length === 1) return { observer: "TABLE", params: { columns: best.header.filter(Boolean), minRows: 1 } };
  }
  const whole = (m) => m?.observer === "LENGTH" && !m.params.in && sectionsOpening(step, outline.sections).length ? null : m;
  const counted = sectionLength(step, outline.sections) ?? whole(statedCount(step));
  if (counted) return outline.labels && counted.observer === "LENGTH" && counted.params.in ? { ...counted, params: { ...counted.params, labels: 1, sections: [...outline.sections] } } : counted;
  const cites = citesPlaces(step, citesLines, outline.sections);
  if (cites) return { observer: "LINES", params: { min: 0, ...cites.perItem ? { perItem: 1, ...cites.sections.length ? { sections: cites.sections } : {} } : {} } };
  if (namesTest(step)) return { observer: "NAMES_TEST", params: {} };
  if (SOURCING.test(step) && ABOUT_FIGURES.test(step)) {
    const figures = step.search(FIGURES);
    const source = step.search(SOURCING);
    how.related = !(figures !== -1 && figures < source);
    return { observer: "CITED", params: { allow: 0 } };
  }
  return null;
}
function specOf(m) {
  if (m.observer === "LEXICON") return `LEXICON:${m.params.terms.join("|")}`;
  const kv = Object.entries(m.params).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(typeof v[0] === "number" ? "/" : "|") : String(v)}`);
  return kv.length ? `${m.observer}:${kv.join(",")}` : m.observer;
}
function standInChecks(given) {
  const outline = { sections: given.example.sections, tables: given.example.tables.map((header) => ({ header, rows: 1 })), labels: given.example.labels };
  return { checks: given.steps.map((st) => {
    const how = {};
    const m = checkNamedBy(st.text, outline, how);
    const quote = st.text.slice(0, 60);
    if (!m) return { id: st.id, how: "judgement", measure: null, source: null, quote, means: "yours to judge" };
    return { id: st.id, how: "measure", measure: specOf(m), source: null, quote, means: specOf(m), ...how.related ? { near: true } : {} };
  }) };
}
export {
  FORBIDS_OR_CONDITIONS,
  citesPlaces,
  isConditional,
  lowered,
  namesTest,
  norm,
  optionsOf,
  sectionLength,
  sectionsMentioned,
  sectionsNamed,
  sectionsOpening,
  sectionsOutright,
  sectionsPlaced,
  standInChecks,
  statedCount,
  tableColumns
};
