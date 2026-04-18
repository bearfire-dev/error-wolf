import { NextResponse } from "next/server"

export async function POST(request: Request) {
  let apiKey: string | undefined
  try {
    const body = (await request.json()) as { apiKey?: unknown }
    apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    )
  }

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "missing_key" },
      { status: 400 }
    )
  }

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return NextResponse.json({ ok: upstream.ok })
  } catch {
    return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 })
  }
}
