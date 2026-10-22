Run this and paste the number:

```sql
SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;
```

**State:** Step 3 of 5 done: schema change applied. Now on step 4: backfill.

**Step 4 breakdown:**
1. Count the rows to backfill (query above).
2. Backfill one batch of 1,000 and spot-check the values.
3. Repeat in batches until the count query returns 0.

**Time:** About 5 minutes under 1M rows. About an hour at 10M+ rows with 10k-row batches.

**Next (under 2 minutes):** Run the count query and send me the result. I'll size the batches and write the backfill statement.