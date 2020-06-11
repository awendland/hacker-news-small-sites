import { parseDate, parseDateTime } from "https://deno.land/std/datetime/mod.ts"
import { getAuthClient } from "./lib/google-auth.ts"

let date = parseDate("20-01-2019", "dd-mm-yyyy")
console.log(date)

const auth = await getAuthClient(Deno.env.toObject() as any, [
  "https://test.com",
])
