import got, {
  Response,
  RequestError,
  GotStream,
  Progress,
} from "got/dist/source"
import Request, { PlainResponse } from "got/dist/source/core"

export class ResponseTooBigError extends RequestError {
  constructor(
    public readonly responseSize: number,
    public readonly maxResponseSize: number,
    public readonly request: Request
  ) {
    super(
      `Response size of ${responseSize} exceeded limit of ${maxResponseSize}`,
      {},
      request
    )
  }
}

/**
 * A response from got that only holds raw buffer data.
 */
export interface BufferResponse extends PlainResponse {
  rawBody: Buffer
}

/**
 * Fetch a URL using `got` and optionally set a max response size for the
 * which will terminate the request with a ResponseTooBigError if it is
 * exceeded.
 *
 * @param url
 * @param options
 */
export const fetchBuffer = (
  url: string,
  {
    maxResponseSize = Infinity,
    ...options
  }: {
    maxResponseSize?: number
  } & Parameters<GotStream>[0] = {},
  cb?: (
    err: RequestError | ResponseTooBigError | null,
    response: BufferResponse
  ) => void
) => {
  const data: Uint8Array[] = []
  let response: Response

  const stream = got.stream.get(url, options)
  stream.on("data", (chunk: any) => {
    data.push(chunk)
  })
  stream.on("downloadProgress", (progress: Progress) => {
    const size = Math.max(progress.total ?? 0, progress.transferred)
    if (size > maxResponseSize) {
      stream.destroy()
      if (cb)
        cb(new ResponseTooBigError(size, maxResponseSize, stream), null as any)
    }
  })
  stream.on("error", (err: RequestError) => {
    if (cb) cb(err, null as any)
  })
  stream.on("response", (_response: Response) => {
    response = _response
  })
  stream.on("end", () => {
    if (!response)
      throw new TypeError(
        "Invariant violation in fetchBuffer: the 'response' event should have been called before this 'end' event"
      )
    response.rawBody = Buffer.concat(data)
    if (cb) cb(null, response)
  })
}
