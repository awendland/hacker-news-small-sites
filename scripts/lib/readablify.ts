import * as Option from "fp-ts/lib/Option"
import { JSDOM, VirtualConsole } from "jsdom"
import Readability from "mozilla-readability"
import { pipe, flow } from "fp-ts/lib/function"

const blackholeConsole = new VirtualConsole()

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
  pipe(
    Option.tryCatch(() => {
      const page = new JSDOM(data, { url, virtualConsole: blackholeConsole })
      // Run a simple heuristic to see if the document is a valid webpage or
      // not. This should filter out any resources such as PDFs from trying
      // to be treated as Readability compatible articles.
      if (page.window.document.querySelectorAll("p").length < 1)
        throw new Error(`Unable to find any <p> tags in ${url}`)
      return page
    }),
    Option.chain(
      flow(
        (dom) => new Readability(dom.window.document).parse(),
        Option.fromNullable
      )
    )
  )
