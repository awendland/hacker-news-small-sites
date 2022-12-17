import { initializeApp } from "@firebase/app"
import { getDatabase, ref, get, goOffline } from "@firebase/database"
import fs from "fs/promises"
import got from "got"
import path from "path"
import * as t from "io-ts"
import { getOrThrow } from "./func"
import { PathReporter } from "io-ts/lib/PathReporter"
import * as E from "fp-ts/lib/Either"
import * as Log from "./simple-logger"

/**
 * io-ts type for converting between Date
 */
const DateFromUnixSeconds = new t.Type<Date, number, unknown>(
  "DateFromUnixSeconds",
  (u): u is Date => u instanceof Date,
  (u, c) =>
    typeof u === "number" ? t.success(new Date(u * 1000)) : t.failure(u, c),
  (d) => d.getTime() / 1000
)

export const HNStory = t.type({
  id: t.number,
  by: t.string,
  descendants: t.union([t.number, t.null]),
  score: t.number,
  title: t.string,
  time: DateFromUnixSeconds,
  url: t.string,
})
export type HNStory = t.TypeOf<typeof HNStory>

export const fetchStoriesSince = async (since: Date) => {
  const app = initializeApp({
    databaseURL: "https://hacker-news.firebaseio.com",
  })
  const database = getDatabase(app)
  const latestItemId = (await get(ref(database, "v0/maxitem"))).val()
  Log.group(Log.LogLevel.INFO)
  Log.info("[Firebase HN]")
  try {
    Log.info("Most recent item ID:", latestItemId)
    const storiesSince: HNStory[] = []
    let itemId = latestItemId
    const sinceSec = Math.floor(since.getTime() / 1000)
    const batchSize = 5000
    do {
      const itemIds = Array.from({ length: batchSize }, (_, i) => itemId - i)
      itemId = itemIds[itemIds.length - 1] - 1
      const itemRefs = itemIds.map((id) => ref(database, `v0/item/${id}`))
      const itemGets = itemRefs.map((ref) => get(ref))
      const itemSnapshots = await Promise.all(itemGets)
      const items = itemSnapshots.map((snap) => snap.val())
      const itemsSince = items.filter((item) => item.time >= sinceSec)
      const newStoriesSince = itemsSince
        .filter(
          (item) => item && item.type === "story" && !item.dead && item.url
        )
        .map((r) =>
          getOrThrow(
            HNStory.decode(r),
            (e) => new Error(PathReporter.report(E.left(e)).join("\n"))
          )
        )
      storiesSince.push(...newStoriesSince)
      Log.info(
        `retrieved: ${newStoriesSince.length} stories / ${itemsSince.length} items, next item ID: ${itemId}`
      )
      if (items.length != itemsSince.length) break
      if (storiesSince.length == 0) break
    } while (storiesSince[storiesSince.length - 1].time > since)
    goOffline(database)
    return storiesSince
  } finally {
    Log.groupEnd(Log.LogLevel.INFO)
  }
}

export async function getTopDomains(cacheDir: string | null) {
  Log.group(Log.LogLevel.INFO)
  try {
    Log.info("[Majestic Millions]")
    if (cacheDir) await fs.mkdir(cacheDir, { recursive: true }).catch(() => {})
    const cachePath = cacheDir && path.join(cacheDir, "majestic_millions.csv")
    let csv: string
    try {
      Log.trace(`Checking for cached top sites at "${cachePath}"`)
      if (cachePath) csv = (await fs.readFile(cachePath)).toString("utf8")
      else throw "no cache"
    } catch (e) {
      Log.info("Cache miss. Downloading top sites from majestic.com")
      const downloadData = await got(
        "https://downloads.majestic.com/majestic_million.csv"
      ).buffer()
      csv = downloadData.toString("utf8")
      Log.trace(`Saving ${downloadData.length} bytes to "${cachePath}"`)
      if (cachePath) await fs.writeFile(cachePath, downloadData)
    }
    if (!csv) throw Error("Unable to retrieve majestic_millions.csv")
    const lines = csv.split("\n")
    const header = lines[0].split(",")
    const domainIndex = header.indexOf("Domain")
    if (domainIndex === -1) {
      throw new Error("Could not find 'Domain' column in majestic_millions.csv")
    }
    return lines.slice(1).map((line) => line.split(",")[domainIndex])
  } finally {
    Log.groupEnd(Log.LogLevel.INFO)
  }
}

export const selectSmallSiteStoriesSince = async ({
  since,
  minScore,
  millionsCacheDir,
  log,
}: {
  since: Date
  minScore: number
  millionsCacheDir: string | null
  log?: boolean
}) => {
  const storiesSince = await fetchStoriesSince(since, log)
  const topSites = new Set(await getTopDomains(millionsCacheDir, log))
  return storiesSince.filter(
    (s) =>
      s.score >= minScore &&
      // THe majestic millions list only has the two top level domains
      !topSites.has(new URL(s.url).hostname.split(".").slice(-2).join("."))
  )
}
