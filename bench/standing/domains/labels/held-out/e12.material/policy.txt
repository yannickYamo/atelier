BRAND SUITABILITY POLICY, EXTRACT

1. Every category in a label is one of the 39 categories of the taxonomy, written exactly as the taxonomy writes it.
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
