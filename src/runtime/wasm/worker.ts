import { startWorker } from "@vscode-shellcheck/shellcheck-wasm/worker";
import { parentPort } from "node:worker_threads";

startWorker({
  postMessage: (message) => parentPort!.postMessage(message),
  onMessage: (listener) => parentPort!.on("message", listener),
});
