"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

type Thing = { id: number; x: number; y: number; size: number; speed: number; kind: "rock" | "box" };
type Snack = { id: number; x: number; y: number; speed: number };

const W = 320;
const H = 520;
const PLAYER = 24;
const SPEED = 220;
const FALL_Y = 92;

export default function Game() {
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(3);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [things, setThings] = useState<Thing[]>([]);
  const [snacks, setSnacks] = useState<Snack[]>([]);

  const x = useRef(W / 2 - PLAYER / 2);
  const keys = useRef({ left: false, right: false });
  const thingsRef = useRef<Thing[]>([]);
  const snacksRef = useRef<Snack[]>([]);
  const scoreRef = useRef(0);
  const hpRef = useRef(3);
  const running = useRef(false);
  const last = useRef(0);
  const spawn = useRef(0);
  const snackSpawn = useRef(0);
  const id = useRef(1);
  const frame = useRef<number | null>(null);

  const reset = useCallback(() => {
    x.current = W / 2 - PLAYER / 2;
    keys.current = { left: false, right: false };
    thingsRef.current = [];
    snacksRef.current = [];
    scoreRef.current = 0;
    hpRef.current = 3;
    last.current = 0;
    spawn.current = 0;
    snackSpawn.current = 0;
    setScore(0);
    setHp(3);
    setThings([]);
    setSnacks([]);
    setOver(false);
    setStarted(true);
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

      const difficulty = 1 + Math.min(scoreRef.current / 800, 1.8);
      if (keys.current.left) x.current -= SPEED * dt;
      if (keys.current.right) x.current += SPEED * dt;
      x.current = Math.max(4, Math.min(W - PLAYER - 4, x.current));

      spawn.current += dt;
      snackSpawn.current += dt;

      if (spawn.current > Math.max(0.38, 0.85 - difficulty * 0.12)) {
        spawn.current = 0;
        const size = 18 + Math.floor(Math.random() * 9);
        thingsRef.current.push({
          id: id.current++,
          x: 8 + Math.random() * (W - size - 16),
          y: H + size,
          size,
          speed: 145 + Math.random() * 55 + difficulty * 18,
          kind: Math.random() > 0.5 ? "rock" : "box",
        });
      }

      if (snackSpawn.current > 4.5) {
        snackSpawn.current = 0;
        snacksRef.current.push({
          id: id.current++,
          x: 8 + Math.random() * (W - 26),
          y: H + 20,
          speed: 120 + difficulty * 12,
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

      thingsRef.current = nextThings;
      snacksRef.current = nextSnacks;
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

      if (running.current) frame.current = requestAnimationFrame(loop);
    };

    frame.current = requestAnimationFrame(loop);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [started]);

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
            <span>marsha fall.exe</span><span>♥ {hp}</span>
          </div>

          <div className="p-2 sm:p-3">
            <div className="relative mx-auto overflow-hidden border-4 border-[#404040] border-r-white border-b-white bg-[#a8c070]"
              style={{ maxWidth: W, aspectRatio: "320 / 520" }}>
              <div className="absolute left-2 top-2 z-20 border-2 border-[#404040] border-r-white border-b-white bg-[#c0c0c0] px-2 py-1 text-[10px] font-bold">
                SCORE {String(score).padStart(4, "0")}
              </div>

              {things.map(t => (
                <div key={t.id}
                  className={t.kind === "rock" ? "absolute border-2 border-[#304020] bg-[#586848]" : "absolute border-2 border-[#302010] bg-[#8b6b3f]"}
                  style={{ left: t.x, top: t.y, width: t.size, height: t.size }} />
              ))}

              {snacks.map(s => (
                <div key={s.id} className="absolute flex items-center justify-center border-2 border-[#604020] bg-[#f0b030] text-[11px] font-bold"
                  style={{ left: s.x, top: s.y, width: 18, height: 18 }}>+</div>
              ))}

              <div className="absolute flex items-center justify-center border-2 border-[#202020] bg-[#d8d8c0] text-[9px] font-bold"
                style={{ left: x.current, top: FALL_Y, width: PLAYER, height: PLAYER }}>M</div>

              {!started && (
                <Overlay>
                  <div className="text-[15px] font-bold">MARSHA FALL</div>
                  <div className="mt-2 text-[10px] leading-relaxed">
                    you are falling downward.<br />move left and right.<br />avoid things below you.<br />grab + snacks to recover HP.
                  </div>
                  <button onClick={reset} className="retro-button mt-4">START</button>
                </Overlay>
              )}

              {over && (
                <Overlay>
                  <div className="text-[16px] font-bold">GAME OVER</div>
                  <div className="mt-2 text-[11px]">SCORE: {score}</div>
                  <button onClick={reset} className="retro-button mt-4">RESTART</button>
                </Overlay>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button aria-label="Move left" className="retro-button py-4 text-2xl" style={{ touchAction: "none" }} {...hold("left")}>◀</button>
              <button aria-label="Move right" className="retro-button py-4 text-2xl" style={{ touchAction: "none" }} {...hold("right")}>▶</button>
            </div>
            <div className="mt-2 text-center text-[9px] text-[#404040]">fall downward • mobile: hold ◀ ▶ • desktop: ← →</div>
          </div>
        </div>

        <div className="mt-3 text-center text-[9px] text-white">phase 1 prototype • no leaderboard yet</div>
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
    <div className="absolute inset-0 flex items-center justify-center bg-[#a8c070]/95 p-5 text-center">
      <div className="border-4 border-white border-r-[#404040] border-b-[#404040] bg-[#c0c0c0] p-4 shadow-[3px_3px_0_#000]">
        {children}
      </div>
    </div>
  );
}
