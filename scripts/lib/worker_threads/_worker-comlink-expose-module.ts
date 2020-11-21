import { parentPort, workerData } from "worker_threads"
import * as Comlink from "comlink"
import nodeEndpoint from "comlink/dist/umd/node-adapter"

if (!parentPort)
  throw Error(`${__filename} must be instantiated in a worker_thread`)

Comlink.expose(require(workerData.__modulePath), nodeEndpoint(parentPort))
