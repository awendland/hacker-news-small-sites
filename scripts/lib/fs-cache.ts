import * as TE from "fp-ts/lib/TaskEither"
import { join } from "path"
import { flow, pipe } from "fp-ts/lib/function"
import { readFile, writeFileP } from "./func"
import * as crypto from "crypto"

/**
 * Create a cache that stores key, value pairs in files named by the
 * base64 encoding of the key.
 *
 * @param cacheDir
 */
export const createFsCache = (cacheDir: string) => <ME>(
  onMiss: (key: string) => TE.TaskEither<ME, Buffer>
) =>
  /**
   * Retrieve an item from the cache, or if the item isn't present,
   * generate the value and save it to the cache before returning it.
   *
   * @param key
   */
  function fromFsCache(
    key: string
  ): TE.TaskEither<ME | NodeJS.ErrnoException, Buffer> {
    // Using the sha1 could result in returning the wrong entry for a given
    // key, and since there is no likely no metadata being stored with the
    // cache entry to make sure it's the right one, it is possible that
    // incorrect data could be returned and used for a given key. Since this
    // is unlikely to occur (the chance of a sha1 collision is very low) we're
    // ignoring the issue for the time being.
    const bkey = crypto.createHash("sha1").update(key).digest("hex")
    const cachePath = join(cacheDir, bkey)
    return pipe(
      readFile(cachePath),
      TE.orElse(
        flow(
          () => onMiss(key),
          TE.chainW((freshValue: Buffer) =>
            pipe(
              writeFileP(cachePath, freshValue),
              TE.map(() => freshValue)
            )
          )
        )
      )
    )
  }

export const fromNoOpCache = <ME>(
  onMiss: (key: string) => TE.TaskEither<ME, Buffer>
) => (key: string): TE.TaskEither<ME | unknown, Buffer> => onMiss(key)
