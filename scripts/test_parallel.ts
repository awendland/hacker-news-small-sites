import genericPool from "generic-pool"
import { cpus } from "os"
import { Worker, WorkerOptions } from "worker_threads"
import * as Comlink from "comlink"
import nodeEndpoint from "comlink/dist/umd/node-adapter"
import got from "got/dist/source"

import { readablify } from "./lib/readablify"

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
      await new Promise((resolve) => worker.once("online", () => resolve()))
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

const urls = `
https://www.dampfkraft.com/romaji-history.html
https://www.iphoneincanada.ca/mac/apple-responds-to-macos-privacy-concerns-explains-why-apps-were-slow-to-launch/
https://www.breakingasia.com/news/laser-guided-lightning-may-help-prevent-wildfires/
https://ottverse.com/create-vintage-videos-using-ffmpeg/
https://blog.willbanders.dev/articles/a-case-for-properties.html
https://frantic.im/back-to-rails
https://concords.app/blog/what-is-concords
https://raccoon.onyxbits.de/blog/bugreport-free-support/
https://robdobson.com/2020/11/the-10-reasons-i-ripped-out-a-6k-lighting-system/
https://www.observationalhazard.com/2020/11/on-taking-criticism_15.html
https://blog.ceos.io/2020/11/14/why-i-teach-vim/
https://soatok.blog/2020/11/14/going-bark-a-furrys-guide-to-end-to-end-encryption/
http://www.strawpoll.me/22152225
http://www.josiahzayner.com/2020/10/crispr-is-dead.html
http://www.jezzamon.com/fourier/index.html
https://blog.jacopo.io/en/post/apple-ocsp/
https://interrupt.memfault.com/blog/the-best-and-worst-mcu-sdks
https://www.krewast.de/artikel/dont-make-customers-think-about-whether-they-should-pay-you/
https://wesdesilvestro.com/the-prestige-trap
https://rule11.tech/obfuscating-complexity-considered-harmful/
https://www.security-embedded.com/blog/2020/11/14/application-trust-is-hard-but-apple-does-it-well
https://pingr.io/blog/having-170-competitors-is-not-an-obstacle/
https://www.meetleet.com/blog/what-a-great-technical-resume-can-do-for-you
https://acoup.blog/2020/11/13/collections-why-military-history/
https://www.cbs.mpg.de/empathy-and-perspective-taking-how-social-skills-are-built
https://www.andrewdenty.com/blog/2020/07/01/a-visual-comparison-of-macos-catalina-and-big-sur.html
https://pwlconf.org/2019/shriram-krishnamurthi/
https://jae.moe/blog/2020/11/using-matrix-to-replace-proprietary-and-centralized-chat-apps/
https://gurjeet.singh.im/blog/never-use-google-to-sign-in
https://jezenthomas.com/how-i-write-elm-applications/
https://defector.com/virgin-hyperloop-has-invented-the-worlds-crappiest-high-speed-rail/
`
  .trim()
  .repeat(
    process.argv
      .filter((a) => a.includes("--repeat"))
      .reduce((count, val) => parseInt(val.split("=")[1]), 10)
  )
  .split("\n")

const pool = genericPool.createPool(
  generateWorkerFactory<typeof import("./test_worker")>(
    __dirname + "/test_worker.ts"
  ),
  {
    min: process.argv.includes("--prewarm") ? cpus().length - 1 : 0,
    max: cpus().length - 1, // fibonacci: 1 @ 98%, 2 @ 190%, @ 270%, 8 @ 300%
  }
)
pool.on("factoryCreateError", (e) => console.error(e))
;(async () => {
  console.log(`Fetching ${urls.length} urls`)
  const responses = await Promise.all(
    urls.map((url) =>
      got.get(url).then((response) => ({ url, buffer: response.rawBody }))
    )
  )
  console.log(`Retrieved ${urls.length} responses`)
  console.time("process_reponses")
  let [successes, errors] = [0, 0]
  for (const response of responses) {
    const logResult = (result: ReturnType<typeof readablify>) => {
      if (result._tag == "Left") errors++
      else successes++
    }
    if (process.argv.includes("--serial")) {
      const result = await readablify(response.url, response.buffer)
      logResult(result)
    } else {
      pool.acquire().then(async (worker) => {
        const result = await worker.readablify(
          response.url,
          process.argv.includes("--transfer")
            ? Comlink.transfer(response.buffer, [response.buffer.buffer])
            : response.buffer
        )
        logResult(result)
        pool.release(worker)
      })
    }
  }
  // for (let i = 0; i < 10; i++) {
  //   pool
  //     .acquire()
  //     .then(async (worker) => {
  //       console.log(`parent: ${await worker.recursiveFibonacci(45)}`)
  //       pool.release(worker)
  //     })
  // }
  await pool.drain()
  await pool.clear()
  console.log(`Successfully processed ${successes} of ${urls.length} urls`)
  console.timeEnd("process_reponses")
})().catch((e) => {
  console.error("parent:", e)
  process.exit(1)
})
