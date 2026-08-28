// atelier/renderers/ratify-page/render.ts — RATIFICATION AS SOMETHING A PERSON CAN ACTUALLY READ.
//
// ─── WHY A CLI TOOL EMITS HTML ─────────────────────────────────────────────────────────────────
//
// Ratification is the one step in this system that a machine may not do, and for a while it was the
// worst-served: twenty proposals scrolled past in a terminal, each needing a five-way judgment, with
// the evidence for each one somewhere further up the buffer. The batch command accepts every
// decision at once precisely so a person is not answering twelve prompts in a row — but that made
// the READING harder, not easier, because nothing held the proposal and its evidence together where
// the eye could compare them.
//
// So the same decisions get a page. Every proposal carries the quotation it was derived from and the
// file it came from, the choices are buttons rather than remembered spelling, and progress is
// visible. Nothing is sent anywhere: the page writes to the browser's own storage and hands back the
// exact JSON `atelier ratify --decisions` already accepts.
//
// ─── THE ROUND TRIP IS THE CONTRACT ────────────────────────────────────────────────────────────
//
// The page's output is not a convenient format that a human then adapts. It is the command's input,
// character for character, and a test asserts that what this file emits parses as a complete set of
// decisions. A page that produced something "close enough" would put a transcription step between
// the expert's judgment and the standard — which is the one place in this system that must not have
// one.

import type { Requirement } from '../../core/state/canonical-state.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The five materialities plus the refusal, in the order a person weighs them. */
const CHOICES: readonly { readonly v: string; readonly label: string; readonly why: string }[] = [
  { v: 'REQUIRED', label: 'Required', why: 'An obligation. The skill must do this.' },
  { v: 'PREFERRED', label: 'Preferred', why: 'Characteristic of you but not obligatory — compiled as something shown rather than commanded.' },
  { v: 'EXEMPLAR_ONLY', label: 'Exemplar only', why: 'Worth showing as an instance of how you work; never issued as an instruction.' },
  { v: 'TOLERATED', label: 'Tolerated', why: 'Appears in your work and must not be manufactured. An obligation pointing the other way.' },
  { v: 'INCIDENTAL', label: 'Incidental', why: 'Real, but it should not reach the model at all.' },
  { v: 'REJECT', label: 'Not mine', why: 'The machine guessed wrong. It is dropped, not softened.' },
];

export interface RatifyPageMeta {
  readonly corpusHash: string;
  readonly workType: string;
  readonly itemCount: number;
  /** stated on the page when discovery could not check its proposals against unread work */
  readonly heldOutChecked: boolean;
}

export function renderRatifyPage(
  proposals: readonly Requirement[], meta: RatifyPageMeta,
): string {
  const n = proposals.length;
  const generalCount = proposals.filter((p) => isGeneralScope(p.appliesWhen)).length;

  const cards = proposals.map((p) => {
    const gen = isGeneralScope(p.appliesWhen);
    const when = gen ? '' : `<p class="when"><span class="lab">applies when</span> ${esc(p.appliesWhen)}</p>`;
    const absent = p.wouldBeAbsentIf
      ? `<p class="absent"><span class="lab">would be absent if</span> ${esc(p.wouldBeAbsentIf)}</p>` : '';
    const ev = p.evidence
      ? `<blockquote class="evidence">${esc(p.evidence)}<cite>${esc(p.evidenceItemId ?? 'your work')}</cite></blockquote>` : '';
    const buttons = CHOICES.map((c) =>
      `<button type="button" data-r="${esc(p.requirementId)}" data-v="${c.v}"${c.v === 'REJECT' ? ' class="reject"' : ''}>${c.label}</button>`).join('');
    return `<article class="rule" id="card-${esc(p.requirementId)}">
  <header class="rule-head"><span class="rid">${esc(p.requirementId)}</span>
    <span class="badge">${esc(p.kind)}</span>${gen ? '<span class="badge scope" title="Always applies — no condition has to be judged.">GENERAL SCOPE</span>' : ''}
    <span class="verdict" data-verdict-for="${esc(p.requirementId)}"></span></header>
  <p class="statement">${esc(p.statement)}</p>
  ${when}${ev}${absent}
  <div class="choices" role="group" aria-label="Materiality for ${esc(p.requirementId)}">${buttons}</div>
</article>`;
  }).join('\n');

  const key = CHOICES.map((c) => `<dt>${c.label}</dt><dd>${c.why}</dd>`).join('');

  const caveat = meta.heldOutChecked ? '' : `
  <p class="caveat"><strong>Read these as proposals, not findings.</strong> This run could not check its
  proposals against work the proposer had not read, so it fell back to a single pass. Nothing below has
  been tested against unseen work.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your standard, unratified</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--ground:#f5f6f8;--surface:#fff;--sunk:#edeff3;--ink:#12151c;--muted:#59616f;--faint:#8791a0;
--rule:#dcdfe6;--rule-firm:#c2c7d2;--accent:#2f4a8f;--accent-soft:#e6eaf5;--required:#2f4a8f;
--preferred:#0d6f5f;--exemplar:#6a4396;--tolerated:#8a5a0c;--incidental:#6b7280;--reject:#9a382b}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0e1116;--surface:#161a21;
--sunk:#1c212a;--ink:#e7eaef;--muted:#98a1af;--faint:#6d7683;--rule:#262c36;--rule-firm:#3a424f;
--accent:#8ea6de;--accent-soft:#1b2438;--required:#8ea6de;--preferred:#4bb39c;--exemplar:#b18ddd;
--tolerated:#d6a04c;--incidental:#98a1af;--reject:#df8574}}
:root[data-theme="dark"]{--ground:#0e1116;--surface:#161a21;--sunk:#1c212a;--ink:#e7eaef;--muted:#98a1af;
--faint:#6d7683;--rule:#262c36;--rule-firm:#3a424f;--accent:#8ea6de;--accent-soft:#1b2438;
--required:#8ea6de;--preferred:#4bb39c;--exemplar:#b18ddd;--tolerated:#d6a04c;--incidental:#98a1af;--reject:#df8574}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);margin:0;padding:0 1.1rem 7rem;
font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:16px;line-height:1.6}
.wrap{max-width:47rem;margin:0 auto}
header.top{padding:3.2rem 0 1.5rem}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:var(--faint);margin:0 0 1rem}
h1{font-family:Newsreader,Georgia,serif;font-weight:500;font-size:clamp(2rem,5vw,2.85rem);line-height:1.09;letter-spacing:-.018em;margin:0 0 .9rem;text-wrap:balance}
.standfirst{font-family:Newsreader,Georgia,serif;font-size:1.13rem;line-height:1.5;color:var(--muted);max-width:34rem;margin:0 0 1.2rem}
.caveat{background:var(--surface);border:1px solid var(--rule-firm);border-left:3px solid var(--tolerated);border-radius:2px;padding:1rem 1.15rem;font-size:.92rem;color:var(--muted);margin:0}
.caveat strong{color:var(--ink);font-weight:600}
.bar{position:sticky;top:0;z-index:20;background:var(--ground);border-bottom:1px solid var(--rule-firm);padding:.7rem 0;margin-bottom:1.5rem}
.bar-in{max-width:47rem;margin:0 auto;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.prog{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.prog b{color:var(--ink);font-weight:500}
.track{flex:1;min-width:7rem;height:5px;background:var(--sunk);border-radius:3px;overflow:hidden}
.fill{height:100%;width:0;background:var(--accent);transition:width .2s ease}
@media(prefers-reduced-motion:reduce){.fill{transition:none}}
button.copy{font-family:inherit;font-size:.82rem;font-weight:500;background:var(--accent);color:var(--surface);border:none;border-radius:3px;padding:.44rem .85rem;cursor:pointer}
button.copy:disabled{background:var(--sunk);color:var(--faint);cursor:not-allowed}
.key{background:var(--surface);border:1px solid var(--rule);border-radius:2px;padding:1.1rem 1.25rem;margin:0 0 1.7rem;font-size:.9rem}
.key h2{font-family:Newsreader,Georgia,serif;font-size:1.16rem;font-weight:600;margin:0 0 .7rem}
.key dl{display:grid;grid-template-columns:auto 1fr;gap:.4rem .9rem;margin:0}
.key dt{font-family:"IBM Plex Mono",monospace;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;padding-top:.16rem;white-space:nowrap}
.key dd{margin:0;color:var(--muted)}
@media(max-width:30rem){.key dl{grid-template-columns:1fr;gap:.15rem}.key dd{margin-bottom:.5rem}}
.rule{background:var(--surface);border:1px solid var(--rule);border-left:3px solid var(--rule-firm);border-radius:2px;padding:1.2rem 1.3rem 1.05rem;margin-bottom:1rem}
.rule[data-marked]{border-left-color:var(--mark)}
.rule-head{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.7rem}
.rid{font-family:"IBM Plex Mono",monospace;font-size:.78rem;color:var(--faint);font-weight:500}
.badge{font-family:"IBM Plex Mono",monospace;font-size:.63rem;letter-spacing:.09em;text-transform:uppercase;padding:.16rem .42rem;border-radius:2px;background:var(--sunk);color:var(--muted)}
.badge.scope{background:var(--accent-soft);color:var(--accent);cursor:help}
.verdict{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;font-weight:500;color:var(--mark)}
.statement{font-family:Newsreader,Georgia,serif;font-size:1.15rem;line-height:1.44;margin:0 0 .7rem}
.lab{font-family:"IBM Plex Mono",monospace;font-size:.64rem;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);margin-right:.4rem}
.when,.absent{font-size:.89rem;color:var(--muted);margin:0 0 .55rem}
.evidence{margin:.7rem 0 .6rem;padding:.65rem .9rem;background:var(--sunk);border-radius:2px;font-family:Newsreader,Georgia,serif;font-style:italic;font-size:.96rem;line-height:1.5}
.evidence cite{display:block;font-family:"IBM Plex Mono",monospace;font-style:normal;font-size:.66rem;color:var(--faint);margin-top:.45rem;word-break:break-word}
.choices{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.85rem;padding-top:.8rem;border-top:1px solid var(--rule)}
.choices button{font-family:inherit;font-size:.8rem;background:transparent;color:var(--muted);border:1px solid var(--rule-firm);border-radius:2px;padding:.32rem .6rem;cursor:pointer}
.choices button:hover{border-color:var(--ink);color:var(--ink)}
.choices button[aria-pressed="true"]{background:var(--c);border-color:var(--c);color:var(--surface);font-weight:500}
.choices button[data-v="REQUIRED"]{--c:var(--required)}.choices button[data-v="PREFERRED"]{--c:var(--preferred)}
.choices button[data-v="EXEMPLAR_ONLY"]{--c:var(--exemplar)}.choices button[data-v="TOLERATED"]{--c:var(--tolerated)}
.choices button[data-v="INCIDENTAL"]{--c:var(--incidental)}.choices button[data-v="REJECT"]{--c:var(--reject)}
.choices button.reject{margin-left:auto}
.out{width:100%;min-height:7rem;margin-top:.8rem;font-family:"IBM Plex Mono",monospace;font-size:.72rem;background:var(--sunk);color:var(--ink);border:1px solid var(--rule);border-radius:2px;padding:.7rem;display:none}
footer.end{max-width:47rem;margin:2.8rem auto 0;padding-top:1.3rem;border-top:1px solid var(--rule-firm);font-family:"IBM Plex Mono",monospace;font-size:.72rem;color:var(--faint);line-height:1.7}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style></head><body>
<header class="top wrap">
  <p class="eyebrow">Ratification &middot; ${n} proposals &middot; corpus ${esc(meta.corpusHash)}</p>
  <h1>Your standard, unratified</h1>
  <p class="standfirst">Atelier read ${meta.itemCount} pieces of your ${esc(meta.workType)} and proposes these ${n} rules as things you do. None of them binds anything until you say so.</p>${caveat}
</header>
<div class="bar"><div class="bar-in">
  <span class="prog"><b id="done">0</b> of ${n} ruled</span>
  <span class="track"><span class="fill" id="fill"></span></span>
  <button type="button" class="copy" id="copy" disabled>Copy rulings</button>
</div></div>
<div class="wrap">
  <section class="key"><h2>What each ruling does</h2><dl>${key}</dl>${generalCount
    ? `<p style="margin:.9rem 0 0;color:var(--muted)">${generalCount} rule${generalCount === 1 ? ' is' : 's are'} marked <span class="badge scope">GENERAL SCOPE</span> — they always apply, so nothing has to judge whether a condition holds. Rule on them as you would any other.</p>`
    : ''}</section>
${cards}
  <textarea class="out" id="out" readonly aria-label="Your rulings as JSON"></textarea>
</div>
<footer class="end wrap">
  ${meta.itemCount} item(s), work type "${esc(meta.workType)}", corpus ${esc(meta.corpusHash)}<br>
  Marks are saved in this browser only. Nothing is sent anywhere — use Copy rulings, then:<br>
  atelier ratify --decisions '&lt;paste&gt;'
</footer>
<script>
var KEY='atelier-ratify-${esc(meta.corpusHash)}',TOTAL=${n};
var COLOR={REQUIRED:'var(--required)',PREFERRED:'var(--preferred)',EXEMPLAR_ONLY:'var(--exemplar)',TOLERATED:'var(--tolerated)',INCIDENTAL:'var(--incidental)',REJECT:'var(--reject)'};
var LABEL={REQUIRED:'Required',PREFERRED:'Preferred',EXEMPLAR_ONLY:'Exemplar only',TOLERATED:'Tolerated',INCIDENTAL:'Incidental',REJECT:'Not mine'};
var marks={};
try{marks=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){marks={}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(marks))}catch(e){}}
function paint(id){var c=document.getElementById('card-'+id);if(!c)return;var v=marks[id];
 c.querySelectorAll('.choices button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.v===v))});
 var badge=c.querySelector('[data-verdict-for="'+id+'"]');
 if(v){c.setAttribute('data-marked','');c.style.setProperty('--mark',COLOR[v]);badge.textContent=LABEL[v]}
 else{c.removeAttribute('data-marked');c.style.removeProperty('--mark');badge.textContent=''}}
function refresh(){var n=Object.keys(marks).length;document.getElementById('done').textContent=String(n);
 document.getElementById('fill').style.width=(n/TOTAL*100)+'%';var b=document.getElementById('copy');
 b.disabled=n===0;b.textContent=n===TOTAL?'Copy rulings':'Copy '+n+' so far'}
document.addEventListener('click',function(e){
 var b=e.target.closest('.choices button');
 if(b){var id=b.dataset.r;if(marks[id]===b.dataset.v){delete marks[id]}else{marks[id]=b.dataset.v}
  persist();paint(id);refresh();return}
 if(e.target.id==='copy'){
  var ids=Object.keys(marks).sort(function(a,c){return String(a).localeCompare(String(c),undefined,{numeric:true})});
  var text='['+String.fromCharCode(10)+ids.map(function(id){
    return '  {"id":"'+id+'","decision":'+(marks[id]==='REJECT'?'"REJECT"':'"APPROVE","materiality":"'+marks[id]+'"')+'}'
  }).join(','+String.fromCharCode(10))+String.fromCharCode(10)+']';
  var o=document.getElementById('out');o.style.display='block';o.value=text;o.select();
  if(navigator.clipboard){navigator.clipboard.writeText(text).then(function(){e.target.textContent='Copied';setTimeout(refresh,1400)},function(){})}}});
Object.keys(marks).forEach(paint);refresh();
</script></body></html>
`;
}
