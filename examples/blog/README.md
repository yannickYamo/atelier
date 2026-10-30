# Example: a blog

**Six short engineering posts to try Atelier on without writing of your own. They are synthetic, written
for testing, not a real author's work.**

```bash
atelier new <atelier>/examples/blog/posts "write me a blog post like these" --ai-assisted
atelier new <atelier>/examples/blog/posts --accept
atelier invoke --skill posts "Write a 500-word post about why we moved from quarterly OKRs to a six-week cycle."
```

`<atelier>` is where you cloned this repository. Run the commands from a project directory of your own:
the skill is installed relative to where you are. The posts were written with AI, so they are declared
`--ai-assisted`, and every rule read from them says so. With six
pieces, one is held back for a blind comparison and two check the rules discovery proposes. That is
enough to see how it works, and too few for any rule read from them to be suggested for rejection.

`atelier new` prints a cost estimate before it reads anything, and stops at `--cap`. `invoke` writes, checks and repairs a draft, and prints where it wrote
everything it checked. Bind your own figures with `--with notes=<file>` and watch what stops being cut.

[← README](../../README.md)
