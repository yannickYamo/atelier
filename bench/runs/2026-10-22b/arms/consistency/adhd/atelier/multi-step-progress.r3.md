Run the backfill on one batch first to confirm it works:

```sql
UPDATE <table>
SET <new_column> = <value_expression>
WHERE <new_column> IS NULL
  AND id IN (SELECT id FROM <table> WHERE <new_column> IS NULL ORDER BY id LIMIT 1000);
```

Then check the result: `SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;` should drop by 1,000.

**State:** Step 3 of 5, backfill. Schema change is done (step 2). Backfill is not started.

**Next steps:**
1. Run the batch above and confirm the NULL count dropped by 1,000.
2. Loop the same statement until the NULL count reaches 0.
3. Move to step 4.

**Flagged for review:** `<table>`, `<new_column>`, `<value_expression>`, and the 1,000 batch size are placeholders. I have no table name, column name, value source, or row count from your material. Replace them before running. I gave no time estimate because there is no row count to base one on.

**Do now (under 2 minutes):** run `SELECT COUNT(*) FROM <table> WHERE <new_column> IS NULL;` and send me the number. I will give a batch size and a time estimate from it.