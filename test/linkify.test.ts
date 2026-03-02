import assert from "node:assert";
import * as vscode from "vscode";
import { LinkifyProvider } from "../src/linkify.js";
import { closeAllEditors, openDocument } from "./helpers.js";

suite("Document Link Provider", () => {
  teardown(async () => {
    await closeAllEditors();
  });

  test("Extension should linkify shellcheck directives automatically", async () => {
    const linker = new LinkifyProvider();
    const document = await openDocument(
      `#!/bin/bash

# shellcheck disable=SC1010
echo $SHELL

 #  shellcheck disable=SC1011
echo $SHELL

 #   shellcheck   disable=SC1012
eval \`uname -r\`

# shellcheck disable=SC1013

# No SC prefix:

# shellcheck disable=1014
echo $SHELL

 #  shellcheck disable=1015
echo $SHELL

 #   shellcheck   disable=1016
eval \`uname -r\`

# shellcheck disable=1017
`,
      "shellscript",
    );

    const links = await linker.provideDocumentLinks(document, {
      isCancellationRequested: false,
    } as vscode.CancellationToken);

    assert.ok(links);
    assert.strictEqual(links.length, 8);
    for (const [i, link] of links.entries()) {
      assert.strictEqual(link.target?.authority, "www.shellcheck.net");
      assert.strictEqual(link.target?.path, `/wiki/SC101${i}`);
    }
  });
});
