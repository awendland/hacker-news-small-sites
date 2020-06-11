import * as TE from "fp-ts/lib/TaskEither"
import * as E from "fp-ts/lib/Either"
import { Lazy } from "fp-ts/lib/function"

/**
 * Like TaskEither.tryCatch but with TaskEither.toError set as the onLeft handler.
 * @param f
 */
export const fromPromiseThunk = <A>(f: Lazy<Promise<A>>) =>
  TE.tryCatch(f, E.toError)

/**
 * Convert a standard error throwing promise into a function that return Either instead.
 * @param f
 */
export const fromPromise = <A extends any[], R>(f: (...a: A) => Promise<R>) => (
  ...args: A
) =>
  TE.tryCatch(
    () => f(...args),
    (e) => e as Error
  )

/**
 * Convert a standard error throwing promise into a function that return Either instead.
 * @param f
 */
export const fromPromiseE = <A extends any[], R>(
  f: (...a: A) => Promise<R>
) => (...args: A) => TE.tryCatch(() => f(...args), E.toError)

/**
 * Like Either.tryCatch but with Either.toError set as the onLeft handler.
 * @param f
 */
export const fromThunk = <A>(f: Lazy<A>) => E.tryCatch(f, E.toError)

/**
 * Convert a standard error throwing function into a function that return Either instead.
 * @param f
 */
export const fromFunc = <A extends any[], R>(f: (...a: A) => R) => (
  ...args: A
) => E.tryCatch(() => f(...args), E.toError)

export const getOrThrow = <E, A>() =>
  E.getOrElse<E, A>((e) => {
    throw e
  })

export const getOrThrowTask = <E, A>() =>
  TE.getOrElse<E, A>((e) => {
    throw e
  })
