import * as E from "fp-ts/lib/Either"
import Readability from "mozilla-readability"
// const JSDOMParser = require("mozilla-readability/JSDOMParser.js")
// import parse5 from "parse5"
import * as HTMLParser from "node-html-parser"

// const blackholeConsole = new VirtualConsole()

export class NotAnArticleError extends Error {}

export class NotReadableError extends Error {}

var Document = function (url: string, html: HTMLElement) {
  this.documentURI = url;
  this.styleSheets = [];
  this.childNodes = [];
  this.children = [html];
};

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
      console.warn(`JSDOM start for ${url}`)
      // const page = new JSDOM(data, { url, virtualConsole: blackholeConsole })
      // console.log(JSDOMParser)
      // const jsdom = new JSDOMParser()
      // const page = jsdom.parse(parse5.serialize(parse5.parse(data.toString('utf-8' /* TODO correctly detect this */))))
      const page = HTMLParser.parse(data.toString("utf-8"))
      const document =  Document(url, page)
      // Run a simple heuristic to see if the document is a valid webpage or
      // not. This should filter out any resources such as PDFs from trying
      // to be treated as Readability compatible articles.
      if (document.querySelectorAll("p").length < 1)
        throw new NotAnArticleError(`Unable to find any <p> tags in ${url}`)

      console.warn(`Readability start for ${url}`)
      const parsed = new (Readability as any).Readability(document as any).parse()
      console.warn(`Readability end for ${url}`)
      if (!parsed)
        throw new NotReadableError(
          `Unable to create a readable version of ${url}`
        )
      return parsed
    },
    (e) => e as NotAnArticleError | NotReadableError | Error
  )
