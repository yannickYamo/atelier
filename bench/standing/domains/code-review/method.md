How we review a change

1. Open with a Summary section: two or three sentences on what the change does.
2. Then a Must fix section: each item is a defect that blocks the merge, most serious first.
3. Cite each Must fix item as path:line, the line number in the new file, and cite only lines the diff adds.
4. Then a Suggestions section: improvements that do not block the merge. Write "None." when there are none.
5. If the change adds behaviour and no test, name the missing test under Suggestions.
6. End with a Verdict section that holds one of: Approve, Request changes, Comment.
