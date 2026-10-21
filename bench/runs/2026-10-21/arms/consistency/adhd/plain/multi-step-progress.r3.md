Run this to size the backfill:

```sql
SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;
```

**Step 3 of 5 done:** schema updated, new column exists.
**Step 4 now:** backfill.

1. Run the count query above.
2. Backfill in batches, not one big `UPDATE`:
   ```sql
   UPDATE <table>
   SET <new_column> = <value_expr>
   WHERE id IN (
     SELECT id FROM <table>
     WHERE <new_column> IS NULL
     LIMIT 10000
   );
   ```
3. Repeat step 2 until the count from step 1 returns 0.

**Time:** about 5 minutes under 1M rows, an hour or more past 50M.

Next: run the count query and paste the number. I'll fill in `<value_expr>` once I know where the values come from.