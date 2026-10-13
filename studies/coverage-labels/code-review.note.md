# How I write a pull request review

1. Start with a single line naming the pull request by number and title, exactly as the author titled it.
2. Put the Verdict section first, before anything else, so nobody has to scroll to find out whether they can merge.
3. The Verdict is one of: Approve, Request changes, Comment. Write that word in bold and nothing softer.
4. Follow the verdict word with one sentence giving the reason, and keep that sentence under 30 words.
5. Second section is Summary: say what the change does in my own words, not the author's description pasted back.
6. Keep the Summary to one paragraph of at most 4 sentences and make sure it says what changed and why.
7. Read the whole diff twice before writing a word; the first pass is for understanding, the second for faults.
8. After Summary the order is Blocking Issues, Non-Blocking Suggestions, Questions, Test Coverage, What Works, and Next Steps last. Never reorder them.
9. Weigh risk before style: a data-loss bug outranks any number of naming complaints.
10. Number the blocking issues and limit them to five; if there are more than five the PR needs splitting and I say that instead.
11. Each blocking issue cites the file path with a line number, in backticks, like `src/billing/retry.py:142`.
12. Quote the offending code exactly as it stands in the diff, never paraphrased, in inline code or a fenced block.
13. For every blocking issue say what breaks, for whom, and under what input; a reviewer who can't name the failure hasn't found one.
14. Offer a concrete fix for each blocking issue, in a sentence beginning "Suggest:".
15. Non-Blocking Suggestions is a bulleted list of at most 6 bullets, each a single sentence.
16. Prefix every non-blocking bullet with "Nit:" or "Consider:" so the author knows how hard I'm pushing.
17. Never write "just", "simply", "obviously" or "clearly"; what's obvious to me wasn't to the author.
18. Don't say "you" when describing a fault; talk about the code ("this loop", "the handler"), not the person.
19. Questions holds real questions only, things I don't know the answer to, each ending with a question mark, and no more than 3 of them.
20. If there are no questions, keep the heading and write "None." under it. Same for an empty Blocking Issues.
21. Test Coverage is a table with the columns Scenario, Covered and Where.
22. The Covered column takes only Yes, No or Partial.
23. Put between 3 and 6 rows in the Test Coverage table, and choose the scenarios that would hurt most in production, not the easy ones.
24. In the Where column name the test file and test function exactly, or write "n/a" when Covered is No.
25. What Works is short: 2 or 3 bullets naming specific good decisions, never general praise like "nice work".
26. Refer to the author and other reviewers by handle with an @, spelled as it appears on the PR, and only in What Works or Next Steps.
27. Next Steps is a numbered list of at most 4 actions, each starting with a verb, ordered by what the author should do first.
28. The final line of the review says whether I want another look: either "Re-review needed: yes" or "Re-review needed: no".
29. The whole review stays under 500 words; if it's running long I'm reviewing style instead of substance.
30. Any figure I quote, a timeout, a retry count, a benchmark number, must match the diff or the PR description to the digit.
31. Check the change against what the linked ticket asked for, and name the ticket by its ID in the Summary.
32. Don't ask for a refactor the PR didn't set out to do; if it's worth doing, say it's a follow-up.
33. Distinguish what I verified by running it from what I only read, and use the phrase "I ran" only when I did.
34. One issue per numbered item; don't bundle two faults because they sit in the same file.
35. Bold a short name for each blocking issue at the start of its item, 6 words at most.
36. No headings below `##`; if I need a third level, the review is too tangled.
37. Assume the author had a reason: when a choice looks odd, ask in Questions before condemning it in Blocking Issues.
38. Keep every sentence under 30 words.
39. Use backticks for every identifier, function, file and flag name, spelled as in the code.
40. Before posting, reread the verdict against the issues list: Approve with open blocking issues is a contradiction, and Request changes with none is a mood.
