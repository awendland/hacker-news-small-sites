import { BigQuery, BigQueryTimestamp } from "@google-cloud/bigquery"
import * as t from "io-ts"

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

/**
 * Run a query with the provided BigQuery instance. Optionally log operations as they occur.
 * @param bigquery
 */
export const runQuery = (bigquery: BigQuery) => async (
  query: string,
  log = true
) => {
  if (log) console.group("BigQuery:")
  if (log) console.log(`Job[TBD] queued at ${new Date().toISOString()}`)
  const [job] = await bigquery.createQueryJob({
    query,
    location: "US",
  })
  const startTime = Date.now()
  if (log) console.log(`Job[${job.id}] started`)

  const [rows] = await job.getQueryResults()
  if (log) console.log(`Job[${job.id}] finished in ${Date.now() - startTime}ms`)
  if (log) console.groupEnd()
  return rows
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
  score: t.number,
  title: t.string,
  timestamp: DateFromBigQueryTimestamp,
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
      post.*
    FROM
      \`${hackerNewsTable}\` AS post
    WHERE
      post.url IS NOT NULL
      AND post.type = 'story'
      AND post.score >= ${minScore}
      AND post.timestamp >= '${since.toISOString()}'
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
