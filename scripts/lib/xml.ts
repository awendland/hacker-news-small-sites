import parser from "fast-xml-parser"
import he from "he"

const decodeHtmlString = (val: any, opts?: he.DecodeOptions) =>
  typeof val === "string" ? he.decode(val, opts) : val
const encodeHtmlString = (val: any, opts?: he.EncodeOptions) =>
  typeof val === "string" ? he.encode(val, opts) : val

/*
 * Manual testing has shown that these options produces an equivalent XML document
 * to the `rss` library, except for the following differences:
 * - No `<?xml>` tag at the start
 * - Empty nodes are represented as `<node />` instead of `<node></node>`
 * - `<![CDATA[` entries begin on newlines, not next to their enclosing tags
 */
export const xmlParseOptions: parser.X2jOptionsOptional &
  parser.J2xOptionsOptional = {
  ignoreAttributes: false,
  ignoreNameSpace: false,
  cdataTagName: "__cdata",
  format: true,
  indentBy: "    ",
}

export const xml2json = (xml: string): any =>
  parser.parse(xml, {
    ...xmlParseOptions,
    tagValueProcessor: (val) => decodeHtmlString(val),
    attrValueProcessor: (val) =>
      decodeHtmlString(val, { isAttributeValue: true }),
  })

const resrap = new parser.j2xParser({
  ...xmlParseOptions,
  // Need to cast the input to String because sometimes the input may be Number,
  // which is fine to treat as a String in this case but if left as is
  // would cause `he` to throw an error when it uses `a.replace(...)` internally
  // because the `replace` method is only present on Strings.
  tagValueProcessor: (a) => {
    console.log(a)
    if (String(a).includes("PDF-1")) {
      console.log(typeof a)
      console.log(a.slice(0, 1000))
    }
    return encodeHtmlString(a, { useNamedReferences: true })
  },
  attrValueProcessor: (a) => encodeHtmlString(a, { useNamedReferences: true }),
})

export const json2xml = (json: any): string => resrap.parse(json)
