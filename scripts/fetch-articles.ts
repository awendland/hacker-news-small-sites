import * as yargs from "yargs"
import fg from "fast-glob"
import { flow, pipe } from "fp-ts/lib/function"
import { readFile, writeFileP, tee, getOrThrow } from "./lib/func"
import * as TE from "fp-ts/lib/TaskEither"
import * as A from "fp-ts/lib/Array"
import * as t from "io-ts"
import { Lens } from "monocle-ts"
import { xml2json, json2xml } from "./lib/xml"
import { createFsCache, fromNoOpCache } from "./lib/fs-cache"
import { batchTraverse } from "fp-ts-contrib/lib/batchTraverse"
import * as E from "fp-ts/lib/Either"
import * as Log from "./lib/simple-logger"
import {
  readablify,
  NotAnArticleError,
  NotReadableError,
} from "./lib/readablify"
import { fetchBuffer } from "./lib/fetch"
import { RequestError } from "got/dist/source"

export const CDATA = t.type({
  __cdata: t.string,
})

export const RssItem = t.type({
  description: CDATA,
  link: t.string,
})
export type RssItem = t.TypeOf<typeof RssItem>

export const RssChannel = t.type({
  item: t.array(RssItem),
})

export const RssFeed = t.type({
  channel: RssChannel,
})

export const RssDocument = t.type({
  rss: RssFeed,
})
export type RssDocument = t.TypeOf<typeof RssDocument>

export const lens_items = Lens.fromPath<t.TypeOf<typeof RssDocument>>()([
  "rss",
  "channel",
  "item",
])

export const lens_link = Lens.fromPath<t.TypeOf<typeof RssItem>>()(["link"])

export const lens_description = Lens.fromPath<t.TypeOf<typeof RssItem>>()([
  "description",
  "__cdata",
])

const TAG = `hnss:readable-content`

export async function run() {
  const args = yargs
    .option("feeds", {
      alias: "f",
      type: "string",
      description:
        "glob pattern identifying the feeds that should be processed",
    })
    .demandOption("feeds")
    .option("cacheDir", {
      alias: "c",
      type: "string",
      description:
        "directory where downloaded articles can be cached (no caching occurs if not specified)",
    })
    .option("write", {
      type: "boolean",
      description:
        "if false the articles will be fetched and processed but the feed files will not be updated (eg. cache may be updated)",
      default: false,
    })
    .option("fetchTimeout", {
      type: "number",
      description:
        "max number of milliseconds to wait while fetching a request before failing that entry",
      default: 5000,
    })
    .option("fetchMaxSize", {
      type: "number",
      description:
        "max size (in bytes) that a fetched page can be, otherwise that entry will be failed",
      defaults: 5 * 1024 * 1024,
    })
    .option("parallelism", {
      alias: "j",
      type: "number",
      description: "number of parallel fetch requests to run at once",
      default: 20,
    })
    .option("logLevel", {
      description: "verbosity of logging output",
      choices: Object.keys(Log.LogLevel),
      default: "INFO",
    }).argv

  Log.setLevelByString(args.logLevel)

  const readFeed = flow(
    readFile,
    TE.chainEitherKW(
      flow(
        (b) => b.toString("utf8"),
        (xmlStr) =>
          E.tryCatch(
            () => xml2json(xmlStr),
            (e) => e as Error
          ),
        E.chainW(RssDocument.decode)
      )
    )
  )

  const fetchReadable = (url: string) =>
    pipe(
      TE.taskify(fetchBuffer)(url, {
        maxResponseSize: args.fetchMaxSize,
        timeout: args.fetchTimeout,
      }),
      TE.chainEitherK((r) => {
        return pipe(
          readablify(url, r.rawBody),
          E.map((p) => p.content)
        )
      }),
      TE.orElse((e) => {
        if (e instanceof NotAnArticleError || e instanceof NotReadableError)
          Log.info(String(e))
        else Log.info(e)
        if (e instanceof RequestError)
          return TE.right("Unable to retrieve article")
        return TE.right("Unable to extract article")
      })
    )

  const fetchReadableCached = pipe(
    (url: string) =>
      pipe(
        url,
        tee(() => Log.info(`Fetching ${url}`)),
        fetchReadable,
        TE.map(tee(() => Log.trace(`Parsed ${url}`))),
        TE.map((s) => Buffer.from(s, "utf8"))
      ),
    args.cacheDir ? createFsCache(args.cacheDir) : fromNoOpCache
  )

  const addContentToItems = (item: RssItem) => {
    if (lens_description.get(item).includes(TAG)) {
      Log.trace(`No updated needed for ${item.link}`)
      return TE.right(item)
    }
    return pipe(
      lens_link.get(item),
      fetchReadableCached,
      TE.map((html) =>
        pipe(
          item,
          lens_description.modify(
            (curDesc) =>
              `${curDesc}<br/><!-- ${TAG} --><hr/>${html.toString("utf8")}`
          )
        )
      )
    )
  }

  const writeFeed = (path: string, data: RssDocument) =>
    pipe(
      TE.fromEither(
        E.tryCatch(
          () => json2xml(data),
          (e) => e
        )
      ),
      TE.chainW((xml) => writeFileP(path, xml))
    )

  const updateFeed = (path: string) =>
    pipe(
      readFeed(path),
      TE.chain((feed) =>
        pipe(
          lens_items.get(feed),
          tee((items) =>
            Log.group(
              Log.LogLevel.INFO,
              `Updating ${items.length} items in ${path}...`
            )
          ),
          (items) =>
            batchTraverse(TE.taskEither)(
              A.chunksOf(args.parallelism)(items),
              addContentToItems
            ),
          TE.bimap(
            tee(() => Log.groupEnd(Log.LogLevel.INFO)),
            tee(() => Log.groupEnd(Log.LogLevel.INFO))
          ),
          TE.map((updatedItems) => lens_items.set(updatedItems)(feed))
        )
      ),
      TE.chainW((updatedFeed) =>
        pipe(
          args.write ? writeFeed(path, updatedFeed) : TE.right(undefined),
          TE.map(() => ({ path, updatedFeed }))
        )
      )
    )

  const feedPaths = fg.sync([args.feeds]).sort()
  Log.group(
    Log.LogLevel.INFO,
    `Processing ${feedPaths.length} feeds [write=${args.write}]...`
  )
  for (const feedPath of feedPaths) {
    getOrThrow(await updateFeed(feedPath)())
  }
  Log.groupEnd(Log.LogLevel.INFO)
  Log.info(`Done`)
  // TODO a silent exit occurs sometimes at very high levels of parallelism
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
