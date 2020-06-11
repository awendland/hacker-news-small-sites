import { Instant } from "@js-joda/core"

export const selectSmallSitesSince = ({
  since,
  minScore,
  topSitesTable,
  hackerNewsTables = "bigquery-public-data.hacker_news.full",
}: {
  since: Instant
  minScore?: number
  topSitesTable: string
  hackerNewsTables?: string
}) => `#standardSQL
  WITH
    small_site_stories AS (
    SELECT
      REGEXP_EXTRACT((REGEXP_EXTRACT(post.url,'https?://([^/]+)')),'([^\\.]+\\.[^\\.]+(?:\\.[a-zA-Z].)?)$') AS domain,
      post.score,
      post.title,
      post.timestamp,
      post.url,
    FROM
      \`${hackerNewsTables}\` AS post
    WHERE
      post.url IS NOT NULL
      AND post.type = 'story'
      AND post.score >= ${minScore}
      AND post.timestamp >= ${since.toISOString()}
    )
  SELECT
    sss.score,
    sss.title,
    sss.timestamp,
    sss.url
  FROM
    small_site_stories sss
  LEFT JOIN
    \`${topSitesTable}\` ts
  ON
    sss.domain = ts.domain
  WHERE
    ts.domain IS NULL
  ORDER BY
    3 DESC`
