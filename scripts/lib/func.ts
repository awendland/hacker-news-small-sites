import * as E from "fp-ts/lib/Either"

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
