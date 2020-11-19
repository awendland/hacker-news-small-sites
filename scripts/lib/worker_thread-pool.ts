import genericPool from "generic-pool"
import { Worker } from "worker_threads"
import * as Comlink from "comlink"
import nodeEndpoint from "comlink/dist/umd/node-adapter"
import { cpus } from "os"

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
  newWorkerFn: () => Worker
) =>
  new (class ComlinkWorkerFactory<_T = IWorker> {
    private comlinkToWorker = new WeakMap<Comlink.Remote<_T>, Worker>()

    async create() {
      const worker = newWorkerFn()
      await new Promise((resolve) => worker.once("online", () => resolve()))
      const proxy = Comlink.wrap<_T>(nodeEndpoint(worker))
      this.comlinkToWorker.set(proxy, worker)
      return proxy
    }

    async destroy(proxy: Comlink.Remote<_T>) {
      const worker = this.comlinkToWorker.get(proxy)
      this.comlinkToWorker.delete(proxy)
      worker?.terminate()
      proxy[Comlink.releaseProxy]()
    }
  })()

/**
 * Create a generic-pool of worker_threads that starts empty but can scale up to one
 * less than the number of CPU cores. Logs all worker_thread creation errors to the
 * console.
 *
 * @param newWorkerFn
 * @param maxSize
 * @param onFactoryCreateError How worker_thread creation error notices should be handled. Set to `() => void` to ignore them.
 */
export const createLazyWorkerPool = <IWorker>(
  newWorkerFn: () => Worker,
  maxSize = cpus().length - 1,
  onFactoryCreateError: (e: Error) => void = console.error
) => {
  const pool = genericPool.createPool(
    createComlinkWorkerFactory<IWorker>(newWorkerFn),
    {
      min: 0,
      max: maxSize,
    }
  )
  pool.on("factoryCreateError", onFactoryCreateError)
  return pool
}
