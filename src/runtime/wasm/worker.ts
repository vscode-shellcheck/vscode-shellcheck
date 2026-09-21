import { parentPort } from "node:worker_threads";
import {
  createReadOnlyPreopen,
  ReadOnlyPreopen,
  run as runShellCheck,
} from "@vscode-shellcheck/shellcheck-wasm/node";
import {
  MainToWorker,
  RunMessage,
  WorkerToMain,
  InitMessage,
} from "./protocol.js";

if (!parentPort) {
  throw new Error("The ShellCheck wasm worker needs a parent thread");
}
const port = parentPort;

const decoder = new TextDecoder();
let wasmModule: WebAssembly.Module | undefined;

function describe(error: unknown): { message: string; detail: string } {
  return error instanceof Error
    ? { message: error.message, detail: error.stack ?? "" }
    : { message: String(error), detail: "" };
}

function post(message: WorkerToMain): void {
  port.postMessage(message);
}

function init(message: InitMessage): void {
  try {
    wasmModule =
      message.source === "module"
        ? message.module
        : new WebAssembly.Module(message.bytes);
    post({ type: "ready", moduleSource: message.source });
  } catch (error) {
    post({ type: "failed", id: null, ...describe(error) });
  }
}

function run(message: RunMessage): void {
  if (!wasmModule) {
    post({
      type: "failed",
      id: message.id,
      message: "The ShellCheck wasm worker received a run before its module",
      detail: "",
    });
    return;
  }

  let preopen: ReadOnlyPreopen | undefined;
  try {
    // Inside the try: the package refuses a host root it cannot realpath,
    // which is this run's failure, not the worker's.
    if (message.preopen) {
      preopen = createReadOnlyPreopen(
        message.preopen.hostRoot,
        message.preopen.guestName,
      );
    }
    // Synchronous on purpose: the guest is a wasm command that runs to
    // completion, and one lint at a time per worker is the whole design.
    const outcome = runShellCheck(wasmModule, {
      args: message.args,
      stdin: message.stdin,
      env: message.env,
      preopens: preopen ? [preopen] : [],
    });
    post({
      type: "result",
      id: message.id,
      exitCode: outcome.exitCode,
      stdout: decoder.decode(outcome.stdout),
      stderr: decoder.decode(outcome.stderr),
    });
  } catch (error) {
    post({ type: "failed", id: message.id, ...describe(error) });
  } finally {
    // Host descriptors the guest left open would otherwise outlive the run.
    preopen?.dispose();
  }
}

port.on("message", (message: MainToWorker) => {
  if (message.type === "init") {
    init(message);
    return;
  }
  run(message);
});
