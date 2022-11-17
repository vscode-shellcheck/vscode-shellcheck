# API

The ShellCheck extension provides a small API, which allows other VS Code extensions to interact with the ShellCheck extension.

The API offers a single function named `registerDocumentFilter`.

## API function: registerDocumentFilter

The `registerDocumentFilter` function allows other VS Code extensions to register their own shell-based language IDs with the ShellCheck extension.

### Prerequisites

To make the ShellCheck extension known to your own VS Code extension, add `timonwong.shellcheck` to the `extensionDependencies` list in your `package.json`:

```jsonc
// Add this to your package.json
"extensionDependencies": [
  "timonwong.shellcheck"
]
```

### Interface

The interface of the API is:

```ts
import { Disposable, DocumentFilter } from "vscode";

// Copy this interface into your own extension
export interface ShellCheckExtensionApiVersion1 {
  registerDocumentFilter: (documentFilter: DocumentFilter) => Disposable;
}
```

### Example

An example API call to `registerDocumentFilter`:

```ts
import { Disposable, DocumentFilter, extensions } from "vscode";

// Run these commands in your own extension
const MY_FILTER: DocumentFilter = { language: "my-language-id" };
const shellCheckExtension = extensions.getExtension("timonwong.shellcheck");
const subscription =
  shellCheckExtension?.exports?.apiVersion1?.registerDocumentFilter(MY_FILTER);
```

## See also

- https://code.visualstudio.com/api/references/vscode-api#extensions
