Step 3 of 5 is in progress, with no backfill code written yet. The schema change from step 2 is done.

1. Run the backfill in batches of 1,000 rows, committing after each batch so a failure loses at most one batch. The table and column names below are placeholders, so swap in yours:

```sql
UPDATE your_table
SET new_column = <value_expression>
WHERE id IN (
  SELECT id FROM your_table
  WHERE new_column IS NULL
  LIMIT 1000
);
```

2. Repeat until it reports 0 rows updated, then confirm nothing is left:

```sql
SELECT COUNT(*) FROM your_table WHERE new_column IS NULL;
```

Expect 0. Each 1,000-row batch usually takes 1-5 seconds, so a 1,000,000-row table takes roughly 17-85 minutes.

Step 3 of 5 done: schema change complete, backfill queued. Next: run the first batch.

Run the first batch against a staging copy now and note how many seconds it takes (under 2 minutes).