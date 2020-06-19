import parser from "fast-xml-parser"

/*
 * Manual testing has shown that these options produces an equivalent XML document
 * to the `rss` library, except for the following differences:
 * - No `<?xml>` tag at the start
 * - Empty nodes are represented as `<node />` instead of `<node></node>`
 * - `<![CDATA[` entries begin on newlines, not next to their enclosing tags
 */
export const xmlParseOptions = {
  ignoreAttributes: false,
  ignoreNameSpace: false,
  cdataTagName: "__cdata",
  format: true,
  indentBy: "    ",
}

export const xml2json = (xml: string): any => parser.parse(xml, xmlParseOptions)

const resrap = new parser.j2xParser(xmlParseOptions)

export const json2xml = (json: any): string => resrap.parse(json)
