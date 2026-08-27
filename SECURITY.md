# Security

## Reporting a vulnerability

Report privately through GitHub's security advisories:
<https://github.com/yannickYamo/atelier/security/advisories/new>

Please do not open a public issue for a vulnerability. There is no bug bounty. I aim to acknowledge
within seven days and to disclose within ninety days of a fix, or sooner by agreement.

## Supported versions

The latest release only. This project is pre-1.0 and there is no backport branch.

## What this tool does with your data, so you can judge the surface

- **It reads a corpus you point it at.** Discovery sends that material to whichever inference
  provider you configured. Nothing else leaves the machine.
- **It stores state locally**, under `$ATELIER_DATA` or `~/.atelier`: standards, compiled packages,
  the ratification ledger, invocation records. No telemetry, no account, no network calls except to
  your configured provider.
- **It reads one credential from the environment**, named by `--api-key-env` and defaulting to your
  provider's convention. It is never written to disk and never included in a record.
- **It writes into directories you name**, including agent-host skill directories. `revert` restores
  what a build overwrote; `rollback` moves between versions Atelier itself minted.

If you find a path where a credential, a corpus, or held-out material leaks somewhere the above does
not describe, that is a vulnerability and I want to know.
