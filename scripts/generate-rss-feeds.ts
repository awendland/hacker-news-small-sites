import * as fs from "fs"
import * as fsp from "fs/promises"
import * as path from "path"
import { Readable } from "stream"
import * as yargs from "yargs"
import { BigQuery } from "@google-cloud/bigquery"
import RSS from "rss"
import {
  LocalDate,
  ZoneId,
  LocalDateTime,
  LocalTime,
  convert,
} from "@js-joda/core"
import "@js-joda/timezone"
import * as t from "io-ts"
import { PathReporter } from "io-ts/lib/PathReporter"
import { pipe } from "fp-ts/lib/pipeable"
import * as E from "fp-ts/lib/Either"
import { readStream } from "./lib/stream"
import * as queries from "./lib/queries"
import { getOrThrow } from "./lib/func"
import { SmallSiteStory } from "./lib/queries"

export const FeedConfiguration = t.type({
  minScore: t.number,
  outFile: t.string,
  rssMeta: t.type({
    title: t.string,
    description: t.string,
    managingEditor: t.string,
    feed_url: t.string,
    site_url: t.string,
    image_url: t.union([t.string, t.undefined]),
    ttl: t.number,
    language: t.string,
  }),
})
export type FeedConfiguration = t.TypeOf<typeof FeedConfiguration>

const urlHasPath = (url: string) => new URL(url).pathname.length > 1

export async function* generateRssFeeds({
  queryRunner,
  feedConfigs,
  maxStoryAge,
  allowBareDomains,
  hackerNewsTable,
  topSitesTable,
}: {
  queryRunner: (q: string) => Promise<any[]>
  feedConfigs: Iterable<FeedConfiguration>
  allowBareDomains: boolean
  maxStoryAge: number
  hackerNewsTable: string
  topSitesTable: string
}) {
  const since = convert(
    LocalDateTime.of(
      LocalDate.now(ZoneId.of("America/Los_Angeles")).minusDays(maxStoryAge),
      LocalTime.MIDNIGHT
    )
  ).toDate()
  console.log(`Retrieving stories since ${since.toISOString()}`)

  const rows = await queryRunner(
    // TODO log query when verbose logging is on (eg. during CI)
    queries.selectSmallSiteStoriesSince({
      since,
      minScore: 1,
      hackerNewsTable,
      topSitesTable,
    })
  )

  console.group("RSS feeds:")
  for (const config of feedConfigs) {
    const pubDate = new Date()
    const rss = new RSS({ ...config.rssMeta, pubDate })
    const items = rows
      .map((r) =>
        getOrThrow(
          SmallSiteStory.decode(r),
          (e) => new Error(PathReporter.report(E.left(e)).join("\n"))
        )
      )
      .filter((s) => s.score > config.minScore)
      .filter((s) => allowBareDomains || urlHasPath(s.url))
    console.log(`${config.rssMeta.title} has ${items.length} items`)
    items.forEach((sss) =>
      rss.item({
        title: sss.title,
        description: `
Score ${sss.score} | Comments ${
          sss.descendants
        } (<a href="https://news.ycombinator.com/item?id=${
          sss.id
        }">thread link</a>) | @${sss.by}
<br/>
${sss.timestamp.toLocaleDateString("en-US", {
  timeZone: "America/Los_Angeles",
  month: "long",
  year: "numeric",
  day: "numeric",
})} | ${sss.url} | <a href="https://web.archive.org/web/*/${
          sss.url
        }">archive.org</a>
`,
        url: sss.url,
        guid: `hacker-news-small-sites-${sss.id}`,
        date: sss.timestamp,
      })
    )
    yield {
      config,
      xml: rss.xml({ indent: true }),
    }
  }
  console.groupEnd()
}

export async function run() {
  const args = yargs
    .option("config", {
      alias: "c",
      type: "string",
      description: "path to feed configurations file, or '-' for stdin",
    })
    .demandOption("config")
    .option("googleProjectId", {
      alias: "google-project-id",
      type: "string",
      description: "id of the project to run the bigquery in",
    })
    .option("hackerNewsTable", {
      alias: "hn-table",
      type: "string",
      description: "name of the bigquery hacker news full table to use",
      default: "bigquery-public-data.hacker_news.full",
    })
    .option("topSitesTable", {
      alias: "top-sites-table",
      type: "string",
      description:
        "name of the bigquery top-sites table to use (must have a 'domain' column)",
      default: `hacker-news-small-sites.top_sites.majestic_million`,
    })
    .option("maxStoryAge", {
      type: "number",
      description:
        "how many days back should stories be retrieved from (eg. '3' would mean fetch stories from the last 3 days)",
      default: 3,
    })
    .option("allowBareDomains", {
      type: "boolean",
      description:
        "bare domain articles (ie. URLs without a path) are removed as a heuristic to avoid non-blog posts",
      default: false,
    }).argv

  const readFeedConfigs = async (stream: Readable) =>
    getOrThrow(
      pipe(
        await readStream(stream),
        (b) => b.toString("utf8"),
        JSON.parse,
        t.array(FeedConfiguration).decode,
        E.map((cs) =>
          cs.map((c) => ({ ...c, outFile: path.resolve(c.outFile) }))
        )
      ),
      (e) => new Error(e.join("\n"))
    )

  const bigquery = new BigQuery()
  const feedConfigs = await pipe(
    args.config === "-" ? process.stdin : fs.createReadStream(args.config),
    readFeedConfigs
  )

  for await (const feed of generateRssFeeds({
    queryRunner: queries.runQuery(bigquery),
    feedConfigs,
    ...args,
  })) {
    await fsp.mkdir(path.dirname(feed.config.outFile), { recursive: true })
    await fsp.writeFile(feed.config.outFile, feed.xml, "utf8")
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
