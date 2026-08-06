"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 이만큼 긁어내면 나머지는 알아서 벗겨진다 */
const REVEAL_AT = 0.45;
const BRUSH = 16;

function paintFoil(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return false;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.scale(dpr, dpr);

  const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  g.addColorStop(0, "#78849c");
  g.addColorStop(0.45, "#a9b5cb");
  g.addColorStop(0.55, "#8b97b0");
  g.addColorStop(1, "#616d85");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, rect.width, rect.height);

  // 은박 결
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * rect.width;
    const y = Math.random() * rect.height;
    ctx.fillRect(x, y, 1.5, 6 + Math.random() * 10);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-out";
  return true;
}

function erasedRatio(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let clear = 0;
  let total = 0;
  // 알파 채널만 듬성듬성 본다
  for (let i = 3; i < data.length; i += 4 * 24) {
    total++;
    if (data[i] < 24) clear++;
  }
  return total === 0 ? 0 : clear / total;
}

/** 손가락으로 문질러서 벗기는 한 칸 */
export function ScratchCell({
  symbol,
  revealed,
  win,
  onReveal,
}: {
  symbol: string;
  revealed: boolean;
  win: boolean;
  onReveal: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const moves = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || revealed) return;
    // 레이아웃이 잡힌 뒤에 그려야 크기가 0 이 아니다.
    const id = requestAnimationFrame(() => setReady(paintFoil(canvas)));
    return () => cancelAnimationFrame(id);
  }, [revealed]);

  const rub = useCallback(
    (x: number, y: number) => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 점만 찍으면 빨리 그을 때 끊긴다. 이전 점과 이어 준다.
      ctx.lineWidth = BRUSH * 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (last.current) {
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.arc(x, y, BRUSH, 0, Math.PI * 2);
      ctx.fill();
      last.current = { x, y };

      moves.current++;
      if (moves.current % 7 === 0 && erasedRatio(canvas) > REVEAL_AT) onReveal();
    },
    [onReveal]
  );

  function pointerPos(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className={`scell${revealed ? " is-open" : ""}${win ? " is-win" : ""}`}>
      <span className="scell-symbol">{symbol}</span>
      {!revealed && (
        <canvas
          ref={ref}
          className={`scell-foil${ready ? "" : " is-blank"}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = null;
            const { x, y } = pointerPos(e);
            rub(x, y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const { x, y } = pointerPos(e);
            rub(x, y);
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
          }}
          onPointerCancel={() => {
            drawing.current = false;
            last.current = null;
          }}
        />
      )}
    </div>
  );
}
