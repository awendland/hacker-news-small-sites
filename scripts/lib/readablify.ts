import * as E from "fp-ts/lib/Either"
import { JSDOM, VirtualConsole } from "jsdom"
import Readability from "mozilla-readability"

const blackholeConsole = new VirtualConsole()

export class NotAnArticleError extends Error {}

export class NotReadableError extends Error {}

/**
 * Use mozilla/readability with JSDOM to create a readable version of
 * the given document, or None if the document couldn't be converted.
 *
 * Any non-fatal JSDOM parsing errors will be silently ignored.
 *
 * @param url
 * @param data
 */
export const readablify = (url: string, data: Buffer) =>
  E.tryCatch(
    () => {
      const page = new JSDOM(data, { url, virtualConsole: blackholeConsole })
      // Run a simple heuristic to see if the document is a valid webpage or
      // not. This should filter out any resources such as PDFs from trying
      // to be treated as Readability compatible articles.
      if (page.window.document.querySelectorAll("p").length < 1)
        throw new NotAnArticleError(`Unable to find any <p> tags in ${url}`)

      const parsed = new Readability(page.window.document).parse()
      if (!parsed)
        throw new NotReadableError(
          `Unable to create a readable version of ${url}`
        )
      return parsed
    },
    (e) => e as NotAnArticleError | NotReadableError | Error
  )
