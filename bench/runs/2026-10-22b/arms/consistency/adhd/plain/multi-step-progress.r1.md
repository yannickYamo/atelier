Run this to size the backfill (replace the placeholders):

```sql
SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;
```

**Status:** Step 3 of 5 in progress (backfill). Schema change is done.

**Backfill steps:**
1. Confirm a recent backup or snapshot exists. The backfill rewrites data.
2. Run the batched update below. Repeat until it reports 0 rows updated.
   ```sql
   UPDATE <table>
   SET <new_column> = <value_expr>
   WHERE id IN (
     SELECT id FROM <table>
     WHERE <new_column> IS NULL
     LIMIT 10000
   );
   ```
3. Re-run the count query. Expect 0.

**Time:** Roughly 1 to 5 minutes per million rows. The count tells you your real number.

Next: run the count and paste the result. I'll tailor the script to your table, column, and database (the SQL above is Postgres-style).