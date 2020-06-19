import * as E from "fp-ts/lib/Either"
import * as TE from "fp-ts/lib/TaskEither"
import * as fs from "fs"
import { dirname } from "path"
import { pipe } from "fp-ts/lib/function"

/**
 * Tap into a pipe and run a function that won't modify the values
 * @param f
 */
export const tee = <T>(f: (t: T) => void) => (t: T): T => {
  f(t)
  return t
}

/**
 * Unwrap the right side of an Either (the "success" side), or throw the left side (optionally
 * processing the left side using `toError` if provided).
 *
 * @param e
 * @param toError
 */
export const getOrThrow = <L, R, E extends Error>(
  e: E.Either<L, R>,
  toError?: (l: L) => E
): R => {
  if (E.isRight(e)) return e.right
  throw toError ? toError(e.left) : e.left
}

export const readFile = TE.taskify(fs.readFile)

export const writeFile = TE.taskify(fs.writeFile)

export const fs_mkdirp = (
  path: fs.PathLike,
  callback: (err: NodeJS.ErrnoException | null, path: string) => void
) => fs.mkdir(path, { recursive: true }, callback)

export const mkdirp = TE.taskify(fs_mkdirp)

export const writeFileP = (
  path: string,
  data: string | NodeJS.ArrayBufferView
) =>
  pipe(
    mkdirp(dirname(path)),
    TE.chain(() => writeFile(path, data))
  )
