# studies/harness/override-key-and-page.py — blind key + labeling page for the override endpoint.
# Embeds generation text into the page WITHOUT printing any of it (builder blinding).
import hashlib, html, json, os, re, sys

HOME = os.path.expanduser('~')
OUT = os.path.join(HOME, 'atelier-b2-study', 'override')
TRIALS = os.path.join(OUT, 'trials')
STD = 'f8a183c087e91e6c'
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()

ids = (['E%02d' % i for i in range(1, 21)] + ['J%02d' % i for i in range(1, 21)]
       + ['K%02d' % i for i in range(1, 7)] + ['X%02d' % i for i in range(1, 6)])
def arm_pair(tid):
    k = tid[0]
    return ('T', 'B2') if k in 'EJ' else ('T', 'B0') if k == 'K' else ('T', 'T')

read = lambda tid, arm: open(os.path.join(TRIALS, f'{tid}.{arm}.md')).read()

key = {'standard': STD, 'rule': 'side A holds T iff first hex of sha256("<taskId>|override|<standard>") is 0-7', 'trials': []}
pairs = {}
for tid in ids:
    a1, a2 = arm_pair(tid)
    t_on_a = sha(f'{tid}|override|{STD}')[0] in '01234567'
    sideA, sideB = (a1, a2) if t_on_a else (a2, a1)
    ta, tb = read(tid, sideA), read(tid, sideB)
    key['trials'].append({'taskId': tid, 'kind': 'identical' if tid[0] == 'X' else 'known-bad' if tid[0] == 'K' else 'primary',
                          'sideA': sideA, 'sideB': sideB, 'shaA': sha(ta), 'shaB': sha(tb)})
    pairs[tid] = (ta, tb)

kpath = os.path.join(OUT, 'OVERRIDE_BLIND_KEY.json')
open(kpath, 'w').write(json.dumps(key, indent=1))
keysha = hashlib.sha256(open(kpath, 'rb').read()).hexdigest()

order = sorted(ids, key=lambda i: sha(i + '|order'))

def render(t):
    paras = [p.strip() for p in re.split(r'\n\s*\n', t) if p.strip()]
    return ''.join('<p>' + html.escape(p).replace('\n', '<br>') + '</p>' for p in paras)

cards = []
for n, tid in enumerate(order, 1):
    ta, tb = pairs[tid]
    cards.append(f'''<article class="trial" id="tr-{tid}">
<header><span class="tid">Trial {n} of {len(order)}</span><span class="verdict" data-vf="{tid}"></span></header>
<div class="pair"><section class="side"><h3>A</h3>{render(ta)}</section>
<section class="side"><h3>B</h3>{render(tb)}</section></div>
<p class="q">Which of these better represents how this task should be done according to your standard?</p>
<div class="pick"><button data-t="{tid}" data-v="a">A</button><button data-t="{tid}" data-v="b">B</button><button data-t="{tid}" data-v="same">no material difference</button></div>
<input class="note" data-n="{tid}" maxlength="200" placeholder="optional: in one line, what decided it?">
</article>''')

page = '''<title>Your standard, blind</title>
<style>
:root{--ground:#f5f6f8;--surface:#fff;--sunk:#eef0f4;--ink:#13161d;--muted:#5a6270;--faint:#8a94a3;--rule:#dcdfe6;--accent:#2f4a8f}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0e1116;--surface:#161a21;--sunk:#1d222b;--ink:#e7eaef;--muted:#98a1af;--faint:#6d7683;--rule:#262c36;--accent:#8ea6de}}
:root[data-theme="dark"]{--ground:#0e1116;--surface:#161a21;--sunk:#1d222b;--ink:#e7eaef;--muted:#98a1af;--faint:#6d7683;--rule:#262c36;--accent:#8ea6de}
*{box-sizing:border-box}body{background:var(--ground);color:var(--ink);margin:0;padding:0 1rem 6rem;font-family:system-ui,sans-serif;font-size:15.5px;line-height:1.55}
.wrap{max-width:62rem;margin:0 auto}h1{font-size:1.6rem;margin:2.2rem 0 .4rem}
.intro{color:var(--muted);max-width:44rem;margin:0 0 1.4rem}
.bar{position:sticky;top:0;z-index:9;background:var(--ground);border-bottom:1px solid var(--rule);padding:.6rem 0;margin-bottom:1.2rem;display:flex;gap:1rem;align-items:center}
.prog{font-variant-numeric:tabular-nums;font-size:.85rem;color:var(--muted)}.prog b{color:var(--ink)}
button.copy{background:var(--accent);color:var(--surface);border:none;border-radius:3px;padding:.45rem .9rem;font-size:.85rem;cursor:pointer}
button.copy:disabled{background:var(--sunk);color:var(--faint)}
.trial{background:var(--surface);border:1px solid var(--rule);border-radius:3px;padding:1.1rem 1.2rem;margin-bottom:1.2rem}
.trial header{display:flex;justify-content:space-between;margin-bottom:.6rem}
.tid{font-size:.8rem;color:var(--faint)}.verdict{font-size:.8rem;color:var(--accent);text-transform:uppercase}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}
@media(max-width:50rem){.pair{grid-template-columns:1fr}}
.side{background:var(--sunk);border-radius:3px;padding:.2rem 1rem .6rem;font-size:.92rem;overflow-x:auto}
.side h3{font-size:.85rem;color:var(--muted);letter-spacing:.1em}
.q{font-weight:600;margin:.9rem 0 .4rem}
.pick{display:flex;gap:.5rem;flex-wrap:wrap}
.pick button{background:transparent;border:1px solid var(--rule);border-radius:3px;color:var(--muted);padding:.4rem .8rem;cursor:pointer;font-size:.85rem}
.pick button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.note{width:100%;margin-top:.6rem;background:var(--sunk);border:1px solid var(--rule);border-radius:3px;color:var(--ink);padding:.45rem .6rem;font-size:.85rem}
.recog{background:var(--surface);border:1px solid var(--rule);border-radius:3px;padding:1rem 1.2rem}
textarea.outbox{width:100%;min-height:6rem;margin-top:.8rem;background:var(--sunk);color:var(--ink);border:1px solid var(--rule);font-size:.72rem;font-family:monospace;display:none}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
<div class="wrap"><h1>Your standard, blind</h1>
<p class="intro">__N__ pairs. For each: read A and B, then answer the one question. There is no right answer except your own judgement; "no material difference" is a real option, not a failure. Your marks save in this browser, so you can stop and come back. When every trial is answered, the final box appears — then press Copy and send the block back.</p>
<div class="bar"><span class="prog"><b id="done">0</b> / __N__ answered</span><button class="copy" id="copy" disabled>Copy answers</button></div>
__CARDS__
<section class="recog" id="recog" hidden><p><b>Last question.</b> Did you recognise any passage as something you have read or written before? If yes, say which trial numbers; if none, leave blank.</p>
<input class="note" id="recognized" placeholder="e.g. trial 3 — or leave blank"></section>
<textarea class="outbox" id="out" readonly></textarea></div>
<script>
var KEY='override-__STD__',N=__N__,marks={},notes={},recog='';
try{var s=JSON.parse(localStorage.getItem(KEY)||'{}');marks=s.marks||{};notes=s.notes||{};recog=s.recog||''}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify({marks:marks,notes:notes,recog:recog}))}catch(e){}}
function paint(t){document.querySelectorAll('[data-t="'+t+'"]').forEach(function(b){b.setAttribute('aria-pressed',String(marks[t]===b.dataset.v))});
 var v=document.querySelector('[data-vf="'+t+'"]');if(v)v.textContent=marks[t]||''}
function refresh(){var n=Object.keys(marks).length;document.getElementById('done').textContent=n;
 document.getElementById('copy').disabled=n<N;document.getElementById('recog').hidden=n<N}
document.addEventListener('click',function(e){var b=e.target.closest('.pick button');
 if(b){marks[b.dataset.t]=b.dataset.v;save();paint(b.dataset.t);refresh();return}
 if(e.target.id==='copy'){var o=document.getElementById('out');
  var nn={};Object.keys(notes).forEach(function(k){if((notes[k]||'').trim())nn[k]=notes[k].trim()});
  o.value=JSON.stringify({labels:marks,notes:nn,recognized:recog.trim()},null,1);
  o.style.display='block';o.select();if(navigator.clipboard)navigator.clipboard.writeText(o.value)}});
document.addEventListener('input',function(e){if(e.target.id==='recognized'){recog=e.target.value;save();return}
 var i=e.target.closest('[data-n]');if(i){notes[i.dataset.n]=i.value;save()}});
Object.keys(notes).forEach(function(k){var i=document.querySelector('[data-n="'+k+'"]');if(i)i.value=notes[k]});
var r=document.getElementById('recognized');if(r)r.value=recog;
Object.keys(marks).forEach(paint);refresh();
</script>'''
page = page.replace('__CARDS__', '\n'.join(cards)).replace('__N__', str(len(order))).replace('__STD__', STD)
ppath = os.path.join(OUT, 'labeling.html')
open(ppath, 'w').write(page)
print('key sha256:', keysha)
print('page bytes:', os.path.getsize(ppath), '-> ', ppath)
print('order:', ' '.join(order))
