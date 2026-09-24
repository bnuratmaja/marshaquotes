import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 12) : "";
    const score = typeof body.score === "number" ? Math.floor(body.score) : -1;

    if (!nickname || score < 0 || score > 999999) {
      return NextResponse.json({ error: "Invalid score." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("marsha_fall_scores")
      .insert({ nickname, score });

    if (error) {
      return NextResponse.json({ error: "Unable to save score." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
