Run the backfill for the new column now (step 3 of 5):

```sql
-- Replace <table>, <new_col>, and <source_expr> with your values.
-- Batch it so locks stay short; repeat until 0 rows are updated.
UPDATE <table>
SET <new_col> = <source_expr>
WHERE <new_col> IS NULL
  AND id IN (SELECT id FROM <table> WHERE <new_col> IS NULL LIMIT 10000);
```

**State:** Step 1 and 2 are done, including the schema change. Step 3 (backfill) is next. Step 4 and 5 wait on it.

1. Run the batch above in a loop until it reports 0 rows updated.
2. Verify: `SELECT COUNT(*) FROM <table> WHERE <new_col> IS NULL;` returns 0.

**Open:** I do not have the table name, column name, or source expression for the backfill, so the placeholders above need your values.

**Do this in under 2 minutes:** paste the table name, the new column name, and where its value comes from, and I will return the exact statement.