"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

type Thing = { id: number; x: number; y: number; size: number; speed: number; kind: "rock" | "box" | "cloud" };
type Snack = { id: number; x: number; y: number; speed: number };
type HeartPickup = { id: number; x: number; y: number; speed: number };

const W = 320;
const H = 520;
const PLAYER = 24;
const SPEED = 220;
const FALL_Y = 92;
const SPEED_STEP = 0.35;

export default function Game() {
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(3);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [closed, setClosed] = useState(false);
  const [things, setThings] = useState<Thing[]>([]);
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [heartPickups, setHeartPickups] = useState<HeartPickup[]>([]);
  const [nickname, setNickname] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ nickname: string; score: number }[]>([]);

  const x = useRef(W / 2 - PLAYER / 2);
  const keys = useRef({ left: false, right: false });
  const thingsRef = useRef<Thing[]>([]);
  const snacksRef = useRef<Snack[]>([]);
  const heartsRef = useRef<HeartPickup[]>([]);
  const scoreRef = useRef(0);
  const hpRef = useRef(3);
  const running = useRef(false);
  const last = useRef(0);
  const spawn = useRef(0);
  const snackSpawn = useRef(0);
  const heartSpawn = useRef(0);
  const id = useRef(1);
  const frame = useRef<number | null>(null);

  const reset = useCallback(() => {
    x.current = W / 2 - PLAYER / 2;
    keys.current = { left: false, right: false };
    thingsRef.current = [];
    snacksRef.current = [];
    heartsRef.current = [];
    scoreRef.current = 0;
    hpRef.current = 3;
    last.current = 0;
    spawn.current = 0;
    snackSpawn.current = 0;
    heartSpawn.current = 0;
    setScore(0);
    setHp(3);
    setThings([]);
    setSnacks([]);
    setHeartPickups([]);
    setOver(false);
    setStarted(true);
    setClosed(false);
    running.current = true;
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); keys.current.left = true; }
      if (e.key === "ArrowRight") { e.preventDefault(); keys.current.right = true; }
      if (e.key.toLowerCase() === "r" && over) reset();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keys.current.left = false;
      if (e.key === "ArrowRight") keys.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [over, reset]);

  useEffect(() => {
    if (!started) return;

    const hit = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
      ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

    const loop = (now: number) => {
      if (!running.current) return;
      if (!last.current) last.current = now;
      const dt = Math.min((now - last.current) / 1000, 0.05);
      last.current = now;

      const difficulty = 1 + Math.floor(scoreRef.current / 100) * SPEED_STEP;
      if (keys.current.left) x.current -= SPEED * dt;
      if (keys.current.right) x.current += SPEED * dt;
      x.current = Math.max(4, Math.min(W - PLAYER - 4, x.current));

      spawn.current += dt;
      snackSpawn.current += dt;
      heartSpawn.current += dt;

      if (spawn.current > Math.max(0.24, 0.68 - difficulty * 0.14)) {
        spawn.current = 0;
        const size = 18 + Math.floor(Math.random() * 9);
        thingsRef.current.push({
          id: id.current++,
          x: 8 + Math.random() * (W - size - 16),
          y: H + size,
          size,
          speed: 175 * difficulty + Math.random() * 65 + difficulty * 22,
          kind: Math.random() > 0.5 ? "rock" : "box",
        });
      }

      if (snackSpawn.current > 4.5) {
        snackSpawn.current = 0;
        snacksRef.current.push({
          id: id.current++,
          x: 8 + Math.random() * (W - 26),
          y: H + 20,
          speed: 145 * difficulty,
        });
      }
      if (heartSpawn.current > 3.8 && hpRef.current < 3) {
        heartSpawn.current = 0;
        heartsRef.current.push({
          id: id.current++,
          x: 10 + Math.random() * (W - 30),
          y: H + 30,
          speed: 125 * difficulty,
        });
      }

      const px = x.current;
      const py = FALL_Y;
      const nextThings: Thing[] = [];
      let damage = 0;
      let passed = 0;

      for (const t of thingsRef.current) {
        const y = t.y - t.speed * dt;
        if (hit(px, py, PLAYER, PLAYER, t.x, y, t.size, t.size)) {
          damage++;
        } else if (y < -t.size) {
          passed++;
        } else {
          nextThings.push({ ...t, y });
        }
      }

      const nextSnacks: Snack[] = [];
      for (const s of snacksRef.current) {
        const y = s.y - s.speed * dt;
        if (hit(px, py, PLAYER, PLAYER, s.x, y, 18, 18)) {
          hpRef.current = Math.min(3, hpRef.current + 1);
        } else if (y >= -18) {
          nextSnacks.push({ ...s, y });
        }
      }

      const nextHearts: HeartPickup[] = [];
      for (const h of heartsRef.current) {
        const y = h.y - h.speed * dt;
        if (hit(px, py, PLAYER, PLAYER, h.x, y, 18, 18)) {
          hpRef.current = Math.min(3, hpRef.current + 1);
          scoreRef.current += 25;
        } else if (y >= -18) {
          nextHearts.push({ ...h, y });
        }
      }

      thingsRef.current = nextThings;
      snacksRef.current = nextSnacks;
      heartsRef.current = nextHearts;
      scoreRef.current += passed * 10;

      if (damage) hpRef.current -= damage;
      if (hpRef.current <= 0) {
        hpRef.current = 0;
        running.current = false;
        setOver(true);
      }

      setScore(scoreRef.current);
      setHp(hpRef.current);
      setThings([...nextThings]);
      setSnacks([...nextSnacks]);
      setHeartPickups([...nextHearts]);

      if (running.current) frame.current = requestAnimationFrame(loop);
    };

    frame.current = requestAnimationFrame(loop);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [started]);

  const submitScore = async () => {
    const name = nickname.trim().slice(0, 12);
    if (!name || submitted) return;

    const response = await fetch("/api/game/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: name, score }),
    });

    if (!response.ok) return;

    setSubmitted(true);
    const board = await fetch("/api/game/leaderboard");
    if (board.ok) {
      const data = await board.json();
      setLeaderboard(data?.scores ?? []);
    }
  };

  const hold = (direction: "left" | "right") => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      keys.current[direction] = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerUp: () => { keys.current[direction] = false; },
    onPointerCancel: () => { keys.current[direction] = false; },
    onPointerLeave: () => { keys.current[direction] = false; },
  });

  return (
    <main className="min-h-screen bg-[#008080] p-3 font-mono text-black sm:p-6">
      <div className="mx-auto max-w-[390px]">
        <div className="border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] shadow-[4px_4px_0_#000]">
          <div className="flex justify-between bg-[#000080] px-2 py-1 text-[12px] font-bold text-white">
            <span>marsha fall.exe</span><span>FALL</span>
          </div>

          <div className="p-2 sm:p-3">
            <div className="relative mx-auto overflow-hidden border-4 border-[#404040] border-r-white border-b-white bg-[#a8c070]"
              style={{ maxWidth: W, aspectRatio: "320 / 520" }}>
              <div className="absolute left-2 top-2 z-20 px-1 text-[11px] font-bold leading-none text-[#304020]">
                SCORE {String(score).padStart(4, "0")}
              </div>

              <div
                aria-label={`Health: ${hp} of 3`}
                className="absolute right-2 top-2 z-20 px-1 text-[15px] font-bold leading-none"
              >
                <span className="text-[#304020]">{"♥".repeat(hp)}</span>
                <span className="text-[#586848]">{"♡".repeat(3 - hp)}</span>
              </div>

              {/* Simple Game Boy-style vertical world: sky, clouds, tiny hills and trees. */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-0 top-0 h-full w-full bg-[#a8c070]" />
                <div className="absolute left-[-20px] top-[70px] h-3 w-16 bg-[#8b9f58]" />
                <div className="absolute right-[-18px] top-[180px] h-3 w-20 bg-[#8b9f58]" />
                <div className="absolute left-[-25px] bottom-[85px] h-3 w-24 bg-[#8b9f58]" />
                <div className="absolute right-[-30px] bottom-[175px] h-3 w-28 bg-[#8b9f58]" />
                <div className="absolute left-5 top-16 h-2 w-7 bg-[#c9d88b]" />
                <div className="absolute left-9 top-14 h-2 w-10 bg-[#c9d88b]" />
                <div className="absolute right-8 top-28 h-2 w-9 bg-[#c9d88b]" />
                <div className="absolute right-4 top-26 h-2 w-13 bg-[#c9d88b]" />
                <div className="absolute left-3 bottom-4 h-12 w-2 bg-[#586848]" />
                <div className="absolute left-0 bottom-10 h-7 w-10 bg-[#586848]" />
                <div className="absolute right-4 bottom-5 h-14 w-2 bg-[#586848]" />
                <div className="absolute right-0 bottom-11 h-8 w-12 bg-[#586848]" />
              </div>

              {things.map(t => (
                <div key={t.id}
                  className={
                    t.kind === "rock"
                      ? "absolute z-10 border-2 border-[#304020] bg-[#586848]"
                      : t.kind === "box"
                        ? "absolute z-10 border-2 border-[#302010] bg-[#8b6b3f]"
                        : "absolute z-10 border-2 border-[#687850] bg-[#c9d88b]"
                  }
                  style={{ left: t.x, top: t.y, width: t.size, height: t.size }} >
                  {t.kind === "box" && <span className="absolute left-1 top-1 h-1 w-1 bg-[#d0a060]" />}
                </div>
              ))}

              {snacks.map(s => (
                <div key={s.id} className="absolute z-20 flex items-center justify-center border-2 border-[#604020] bg-[#f0b030] text-[10px] font-bold"
                  style={{ left: s.x, top: s.y, width: 18, height: 18 }}>
                  <span className="absolute left-2 top-0 h-2 w-2 bg-[#586848]" />
                  <span className="relative top-1">●</span>
                </div>
              ))}

              {heartPickups.map(h => (
                <div key={h.id} className="absolute z-20 text-[18px] font-bold leading-[18px] text-[#304020]"
                  style={{ left: h.x, top: h.y, width: 18, height: 18 }}>♥</div>
              ))}

              <div className="absolute z-20 overflow-hidden"
                style={{ left: x.current - 2, top: FALL_Y - 4, width: 28, height: 32 }}>
                <img src="/marsha.gif" alt="Marsha" className="h-full w-full object-contain" draggable={false} />
              </div>

              {!started && (
                <Overlay>
                  <div className="text-[15px] font-bold">MARSHA FALL</div>
                  <div className="mt-2 text-[10px] leading-relaxed">
                    you are falling downward.<br />move left and right.<br />avoid things below you.<br />grab + snacks to recover HP.
                  </div>
                  <button onClick={reset} className="relative z-40 mt-4 border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] px-3 py-2 font-bold shadow-[2px_2px_0_#000] active:border-[#404040] active:border-r-white active:border-b-white" style={{ touchAction: "manipulation" }}>START</button>
                </Overlay>
              )}

              {over && !closed && (
                <Overlay>
                  <div className="text-[16px] font-bold">GAME OVER</div>
                  <div className="mt-2 text-[11px]">SCORE: {score}</div>
                  {!submitted ? (
                    <div className="mt-3">
                      <input
                        aria-label="Nickname"
                        value={nickname}
                        onChange={e => setNickname(e.target.value.slice(0, 12))}
                        onKeyDown={e => { if (e.key === "Enter") submitScore(); }}
                        maxLength={12}
                        placeholder="NAME"
                        className="w-28 border-2 border-[#404040] bg-white px-2 py-1 text-center text-[10px] font-bold uppercase outline-none"
                      />
                      <button onClick={submitScore} className="retro-button ml-1 px-2 py-1 text-[10px]">SAVE</button>
                    </div>
                  ) : (
                    <div className="mt-2 text-[9px]">SCORE SAVED!</div>
                  )}
                  <button onClick={reset} className="relative z-40 mt-4 border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] px-3 py-2 font-bold shadow-[2px_2px_0_#000] active:border-[#404040] active:border-r-white active:border-b-white" style={{ touchAction: "manipulation" }}>RESTART</button>
                  <button onClick={() => { running.current = false; setClosed(true); }} className="relative z-40 mt-2 block w-full border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] px-3 py-2 font-bold shadow-[2px_2px_0_#000] active:border-[#404040] active:border-r-white active:border-b-white" style={{ touchAction: "manipulation" }}>CLOSE</button>
                </Overlay>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button aria-label="Move left" className="relative z-30 border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] py-4 text-2xl font-bold shadow-[2px_2px_0_#000] active:border-[#404040] active:border-r-white active:border-b-white" style={{ touchAction: "none" }} {...hold("left")}>◀</button>
              <button aria-label="Move right" className="relative z-30 border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] py-4 text-2xl font-bold shadow-[2px_2px_0_#000] active:border-[#404040] active:border-r-white active:border-b-white" style={{ touchAction: "none" }} {...hold("right")}>▶</button>
            </div>
            <div className="mt-2 text-center text-[9px] text-[#404040]">fall downward • mobile: hold ◀ ▶ • desktop: ← →</div>
          </div>
        </div>

        <div className="mt-3 border-2 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] p-2 text-black">
          <div className="mb-2 bg-[#000080] px-2 py-1 text-left text-[10px] font-bold text-white">TOP 10</div>
          <div className="space-y-1 text-[10px]">
            {leaderboard.length ? leaderboard.map((entry, i) => (
              <div key={`${entry.nickname}-${entry.score}-${i}`} className="flex justify-between">
                <span>{String(i + 1).padStart(2, "0")}. {entry.nickname}</span>
                <span>{String(entry.score).padStart(5, "0")}</span>
              </div>
            )) : <div className="text-[#404040]">No scores yet.</div>}
          </div>
        </div>
      </div>

      <style jsx>{`
        .retro-button {
          border: 4px solid white;
          border-right-color: #404040;
          border-bottom-color: #404040;
          background: #c0c0c0;
          font-weight: 700;
        }
        .retro-button:active {
          border-color: #404040;
          border-right-color: white;
          border-bottom-color: white;
        }
      `}</style>
    </main>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#a8c070]/95 p-5 text-center">
      <div className="border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] p-4 shadow-[3px_3px_0_#000]">
        {children}
      </div>
    </div>
  );
}
