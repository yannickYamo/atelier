```sql
UPDATE your_table
SET new_column = <source_expression>
WHERE new_column IS NULL
  AND id IN (SELECT id FROM your_table WHERE new_column IS NULL ORDER BY id LIMIT 1000);
```

Then confirm the batch landed:

```sql
SELECT COUNT(*) FROM your_table WHERE new_column IS NULL;
```

The NULL count should drop by exactly 1,000. If it does, loop the same statement until the count hits 0. At roughly 1,000 rows per batch, expect each batch to take a few seconds on a normal table, so time the first one and multiply by (total rows / 1,000) for your full estimate.

Status: Step 3 of 5 in progress (schema change done, backfill starting). Next: run the first 1,000-row batch.

Do this now (under 2 minutes): swap in your real table, column, and source expression, and run the first batch.