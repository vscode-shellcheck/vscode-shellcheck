import assert from "node:assert";
import { Semaphore } from "../src/utils/semaphore.js";

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let settle!: Omit<Deferred, "promise">;
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, ...settle };
}

/** Lets every queued admission and settlement run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Tasks that only finish when the test says so, recording who started. */
class Tasks {
  public readonly started: number[] = [];
  private readonly gates = new Map<number, Deferred>();

  public task(id: number): () => Promise<number> {
    const gate = deferred();
    this.gates.set(id, gate);
    return async () => {
      this.started.push(id);
      await gate.promise;
      return id;
    };
  }

  public finish(id: number): void {
    this.gates.get(id)!.resolve();
  }

  public fail(id: number, error: unknown): void {
    this.gates.get(id)!.reject(error);
  }
}

suite("Semaphore", () => {
  test("admits up to the limit, then in arrival order as slots free", async () => {
    const semaphore = new Semaphore(2);
    const tasks = new Tasks();
    const runs = [1, 2, 3, 4].map((id) => semaphore.run(tasks.task(id)));
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2]);

    tasks.finish(2);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3]);

    tasks.finish(1);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3, 4]);

    tasks.finish(3);
    tasks.finish(4);
    assert.deepStrictEqual(await Promise.all(runs), [1, 2, 3, 4]);
  });

  test("a task that rejects frees its slot", async () => {
    const semaphore = new Semaphore(1);
    const tasks = new Tasks();
    const failed = semaphore.run(tasks.task(1));
    const next = semaphore.run(tasks.task(2));
    await flush();

    const error = new Error("spawn EAGAIN");
    tasks.fail(1, error);
    await assert.rejects(failed, (reason) => reason === error);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2]);
    tasks.finish(2);
    assert.strictEqual(await next, 2);
  });

  test("a task that throws before returning a promise frees its slot", async () => {
    const semaphore = new Semaphore(1);
    const tasks = new Tasks();
    const error = new Error("thrown synchronously");
    const failed = semaphore.run(() => {
      throw error;
    });
    const next = semaphore.run(tasks.task(2));

    await assert.rejects(failed, (reason) => reason === error);
    await flush();
    assert.deepStrictEqual(tasks.started, [2]);
    tasks.finish(2);
    assert.strictEqual(await next, 2);
  });

  test("raising the limit admits queued tasks without waiting for a slot", async () => {
    const semaphore = new Semaphore(1);
    const tasks = new Tasks();
    const runs = [1, 2, 3, 4].map((id) => semaphore.run(tasks.task(id)));
    await flush();
    assert.deepStrictEqual(tasks.started, [1]);

    semaphore.setLimit(3);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3]);

    semaphore.setLimit(0);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3, 4]);

    [1, 2, 3, 4].forEach((id) => tasks.finish(id));
    await Promise.all(runs);
  });

  test("lowering the limit lets running tasks finish and admits no more until under it", async () => {
    const semaphore = new Semaphore(3);
    const tasks = new Tasks();
    const runs = [1, 2, 3, 4, 5].map((id) => semaphore.run(tasks.task(id)));
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3]);

    semaphore.setLimit(1);
    tasks.finish(1);
    await flush();
    tasks.finish(2);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3]);

    tasks.finish(3);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 2, 3, 4]);

    tasks.finish(4);
    await flush();
    tasks.finish(5);
    assert.deepStrictEqual(await Promise.all(runs), [1, 2, 3, 4, 5]);
  });

  test("aborting a queued task rejects it with the reason and never runs it", async () => {
    const semaphore = new Semaphore(1);
    const tasks = new Tasks();
    const controller = new AbortController();
    const first = semaphore.run(tasks.task(1));
    const aborted = semaphore.run(tasks.task(2), controller.signal);
    const last = semaphore.run(tasks.task(3));
    await flush();

    const reason = new Error("disposed");
    controller.abort(reason);
    await assert.rejects(aborted, (error) => error === reason);

    tasks.finish(1);
    await flush();
    assert.deepStrictEqual(tasks.started, [1, 3]);
    tasks.finish(3);
    assert.deepStrictEqual(await Promise.all([first, last]), [1, 3]);
  });
});
