Run this to count the rows that need backfilling:

```sql
SELECT COUNT(*) FROM <table> WHERE <new_col> IS NULL;
```

**Status:** Step 3 of 5, backfill. The schema change is done.

**Steps for the backfill:**
1. Run the count above.
2. Test on a small batch (Postgres syntax, adjust for your DB):
   ```sql
   UPDATE <table>
   SET <new_col> = <value_expr>
   WHERE id IN (
     SELECT id FROM <table> WHERE <new_col> IS NULL LIMIT 1000
   );
   ```
3. Spot-check 5 updated rows.
4. Repeat step 2 in a loop until the count hits 0.

**Time estimate:** Under 1M rows takes about 5 minutes. Over 100M rows takes hours, so run it in the background with a pause between batches.

**Next:** Paste the count and I'll give you an exact batch size and time estimate.