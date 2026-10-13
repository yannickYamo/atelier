# Notes to myself on writing a technical post

1. The title is under 12 words and states the finding, not the topic: "We cut cold starts by 70% by deleting a cache", not "Thoughts on caching".
2. Under the title put a one-line dek in italics, a single sentence that tells a busy reader whether to keep going.
3. Open with the problem as someone actually hit it, in the first paragraph, with the real number that made it hurt.
4. No "In this post I will". Never open with a dictionary definition or with history.
5. The intro has no heading of its own; the first headed section after it is The Problem.
6. Sections go in this order: The Problem, What We Tried, What Worked, The Numbers, What I'd Do Differently, Takeaways. Takeaways is always last.
7. For a short-form post stay between 400 and 600 words, and cut before padding.
8. Paragraphs run 2 to 4 sentences. A one-sentence paragraph is allowed once per post, for the line I most want remembered.
9. What We Tried lists the dead ends as a numbered list, at least two of them, each with why it failed in a clause.
10. Be honest about the dead ends: include the one that makes me look slow.
11. Include exactly one code block, under What Worked, no longer than 15 lines, and it must be code that actually ran.
12. Give the code block a language tag and introduce it with a sentence ending in a colon.
13. The Numbers contains a table with the columns Metric, Before, After and Change.
14. Three to five rows in that table, and every figure carries its unit.
15. Every number in the prose must match the table to the digit; never round one and not the other.
16. State how the measurements were taken (tool, sample, period) in one sentence right below the table.
17. Don't claim more than the data shows; if it was one service over a couple of weeks, say so.
18. Never use "blazing", "game-changer", "seamless", "leverage" or "robust".
19. Write "I" for what I did and "we" for what the team did, and don't swap them carelessly.
20. Name tools, libraries and versions exactly: "Postgres 15.4", not "a recent Postgres".
21. Each section except Takeaways opens with a sentence that could stand alone as its summary.
22. What I'd Do Differently is one paragraph, no more than 80 words, and it names at least one specific mistake of mine.
23. Takeaways is a bulleted list of exactly three bullets, each under 20 words.
24. Each takeaway should be usable by someone who doesn't run our stack; if it only applies to us it's not a takeaway.
25. No exclamation marks anywhere.
26. Use at most one analogy in the whole post, and only if it carries weight a plain statement couldn't.
27. Name the source the first time I cite someone else's idea or figure; quoted text goes in quote marks, exactly as written.
28. Headings in Title Case, no more than five words each, and never phrased as a question.
29. Put the single most important number in the first 100 words.
30. Explain a term the first time it shows up if a mid-level engineer from another specialty might not know it.
31. Keep sentences under 28 words; split anything longer.
32. Say what the fix cost in time, money or complexity. A win with no price is an advert.
33. Don't hedge with "might possibly" or "somewhat"; say what I know and mark a guess with "my guess is".
34. Write file names, commands and config keys in backticks, exactly as they'd be typed.
35. End the post on the last takeaway bullet: no sign-off, no "thanks for reading", no call to subscribe.
36. Give dates and durations precisely, "over 9 days in March", rather than "recently" or "for a while".
37. Cut any paragraph that only tells the reader how to feel about the next paragraph.
38. No bold for emphasis in body text; if a sentence needs bold it needs rewriting.
39. Read it aloud once; anything I wouldn't say to a colleague across a desk gets rewritten.
40. Make the reader able to reproduce the check, if not the fix: give enough for them to measure the same thing on their own system.
