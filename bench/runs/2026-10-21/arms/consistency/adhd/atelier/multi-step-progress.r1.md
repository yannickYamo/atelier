Step 2 of 5 done: schema change applied. Next: backfill the new column.

Run the backfill in batches so it doesn't lock the table:

```sql
UPDATE your_table
SET new_column = <default_or_derived_value>
WHERE new_column IS NULL
  AND id IN (SELECT id FROM your_table WHERE new_column IS NULL LIMIT 10000);
```

1. Run that statement, then rerun it until it reports 0 rows updated.
2. Check completion with `SELECT COUNT(*) FROM your_table WHERE new_column IS NULL;` (expect 0).

Replace `your_table`, `new_column`, and the value with your real names before running.

Right now, run `SELECT COUNT(*) FROM your_table WHERE new_column IS NULL;` to see how many rows need backfilling (takes under 1 minute).