import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("marsha_fall_scores")
    .select("nickname, score, created_at")
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: "Unable to load leaderboard." }, { status: 500 });
  }

  return NextResponse.json({ scores: data ?? [] });
}
