import { BigQuery, BigQueryTimestamp } from "@google-cloud/bigquery"
import * as t from "io-ts"
import { getOrThrow } from "./func"
import { PathReporter } from "io-ts/lib/PathReporter"
import * as E from "fp-ts/lib/Either"
import * as Log from "./simple-logger"

/**
 * io-ts type for converting between Date
 */
const DateFromBigQueryTimestamp = new t.Type<Date, BigQueryTimestamp, unknown>(
  "DateFromBigQueryTimestamp",
  (u): u is Date => u instanceof Date,
  (u, c) =>
    u instanceof BigQueryTimestamp
      ? t.success(new Date(u.value))
      : t.failure(u, c),
  (d) => new BigQueryTimestamp(d)
)

export const HNStory = t.type({
  id: t.number,
  by: t.string,
  descendants: t.union([t.number, t.null]),
  score: t.number,
  title: t.string,
  time: DateFromBigQueryTimestamp,
  url: t.string,
})
export type HNStory = t.TypeOf<typeof HNStory>

/**
 * Run a query with the provided BigQuery instance. Optionally log operations as they occur.
 * @param bigquery
 */
export const runQuery = (bigquery: BigQuery) => async (query: string) => {
  Log.group(Log.LogLevel.INFO)
  Log.info(`Job[TBD] queued at ${new Date().toISOString()}`)
  const [job] = await bigquery.createQueryJob({
    query,
    location: "US",
  })
  const startTime = Date.now()
  Log.info(`Job[${job.id}] started`)

  const [rows] = await job.getQueryResults()
  Log.info(`Job[${job.id}] finished in ${Date.now() - startTime}ms`)
  Log.groupEnd(Log.LogLevel.INFO)
  return rows.map((r) =>
    getOrThrow(
      HNStory.decode(r),
      (e) => new Error(PathReporter.report(E.left(e)).join("\n"))
    )
  )
}

export const genSelectFor = <P extends t.Props>(
  T: t.TypeC<P>,
  sqlName: string
) =>
  Object.keys(T.props)
    .map((k) => `\`${sqlName}\`.\`${k}\``)
    .join(", ")

export const SmallSiteStory = t.type({
  id: t.number,
  by: t.string,
  descendants: t.union([t.number, t.null]),
  score: t.number,
  title: t.string,
  time: DateFromBigQueryTimestamp,
  url: t.string,
})

export const selectSmallSiteStoriesSince = ({
  since,
  minScore,
  hackerNewsTable,
  topSitesTable,
}: {
  since: Date
  minScore: number
  hackerNewsTable: string
  topSitesTable: string
}) => `#standardSQL
  WITH
    small_site_stories AS (
    SELECT
      REGEXP_EXTRACT((REGEXP_EXTRACT(post.url,'https?://([^/]+)')),'([^\\\\.]+\\\\.[^\\\\.]+(?:\\\\.[a-zA-Z].)?)$') AS domain,
      post.*,
      post.timestamp as time,
    FROM
      \`${hackerNewsTable}\` AS post
    WHERE
      post.url IS NOT NULL
      AND post.type = 'story'
      AND post.score >= ${minScore}
      AND post.timestamp >= '${since.toISOString()}'
      AND dead IS NOT true
    )
  SELECT ${genSelectFor(SmallSiteStory, "sss")}
  FROM
    small_site_stories sss
  LEFT JOIN
    \`${topSitesTable}\` ts
  ON
    sss.domain = ts.domain
  WHERE
    ts.domain IS NULL
  ORDER BY
    \`timestamp\` DESC`
