import genericPool from "generic-pool"
import { Worker, WorkerOptions } from "worker_threads"
import * as Comlink from "comlink"
import nodeEndpoint from "comlink/dist/umd/node-adapter"

const newWorkerTS = (file: string, wkOpts: WorkerOptions = {}) => {
  wkOpts.eval = true
  if (!wkOpts.workerData) {
    wkOpts.workerData = {}
  }
  wkOpts.workerData.__filename = file
  return new Worker(
    `const wk = require('worker_threads');
     require('ts-node').register({ transpileOnly: true });
     let file = wk.workerData.__filename;
     delete wk.workerData.__filename;
     require(file);
      `,
    wkOpts
  )
}

const generateWorkerFactory = <T>(workerFile: string) =>
  new (class ComlinkWorkerFactory {
    #comlinkToWorker = new Map<Comlink.Remote<T>, Worker>()

    async create() {
      console.log(`parent: create worker`)
      const worker = newWorkerTS(workerFile)
      await new Promise((resolve) => worker.once('online', () => resolve()))
      const proxy = Comlink.wrap<T>(nodeEndpoint(worker))
      this.#comlinkToWorker.set(proxy, worker)
      return proxy
    }

    async destroy(proxy: Comlink.Remote<T>) {
      const worker = this.#comlinkToWorker.get(proxy)
      worker?.terminate()
      console.log(`parent: destroy worker-${worker?.threadId}`)
      proxy[Comlink.releaseProxy]()
    }
  })()

const pool = genericPool.createPool(
  generateWorkerFactory<typeof import("./test_worker")>(
    __dirname + "/test_worker.ts"
  ),
  {
    min: 1,
    max: 4, // 1 @ 98%, 2 @ 190%, @ 270%, 8 @ 300%
  }
)
pool.on("factoryCreateError", (e) => console.error(e))
;(async () => {
  for (let i = 0; i < 10; i++) {
    pool
      .acquire()
      .then(async (worker) => {
        console.log(`parent: ${await worker.recursiveFibonacci(45)}`)
        pool.release(worker)
      })
  }
  await pool.drain()
  await pool.clear()
})().catch((e) => {
  console.error("parent:", e)
  process.exit(1)
})
