import { parentPort, threadId } from "worker_threads"
import * as Comlink from "comlink"
import nodeEndpoint from "comlink/dist/umd/node-adapter"

console.log(`worker-${threadId}: started`)

export const doHardMath = (howHard: number) =>
  new Promise((resolve) => setTimeout(() => resolve("good maths"), howHard))

export const recursiveFibonacci = (n: number): number =>
  n < 2 ? n : recursiveFibonacci(n - 1) + recursiveFibonacci(n - 2)

export { readablify } from "./lib/readablify"

Comlink.expose(module.exports, nodeEndpoint(parentPort!))
