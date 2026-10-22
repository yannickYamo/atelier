**Step 3 of 5: backfill the new column. Start by counting the rows to fill.**

Done: schema change (new column exists).
Next after this: step 4.

1. Count rows needing the backfill:
   ```sql
   SELECT COUNT(*) FROM your_table WHERE new_col IS NULL;
   ```
2. Run the backfill in batches (Postgres syntax). Repeat until it reports `UPDATE 0`:
   ```sql
   UPDATE your_table
   SET new_col = <value_expression>
   WHERE id IN (
     SELECT id FROM your_table
     WHERE new_col IS NULL
     LIMIT 10000
   );
   ```
3. Re-run the count from step 1. Expect `0`.

**Time:** about 1 minute for 100k rows, 10 to 30 minutes for 10M rows.

**Before step 2:** confirm you have a backup or are on staging. This step changes data.

Next, in under 2 minutes: paste the table name, the column name, and where its value comes from. I'll fill in the exact script.