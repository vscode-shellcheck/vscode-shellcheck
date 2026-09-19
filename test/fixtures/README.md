# ShellCheck diagnostic corpus

`shellcheck-messages.csv` is the diagnostic description list from the
[ShellCheck checks gist](https://gist.github.com/eggplants/9fbe03453c3f3fd03295e88def6a1324),
which enumerates the ShellCheck wiki checks.

`shellcheck-messages.golden.json` contains the expected Markdown output for
each message. When the formatter changes intentionally, regenerate the golden
file from the CSV and review the complete diff. Run `npm run test:unit` to
verify this corpus without starting VS Code.
