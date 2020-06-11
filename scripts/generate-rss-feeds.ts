import * as yargs from "yargs"
import { BigQuery } from "@google-cloud/bigquery"
import * as queries from "./lib/queries"
import { Instant } from "@js-joda/core"
import * as t from "io-ts"
import { pipe } from "fp-ts/lib/pipeable"
import RSS from "rss"
import * as fs from "fs/promises"
import * as path from "path"
import TE from "fp-ts/lib/TaskEither"
import E, { left } from "fp-ts/lib/Either"
import { flow } from "fp-ts/lib/function"
import {
  fromPromise,
  fromThunk,
  getOrThrow,
  getOrThrowTask,
  fromFunc,
  fromPromiseThunk,
} from "./lib/func"
import { ReadStream } from "fs"
import { Readable } from "stream"

const FeedConfiguration = t.type({
  minScore: t.number,
  outFile: t.string,
})
type FeedConfiguration = t.TypeOf<typeof FeedConfiguration>

async function* generateRssFeeds({
  bigquery,
  feedConfigs,
}: {
  bigquery: BigQuery
  feedConfigs: Iterable<FeedConfiguration>
}) {
  console.group("BigQuery:")
  const [job] = await bigquery.createQueryJob({
    query: queries.selectSmallSitesSince({
      since: Instant.now(),
      minScore: 1,
      topSitesTable: `hacker-news-small-sites.top_sites.majestic_million_latest`, // TODO process.env
    }),
    location: "US",
  })
  console.log(`Job ${job.id} started at ${new Date().toISOString()}`)

  const [rows] = await job.getQueryResults()
  console.log(`Job ${job.id} finished at ${new Date().toISOString()}`)
  console.groupEnd()

  for (const config of feedConfigs) {
    const rss = new RSS({})
    for (const row of rows) {
      rss.item({})
    }
    yield {
      config,
      xml: rss.xml(),
    }
  }
}

if (require.main === module) {
  async function run() {
    const args = yargs
      .option("config", {
        alias: "c",
        type: "string",
        description: "path to feed configurations file",
      })
      .demandOption("config").argv

    const readStream = (stream: Readable) =>
      new Promise((res: (b: Buffer) => void, rej) => {
        const data: Uint8Array[] = []
        stream.on("data", (chunk) => data.push(chunk))
        stream.on("end", () => res(Buffer.from(data)))
        stream.on("error", rej)
      })

    const readStreamTask = fromPromise(readStream)

    const readConfig = flow(
      readStreamTask,
      TE.chainEitherK(
        flow(
          fromFunc((b) => b.toString("utf8")),
          fromFunc(JSON.parse),
          t.array(FeedConfiguration).decode,
          E.map((cs) =>
            cs.map((c) => ({ ...c, outFile: path.resolve(c.outFile) }))
          ),
          E.mapLeft(E.toError)
        )
      ),
      getOrThrowTask()
    )

    const feedConfigs = await pipe(
      fromPromiseThunk(() => fs.readFile(args.config, { encoding: "utf8" })),
      TE.chainEitherK(
        flow(
          fromFunc(JSON.parse),
          t.array(FeedConfiguration).decode,
          E.map((cs) =>
            cs.map((c) => ({ ...c, outFile: path.resolve(c.outFile) }))
          ),
          E.mapLeft(E.toError)
        )
      ),
      getOrThrowTask()
    )()

    const bigquery = new BigQuery()

    for await (const feed of generateRssFeeds({ bigquery, feedConfigs })) {
      await fs.writeFile(feed.config.outFile, feed.xml, "utf8")
    }
  }
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
