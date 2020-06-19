import * as yargs from "yargs"
import fg from "fast-glob"
import { flow, pipe } from "fp-ts/lib/function"
import { readFile, writeFileP, tee, getOrThrow } from "./lib/func"
import * as TE from "fp-ts/lib/TaskEither"
import * as A from "fp-ts/lib/Array"
import * as t from "io-ts"
import { Lens } from "monocle-ts"
import { xml2json, json2xml } from "./lib/xml"
import * as Option from "fp-ts/lib/Option"
import { createFsCache, fromNoOpCache } from "./lib/fs-cache"
import { batchTraverse } from "fp-ts-contrib/lib/batchTraverse"
import * as boolean from "fp-ts/lib/boolean"
import { readablify } from "./lib/readablify"
import { fetchBuffer } from "./lib/fetch"

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
    }).argv

  const readFeed = flow(
    readFile,
    TE.map(flow((b) => b.toString("utf8"), xml2json)),
    TE.chainEitherKW(RssDocument.decode)
  )

  const fetchReadable = (url: string) =>
    pipe(
      TE.taskify(fetchBuffer)(url, {
        maxResponseSize: args.fetchMaxSize,
        timeout: args.fetchTimeout,
      }),
      TE.map((r) => {
        return pipe(
          readablify(url, r.rawBody),
          Option.map((p) => p.content)
        )
      }),
      TE.orElse((e) => {
        console.error(e)
        return TE.right(Option.none as Option.Option<string>)
      })
    )

  const fetchReadableCached = pipe(
    (url: string) =>
      pipe(
        url,
        tee(() => console.log(`Cache miss for ${url}`)),
        fetchReadable,
        TE.map(tee(() => console.log(`Fetched ${url}`))),
        TE.map(
          Option.fold(
            () => Buffer.from("Unable to extract article", "utf8"),
            (s) => Buffer.from(s, "utf8")
          )
        )
      ),
    args.cacheDir ? createFsCache(args.cacheDir) : fromNoOpCache
  )

  const addContentToItems = (item: RssItem) =>
    pipe(
      lens_description.get(item).includes(TAG),
      boolean.fold(
        () =>
          pipe(
            lens_link.get(item),
            fetchReadableCached,
            TE.map((html) =>
              pipe(
                item,
                lens_description.modify(
                  (curDesc) =>
                    `${curDesc}<br/><!-- ${TAG} --><hr/>${html.toString(
                      "utf8"
                    )}`
                )
              )
            )
          ),
        () => TE.right(item)
      )
    )

  const writeFeed = (path: string, data: RssDocument) =>
    pipe(json2xml(data), (xml) => writeFileP(path, xml))

  const updateFeed = (path: string) =>
    pipe(
      readFeed(path),
      TE.chain((feed) =>
        pipe(
          lens_items.get(feed),
          tee((items) =>
            console.group(`Updating ${items.length} items in ${path}...`)
          ),
          (items) =>
            batchTraverse(TE.taskEither)(
              A.chunksOf(args.parallelism)(items),
              addContentToItems
            ),
          TE.map(tee(() => console.groupEnd())),
          TE.map((updatedItems) => lens_items.set(updatedItems)(feed))
        )
      ),
      TE.chainW((updatedFeed) =>
        pipe(
          args.write,
          boolean.fold(
            () => TE.right(undefined),
            () => writeFeed(path, updatedFeed)
          ),
          TE.map(() => updatedFeed)
        )
      )
    )

  const feedPaths = fg.sync([args.feeds]).sort()
  console.group(`Processing ${feedPaths.length} feeds [write=${args.write}]...`)
  getOrThrow(
    await batchTraverse(TE.taskEither)(A.chunksOf(1)(feedPaths), updateFeed)()
  )
  console.groupEnd()
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
