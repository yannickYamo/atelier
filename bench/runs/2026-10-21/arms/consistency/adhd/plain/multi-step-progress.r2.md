Step 3 of 5: backfill the new column. Schema change is done.

1. Count the rows to fill (under 1 minute):
   ```sql
   SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;
   ```
2. Test the backfill on 1,000 rows, or on staging, and check the values.
3. Run in batches of 10,000 (Postgres syntax) and repeat until 0 rows update:
   ```sql
   UPDATE <table>
   SET <new_column> = <value_expr>
   WHERE id IN (
     SELECT id FROM <table>
     WHERE <new_column> IS NULL
     LIMIT 10000
   );
   ```
4. Re-run the count from step 1. Expect 0.

**Estimate:** about 5 to 10 minutes under 5M rows. Longer if the table has triggers or heavy indexes.

**Next:** run the count query and paste the number. I'll adjust the batch size and give you the real script.