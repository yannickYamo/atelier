---
request: Review the pull request that adds caching to the search endpoint.
---
**Summary:** adds an LRU cache in front of `search()`.

**Blocking**
- `search.ts:40`: the cache key ignores the user's locale, so results can leak across languages.

**Nits**
- `search.ts:12`: the size limit could be a named constant.

**Verdict:** request changes.
