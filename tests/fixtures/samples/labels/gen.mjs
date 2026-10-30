// A brand-suitability labelling domain, made in code: a transcript stands in for a clip, nothing here is a real
// platform, clip or policy. Twelve labelled clips as examples (JSON labels with their transcript as material), twelve
// transcripts as tasks, the taxonomy and the policy, a checker written before any output existed, and label sets
// with planted errors. Usage: node gen-labels.mjs <out dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2]; if (!out) throw new Error('usage: node gen-labels.mjs <out dir>');
const GROUPS = { Violence: ['minor', 'graphic'], Firearms: ['depiction', 'use'], Language: ['mild', 'strong'], Alcohol: ['reference', 'consumption'], Drugs: ['reference', 'use'], Nudity: ['partial', 'full'], Hate: ['slur', 'incitement'], Gambling: ['reference', 'play'], 'Dangerous acts': ['stunt', 'self-harm'], Disaster: ['news', 'graphic'],
  Politics: ['discussion', 'advocacy'], Religion: ['discussion', 'mockery'], Death: ['reference', 'depiction'], Crime: ['reference', 'depiction'], Terrorism: ['reference', 'depiction'], Weapons: ['reference', 'depiction'], Sexual: ['innuendo', 'explicit'], Medical: ['procedure', 'graphic'], Animals: ['distress', 'cruelty'], Floor: ['all brands'] };
const TAXONOMY = Object.entries(GROUPS).flatMap(([g, ks]) => ks.map((k) => `${g} – ${k}`));
const RISK = ['Floor', 'Low', 'Medium', 'High'];
const POLICY = `BRAND SUITABILITY POLICY, EXTRACT

1. Every category in a label is one of the ${TAXONOMY.length} categories of the taxonomy, written exactly as the taxonomy writes it.
2. Every flagged category carries a timecode span, start–end in mm:ss, inside the clip's duration.
3. Every flagged category carries a risk level: Low, Medium or High.
4. "High" risk requires an explicit depiction in the clip: a described act, injury, blood, a weapon fired, an explicit sexual act. A reference, a mention or a discussion is Medium at most.
5. A clip labelled "Firearms – depiction" or "Firearms – use" is never also labelled "Floor – all brands".
6. A clip with no flagged category is labelled "Floor – all brands" with risk Floor and no timecode.
7. Every flagged category carries evidence: the words of the transcript, copied, that support it.
8. "Violence – graphic" requires described injury or blood; a scuffle, a push or a threat is "Violence – minor".
9. "Language – strong" requires a word of the strong list in the transcript; "Language – mild" otherwise.
10. A label carries no category the transcript does not support with evidence.
11. Risk is the highest of the flagged categories' risk levels, carried once at the top of the label as overall.
12. A span's end is after its start, and no span runs past the duration.
13. Where the same act is both "Violence" and "Dangerous acts", both are flagged, each with its own evidence.
14. A news report of a disaster is "Disaster – news", Medium at most; graphic footage described is "Disaster – graphic".
15. A reference to alcohol in passing is "Alcohol – reference", Low; drinking described is "Alcohol – consumption", Medium.
16. Numbers in a span are seconds and minutes only: no frame counts.
17. Evidence is copied from the transcript, never paraphrased.
18. A category flagged twice is listed once, with the earliest span.
19. The label is JSON with the keys clip, duration, overall, categories; nothing else.
20. Where a clip's transcript is empty, the label is "Floor – all brands" and says so in evidence.
`;
const CLIPS = [
  { id: 'c01', duration: 48, transcript: '[00:02] Host: We are on Market Street asking people about rents. [00:14] Passer-by: Rents are up a third since last year. [00:31] A second man shoves the first; both fall against the railing; a bystander pulls them apart. [00:40] Host: We will leave it there.', labels: [{ category: 'Violence – minor', risk: 'Medium', span: '00:31–00:39', evidence: 'A second man shoves the first; both fall against the railing' }] },
  { id: 'c02', duration: 60, transcript: '[00:05] Narrator: The town centre after the flood. [00:20] Narrator: Water reached the second floor of the library. [00:45] Mayor: We have asked for help and it is coming.', labels: [{ category: 'Disaster – news', risk: 'Medium', span: '00:05–00:45', evidence: 'The town centre after the flood' }] },
  { id: 'c03', duration: 30, transcript: '[00:03] Chef: Tonight we are making risotto. [00:18] Chef: A splash of white wine goes in now; the alcohol cooks off. [00:27] Chef: Stir and wait.', labels: [{ category: 'Alcohol – reference', risk: 'Low', span: '00:18–00:22', evidence: 'A splash of white wine goes in now' }] },
  { id: 'c04', duration: 90, transcript: '[00:10] Officer at the range: Safety on, then off. [00:25] Three shots are fired at the paper target. [01:10] Officer: Clear the chamber. [01:25] End of lesson.', labels: [{ category: 'Firearms – use', risk: 'High', span: '00:25–00:30', evidence: 'Three shots are fired at the paper target' }] },
  { id: 'c05', duration: 40, transcript: '[00:04] Teacher: Today, fractions. [00:20] Student: Is a half bigger than a third? [00:30] Teacher: Yes, and here is why.', labels: [] },
  { id: 'c06', duration: 75, transcript: '[00:08] Comedian: My landlord is a damn genius, he charges for air. [00:30] Crowd laughs. [00:50] Comedian: Anyway, drink up, I know I will. [01:05] He drinks from a bottle on stage.', labels: [{ category: 'Language – mild', risk: 'Low', span: '00:08–00:12', evidence: 'My landlord is a damn genius' }, { category: 'Alcohol – consumption', risk: 'Medium', span: '01:05–01:10', evidence: 'He drinks from a bottle on stage' }] },
  { id: 'c07', duration: 55, transcript: '[00:06] Reporter: Police say the shop was robbed at knifepoint on Tuesday. [00:30] Shop owner: He showed the knife and asked for the till. [00:48] Reporter: No one was hurt.', labels: [{ category: 'Crime – reference', risk: 'Medium', span: '00:06–00:48', evidence: 'the shop was robbed at knifepoint on Tuesday' }, { category: 'Weapons – reference', risk: 'Medium', span: '00:30–00:36', evidence: 'He showed the knife and asked for the till' }] },
  { id: 'c08', duration: 65, transcript: '[00:05] Rider: Do not try this at home. [00:20] The rider jumps the bike across the canal; the back wheel clips the edge and he lands hard on the path. [00:50] Rider, bleeding from the elbow: Worth it.', labels: [{ category: 'Dangerous acts – stunt', risk: 'High', span: '00:20–00:52', evidence: 'The rider jumps the bike across the canal; the back wheel clips the edge and he lands hard' }, { category: 'Violence – graphic', risk: 'High', span: '00:50–00:52', evidence: 'bleeding from the elbow' }] },
  { id: 'c09', duration: 50, transcript: '[00:02] Panellist: The bill fails the people it claims to help. [00:25] Second panellist: Vote it down and write to your member. [00:44] Host: Thank you both.', labels: [{ category: 'Politics – advocacy', risk: 'Medium', span: '00:25–00:30', evidence: 'Vote it down and write to your member' }] },
  { id: 'c10', duration: 35, transcript: '[00:03] Vet: The dog came in with a broken leg after a fall. [00:15] Vet: We set it this morning. [00:28] The dog limps across the room, tail going.', labels: [{ category: 'Animals – distress', risk: 'Low', span: '00:03–00:08', evidence: 'The dog came in with a broken leg after a fall' }] },
  { id: 'c11', duration: 70, transcript: '[00:10] Gamer: Next card. [00:30] Gamer: All in on red. [00:40] Dealer: Red wins. [01:00] Gamer: That is rent paid.', labels: [{ category: 'Gambling – play', risk: 'Medium', span: '00:30–00:40', evidence: 'All in on red' }] },
  { id: 'c12', duration: 45, transcript: '', labels: [] },
  { id: 'c13', duration: 58, transcript: '[00:04] Guide: The old brewery, now a museum. [00:22] Guide: They brewed a dark ale here until 1960. [00:40] Guide: The copper is original.', labels: [{ category: 'Alcohol – reference', risk: 'Low', span: '00:22–00:26', evidence: 'They brewed a dark ale here until 1960' }] },
  { id: 'c14', duration: 80, transcript: '[00:05] Narrator: The surgeon opens the chest. [00:30] Narrator: Blood is suctioned as the graft is placed. [01:10] Narrator: Four hours later the patient is stable.', labels: [{ category: 'Medical – graphic', risk: 'High', span: '00:05–00:35', evidence: 'The surgeon opens the chest' }] },
  { id: 'c15', duration: 42, transcript: '[00:03] Coach: Keep your guard up. [00:20] The sparring partner lands a jab; the boy shakes it off and grins. [00:38] Coach: Good round.', labels: [{ category: 'Violence – minor', risk: 'Medium', span: '00:20–00:26', evidence: 'The sparring partner lands a jab' }] },
  { id: 'c16', duration: 66, transcript: '[00:06] Presenter: The church was built in 1450. [00:30] Presenter: Services are still held on Sundays. [00:55] Bells ring.', labels: [{ category: 'Religion – discussion', risk: 'Low', span: '00:06–00:35', evidence: 'Services are still held on Sundays' }] },
  { id: 'c17', duration: 52, transcript: '[00:05] Reporter: Two people died when the bridge gave way. [00:25] Reporter: Rescue teams worked through the night. [00:45] Reporter: The cause is not known.', labels: [{ category: 'Death – reference', risk: 'Medium', span: '00:05–00:10', evidence: 'Two people died when the bridge gave way' }, { category: 'Disaster – news', risk: 'Medium', span: '00:05–00:45', evidence: 'Rescue teams worked through the night' }] },
  { id: 'c18', duration: 38, transcript: '[00:02] Host: Unboxing the new drone. [00:15] Host: Four rotors, a camera, a twenty minute battery. [00:33] Host: Flight test next week.', labels: [] },
  { id: 'c19', duration: 61, transcript: '[00:04] Officer: We recovered a pistol from the car. [00:20] The officer holds up the evidence bag with the pistol inside. [00:50] Officer: No shots were fired.', labels: [{ category: 'Firearms – depiction', risk: 'Medium', span: '00:20–00:24', evidence: 'The officer holds up the evidence bag with the pistol inside' }] },
  { id: 'c20', duration: 47, transcript: '[00:03] Streamer: I lost the whole paycheque on slots last night. [00:20] Streamer: Never again. [00:40] Streamer: Anyway, back to the game.', labels: [{ category: 'Gambling – reference', risk: 'Low', span: '00:03–00:08', evidence: 'I lost the whole paycheque on slots last night' }] },
  { id: 'c21', duration: 73, transcript: '[00:05] Narrator: Protesters and police met at the square. [00:30] A bottle is thrown; an officer is struck on the helmet and falls; colleagues drag him back. [01:00] Narrator: Six arrests were made.', labels: [{ category: 'Violence – minor', risk: 'Medium', span: '00:30–00:36', evidence: 'A bottle is thrown; an officer is struck on the helmet and falls' }, { category: 'Crime – depiction', risk: 'Medium', span: '00:30–00:36', evidence: 'A bottle is thrown' }] },
  { id: 'c22', duration: 44, transcript: '[00:02] Baker: Flour, water, salt, time. [00:20] Baker: Shape it like a damn pillow, gently. [00:38] Baker: Into the oven.', labels: [{ category: 'Language – mild', risk: 'Low', span: '00:20–00:24', evidence: 'Shape it like a damn pillow' }] },
  { id: 'c23', duration: 69, transcript: '[00:06] Narrator: The wildfire reached the ridge at dawn. [00:30] Narrator: Charred cars line the road; a resident weeps over what was her house. [01:00] Narrator: No deaths are reported.', labels: [{ category: 'Disaster – graphic', risk: 'High', span: '00:30–00:40', evidence: 'Charred cars line the road; a resident weeps over what was her house' }] },
  { id: 'c24', duration: 36, transcript: '[00:03] Trainer: Three sets of ten. [00:18] Trainer: Breathe out on the push. [00:30] Trainer: Done.', labels: [] },
];
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const label = (c) => {
  const cats = c.labels.length ? c.labels : [{ category: 'Floor – all brands', risk: 'Floor', span: null, evidence: c.transcript ? 'nothing in the transcript is flagged' : 'the transcript is empty' }];
  const overall = RISK[Math.max(...cats.map((x) => RISK.indexOf(x.risk)))];
  return JSON.stringify({ clip: c.id, duration: mmss(c.duration), overall, categories: cats }, null, 2);
};
mkdirSync(join(out, 'examples'), { recursive: true }); mkdirSync(join(out, 'tasks'), { recursive: true }); mkdirSync(join(out, 'defects'), { recursive: true });
writeFileSync(join(out, 'taxonomy.txt'), `TAXONOMY (${TAXONOMY.length} categories)\n${TAXONOMY.join('\n')}\n`);
writeFileSync(join(out, 'policy.txt'), POLICY);
CLIPS.forEach((c, i) => {
  if (i < 12) {
    const id = `e${String(i + 1).padStart(2, '0')}`;
    mkdirSync(join(out, 'examples', `${id}.material`), { recursive: true });
    writeFileSync(join(out, 'examples', `${id}.material`, 'transcript.txt'), `CLIP ${c.id}\nDuration: ${mmss(c.duration)}\nTranscript:\n${c.transcript}\n`);
    writeFileSync(join(out, 'examples', `${id}.material`, 'taxonomy.txt'), `TAXONOMY (${TAXONOMY.length} categories)\n${TAXONOMY.join('\n')}\n`);
    writeFileSync(join(out, 'examples', `${id}.material`, 'policy.txt'), POLICY);
    writeFileSync(join(out, 'examples', `${id}.md`), `---\nrequest: Label this clip for brand suitability under the policy, as JSON.\n---\n${label(c)}\n`);
  } else {
    const id = `t${i - 12}`;
    mkdirSync(join(out, 'tasks', id), { recursive: true });
    writeFileSync(join(out, 'tasks', id, 'transcript.txt'), `CLIP ${c.id}\nDuration: ${mmss(c.duration)}\nTranscript:\n${c.transcript}\n`);
    writeFileSync(join(out, 'tasks', id, 'taxonomy.txt'), `TAXONOMY (${TAXONOMY.length} categories)\n${TAXONOMY.join('\n')}\n`);
    writeFileSync(join(out, 'tasks', id, 'policy.txt'), POLICY);
  }
});
writeFileSync(join(out, 'cases.json'), JSON.stringify(CLIPS.map((c, i) => ({ ...c, id2: i < 12 ? `e${String(i + 1).padStart(2, '0')}` : `t${i - 12}` })), null, 1));
writeFileSync(join(out, 'method.md'), `${POLICY}`);
// planted errors on example 1: a category outside the taxonomy, a span past the duration, High without an explicit depiction, firearms with floor, evidence paraphrased
const e1 = JSON.parse(label(CLIPS[0]));
const w = (n, v) => writeFileSync(join(out, 'defects', n), `${JSON.stringify(v, null, 2)}\n`);
w('e01.taxonomy.json', { ...e1, categories: [{ ...e1.categories[0], category: 'Violence – scuffle' }] });
w('e01.span.json', { ...e1, categories: [{ ...e1.categories[0], span: '00:31–00:59' }] });
w('e01.high.json', { ...e1, overall: 'High', categories: [{ ...e1.categories[0], category: 'Violence – graphic', risk: 'High' }] });
w('e01.firearms-floor.json', { ...e1, categories: [...e1.categories, { category: 'Firearms – depiction', risk: 'Medium', span: '00:31–00:35', evidence: 'A second man shoves the first' }, { category: 'Floor – all brands', risk: 'Floor', span: null, evidence: 'x' }] });
w('e01.paraphrase.json', { ...e1, categories: [{ ...e1.categories[0], evidence: 'one man pushes another into a railing' }] });
console.log('labels domain written to', out, 'clips', CLIPS.length, 'taxonomy', TAXONOMY.length);
