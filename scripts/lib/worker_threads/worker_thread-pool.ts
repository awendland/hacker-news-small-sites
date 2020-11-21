import genericPool from "generic-pool"
import { Worker, WorkerOptions } from "worker_threads"
import * as Comlink from "comlink"
import nodeEndpoint from "comlink/dist/umd/node-adapter"
import { cpus } from "os"
import { newDynamicWorker } from "./ts/ts-node-worker_thread"
import { ConstructorDeclaration } from "typescript"
import { boolean } from "yargs"

/**
 * Constructs a Factory object for use by generic-pool. The Factory will produce
 * Comlink-wrapped worker_threads entities.
 *
 * This will properly shut down the Worker instances that underlie the Comlink proxies.
 *
 * @param newWorkerFn - A worker init function must be provided (by being generic
 *                      here, instead of assuming a standard (string path) => Worker
 *                      construction, something like ts-node-worker_threads can be used)
 */
export const createComlinkWorkerFactory = <IWorker>(
  modulePath: string,
  newWorkerFn: (path: string, workerOptions: WorkerOptions) => Worker,
  {
    logTraceInfo = false,
  }: {
    logTraceInfo?: boolean
  }
) =>
  new (class ComlinkWorkerFactory<_T = IWorker> {
    private comlinkToWorker = new WeakMap<Comlink.Remote<_T>, Worker>()

    async create() {
      if (logTraceInfo) console.debug(`Creating worker for ${modulePath}`)
      const worker = newWorkerFn(
        __dirname + "/_worker-comlink-expose-module.ts",
        { workerData: { __modulePath: modulePath } }
      )
      await new Promise((resolve) => worker.once("online", () => resolve()))
      if (logTraceInfo) console.debug(`worker-${worker.threadId} is online`)
      const proxy = Comlink.wrap<_T>(nodeEndpoint(worker))
      this.comlinkToWorker.set(proxy, worker)
      return proxy
    }

    async destroy(proxy: Comlink.Remote<_T>) {
      const worker = this.comlinkToWorker.get(proxy)
      this.comlinkToWorker.delete(proxy)
      if (logTraceInfo) console.debug(`Terminating worker-${worker?.threadId}`)
      worker?.terminate()
      proxy[Comlink.releaseProxy]()
      if (logTraceInfo)
        console.debug(`worker-${worker?.threadId} is terminated`)
    }
  })()

/**
 * Create a generic-pool of worker_threads that starts empty but can scale up to one
 * less than the number of CPU cores. Logs all worker_thread creation errors to the
 * console.
 *
 * @param modulePath Must be an absolute path (eg. use `__dirname + "/WHATEVER_THE_RELATIVE_PATH_IS"`)
 * @param options
 * @param options.maxSize
 * @param options.minSize
 * @param options.eagerInit Overrides minSize by setting minimum pool size to maximum pool size, ensuring that the pool is filled immediately
 * @param options.onFactoryCreateError How worker_thread creation error notices should be handled. Set to `() => void` to ignore them.
 */
export const createLazyComlinkWorkersFor = <IWorker>(
  modulePath: string,
  {
    newWorkerFn = newDynamicWorker,
    maxSize = cpus().length - 1,
    minSize = 0,
    eagerInit = false,
    onFactoryCreateError = console.error,
    logTraceInfo = false,
  }: {
    newWorkerFn?: (file: string, workerOptions: WorkerOptions) => Worker
    maxSize?: number
    minSize?: number
    eagerInit?: boolean
    onFactoryCreateError?: (e: Error) => void
    logTraceInfo?: boolean // FIXME switch to Log module
  }
) => {
  const pool = genericPool.createPool(
    createComlinkWorkerFactory<IWorker>(modulePath, newWorkerFn, {
      logTraceInfo,
    }),
    {
      min: eagerInit ? maxSize : minSize,
      max: maxSize,
    }
  )
  pool.on("factoryCreateError", onFactoryCreateError)
  return pool
}

createLazyComlinkWorkersFor("", { eagerInit: false })
