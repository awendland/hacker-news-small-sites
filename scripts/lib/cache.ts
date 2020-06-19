import * as TE from "fp-ts/lib/TaskEither"
import { join } from "path"
import { flow, pipe } from "fp-ts/lib/function"
import { readFile, writeFileP } from "./func"

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
    const bkey = Buffer.from(key).toString("base64")
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
