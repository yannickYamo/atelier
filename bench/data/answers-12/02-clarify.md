One question before I rename anything: which service, `billing-api` or `billing-worker`?

Both are called "billing" in the compose file, and they deploy separately, so renaming the wrong one breaks its health check.
