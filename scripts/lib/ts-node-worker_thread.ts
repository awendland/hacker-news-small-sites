import { Worker, WorkerOptions } from "worker_threads"
import type { RegisterOptions } from "ts-node"

/**
 * Analogous to `new Worker(...)` but supports TypeScript files via ts-node.
 *
 * Defaults to transpiling the TypeScript by setting `transpileOnly: true` in the
 * `ts-node.register(...)` options.
 *
 * @param file
 * @param wkOpts
 * @param tsNodeOpts - these are JSON stringified so they can't contain any functions
 */
export const newTSWorker = (
  file: string,
  workerOptions: WorkerOptions = {},
  tsNodeOptions: RegisterOptions = { transpileOnly: true }
) => {
  workerOptions.eval = true
  workerOptions.workerData = workerOptions.workerData ?? {}
  workerOptions.workerData.__filename = file
  return new Worker(
    `const wk = require('worker_threads');
     require('ts-node').register(${JSON.stringify(tsNodeOptions)});
     let file = wk.workerData.__filename;
     delete wk.workerData.__filename;
     require(file);`,
    workerOptions
  )
}
