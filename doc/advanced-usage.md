# Advanced usage

## Linting other files

ShellCheck lints shell scripts and Bats files on its own. Any other file, such as a Jinja template `deploy.sh.j2`, is linted on demand: open it and run _ShellCheck: Lint Current Document as Shell Script_. Its problems stay until you run the command again or close the file, and the light bulb and hover work on them as usual.

ShellCheck takes the shell from the shebang, or from a `# shellcheck shell=bash` directive at the top of the file. In a template, keep each `{{ … }}` inside quotes, such as `"{{ name }}"`; a `{% … %}` or `{# … #}` block anywhere in the file stops ShellCheck from checking it.

### Linting on save

To lint such files on save, have the [Run on Save](https://marketplace.visualstudio.com/items?itemName=pucelle.run-on-save) extension run the command. The command lints the active editor rather than the saved file, so the example leaves auto save out; _Save All_ still lints whichever editor is active, even one that is not a shell script.

```jsonc
{
  "runOnSave.onlyRunOnManualSave": true,
  "runOnSave.commands": [
    {
      "globMatch": "**/*.sh.j2",
      "command": "shellcheck.runLintAnyLanguage",
      "runIn": "vscode",
    },
  ],
}
```
