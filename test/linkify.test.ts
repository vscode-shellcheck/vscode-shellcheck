import * as assert from "node:assert";
import * as vscode from "vscode";
import { LinkifyProvider } from "../src/linkify";

suite("Document Link Provider", () => {
  test("Extension should linkify shellcheck directives automatically", async () => {
    const linker = new LinkifyProvider();
    const document = await vscode.workspace.openTextDocument({
      content: `#!/bin/bash

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
      language: "shellscript",
    });

    await vscode.window.showTextDocument(document);

    const links: vscode.ProviderResult<vscode.DocumentLink[]> =
      await linker.provideDocumentLinks(document, {
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
