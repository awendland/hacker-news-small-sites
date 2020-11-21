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

/**
 * Dynamically handles worker creation based on file path.
 *
 * To support isomorphic ts-node and transpiled worker code make sure not
 * to include a file extension. The extension will be automatically resolved at runtime
 * and the correct worker type will be loaded appropriately.
 *
 * Mappings:
 * * .ts --> newTSWorker(...)
 * * else --> new Worker(...)
 * @param modulePath
 * @param workerOptions
 * @param tsNodeOptions
 */
export const newDynamicWorker = (
  modulePath: string,
  workerOptions: WorkerOptions = {},
  tsNodeOptions: RegisterOptions = { transpileOnly: true }
) => {
  const file = require.resolve(modulePath)
  if (file.match(/ts?$/)) return newTSWorker(file, workerOptions, tsNodeOptions)
  else return new Worker(file, workerOptions)
}
