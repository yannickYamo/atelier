// A plain-language explainer: twelve examples that all keep the six habits in check.mjs.
export const purpose = 'plain-language explanations for a reader with no background';
export const tasks = ['how a battery stores energy', 'what a stock index is', 'how noise-cancelling headphones work', 'what machine learning is', 'why antibiotics do not work on a cold',
  'how a heat pump warms a house', 'what a blockchain is', 'how GPS finds your position', 'what an insurance deductible is', 'why the sky is blue']
  .map((t, i) => ({ id: `t${i}`, request: `Explain ${t} to someone with no background in it.` }));
// What an owner would write on one page. The "rules" arm gets this and the examples; no other arm sees it.
export const rules = `Rules for these explanations:
1. Between 150 and 230 words.
2. Give exactly one everyday analogy, introduced with "Think of", "Imagine", "Picture" or "It works like". Use none of those phrases anywhere else.
3. Plain paragraphs only: no headings, lists or bold.
4. The last paragraph is one short paragraph that starts with "In short,".
5. No sentence is longer than 25 words.
6. Speak to the reader as "you".`;
