Run the backfill on a small batch first:

```sql
UPDATE <table>
SET <new_column> = <value_expression>
WHERE <new_column> IS NULL
  AND id IN (SELECT id FROM <table> WHERE <new_column> IS NULL ORDER BY id LIMIT 1000);
```

Then check it: `SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;` The count should drop by 1,000.

**State**
- Step 1: done
- Step 2: done (schema change, new column exists)
- Step 3: backfill, in progress, starting now
- Step 4: next after backfill (not yet started)
- Step 5: not started

**Steps for the backfill**
1. Run the batch above on 1,000 rows and confirm the NULL count dropped by 1,000.
2. Loop the same statement until the NULL count reaches 0.
3. Spot-check 10 rows against the source values.

**Flagged for review:** `<table>`, `<new_column>`, `<value_expression>`, and the batch size of 1,000 are placeholders. They are not from your material. Replace them with your real names and a batch size your database handles comfortably.

Next action (under 2 minutes): run `SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;` and send me the number so I can size the batches.