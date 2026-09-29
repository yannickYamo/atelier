# 0002. A model reads claims; code decides whether they are supported

**Context.** A draft published under someone's name must not contain a figure, quotation or story they
did not supply. Pattern checks key on how a claim is usually worded, so any new wording escapes them. On
two corpora the pattern check never flagged a true piece, and missed 54% and then 74% of planted
inventions.

**Decision.** Split the job (`core/loop/claim-extract.ts`). A small model lists every specific in the
draft, its kind, and where it claims it came from, quoting the supporting passage. Code then checks the
quote is really in the person's material, the numbers match, and the specific sits where the reader
said. An attributed figure, a quotation, a link or a lived story can never pass as general knowledge.

**History.**
- *Version 1* trusted the reader's sentence numbers and cut plain sentences beside the one holding a
  claim: specificity 0.744 against a floor of 0.80. Failed.
- *Version 2* checks location, accepts a verbatim trace to the material whatever the reader said, and
  reads spelled-out numbers: 35 of 35 plants caught, 35 of 38 clean drafts left alone. Qualified, on
  technical and marketing writing.
- *Version 3* came from an audit. It reads headings and table rows, strips markdown before matching, lets
  a quoted story span sentences of one paragraph, and reads number phrases ("twenty-five" is 25,
  "fourteen" is not "four"). Reading one word at a time had let "fourteen engineers" pass against "four
  engineers" and cut a true "25 customers". A reader failure mid-repair now degrades the whole sensor,
  so a draft and its rewrite are never compared by two instruments.

**Cost.** Each version is a new instrument and must be measured again before it may cut. Version 3
reports until its [pre-registered qualification](../../studies/CLAIM_READER_V3_QUALIFICATION_PREREGISTRATION.md)
passes; the pattern check cuts meanwhile.
