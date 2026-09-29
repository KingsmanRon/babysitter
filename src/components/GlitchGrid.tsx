import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

const CELL = 60;
const GRID = `
  linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
`;

type Glitch =
  | { kind: 'static'; x: number; y: number; w: number; h: number; until: number }
  | { kind: 'line'; vertical: boolean; at: number; from: number; to: number; until: number }
  | { kind: 'tear'; y: number; h: number; shift: number; until: number }
  | { kind: 'band'; y: number; h: number; until: number }
  | { kind: 'flash'; until: number };

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// The background grid, with the odd burst of static, a flickering line or a
// torn slice now and then. The grid itself is CSS; glitches draw on a canvas
// aligned to the same 60px cells.
export default function GlitchGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let glitches: Glitch[] = [];
    const spawn = (now: number) => {
      const cols = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      const roll = Math.random();
      if (roll < 0.45) {
        glitches.push({
          kind: 'static',
          x: randInt(0, cols - 1) * CELL,
          y: randInt(0, rows - 1) * CELL,
          w: randInt(1, 3) * CELL,
          h: randInt(1, 2) * CELL,
          until: now + rand(90, 320),
        });
      } else if (roll < 0.8) {
        const vertical = Math.random() < 0.5;
        const from = randInt(0, (vertical ? rows : cols) - 2) * CELL;
        glitches.push({
          kind: 'line',
          vertical,
          at: randInt(0, vertical ? cols : rows) * CELL,
          from,
          to: from + randInt(2, 6) * CELL,
          until: now + rand(60, 240),
        });
      } else if (roll < 0.92) {
        glitches.push({
          kind: 'tear',
          y: randInt(0, rows - 1) * CELL + rand(0, CELL / 2),
          h: rand(6, 42),
          shift: rand(-26, 26),
          until: now + rand(80, 200),
        });
      } else {
        glitches.push({ kind: 'band', y: rand(0, height), h: rand(10, 50), until: now + rand(60, 160) });
      }
    };

    const noise = (x: number, y: number, w: number, h: number, block: number, maxAlpha: number) => {
      for (let yy = y; yy < y + h; yy += block) {
        for (let xx = x; xx < x + w; xx += block) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * maxAlpha})`;
          ctx.fillRect(xx, yy, block, block);
        }
      }
    };

    const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1 + 0.5, y1 + 0.5);
      ctx.lineTo(x2 + 0.5, y2 + 0.5);
      ctx.stroke();
    };

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 50) return; // ~20fps is plenty for static
      last = now;

      glitches = glitches.filter((g) => g.until > now);
      if (Math.random() < 0.15) spawn(now);
      if (Math.random() < 0.025) for (let i = 0; i < 6; i++) spawn(now); // a bigger hit
      if (Math.random() < 0.005) glitches.push({ kind: 'flash', until: now + rand(60, 130) }); // whole screen fuzzes

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      for (const g of glitches) {
        if (g.kind === 'flash') {
          noise(0, 0, width, height, 5, 0.07);
        } else if (g.kind === 'band') {
          noise(0, g.y, width, g.h, 3, 0.16);
        } else if (g.kind === 'static') {
          noise(g.x, g.y, g.w, g.h, 3, 0.22);
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w, g.h);
        } else if (g.kind === 'line') {
          const [x1, y1, x2, y2] = g.vertical ? [g.at, g.from, g.at, g.to] : [g.from, g.at, g.to, g.at];
          const [dx, dy] = g.vertical ? [2, 0] : [0, 2];
          drawLine(x1 - dx, y1 - dy, x2 - dx, y2 - dy, 'rgba(0,255,255,0.14)');
          drawLine(x1 + dx, y1 + dy, x2 + dx, y2 + dy, 'rgba(255,40,40,0.14)');
          drawLine(x1, y1, x2, y2, 'rgba(255,255,255,0.22)');
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.025)';
          ctx.fillRect(0, g.y, width, g.h);
          for (let x = 0; x <= width + CELL; x += CELL) {
            drawLine(x + g.shift, g.y, x + g.shift, g.y + g.h, 'rgba(255,255,255,0.13)');
          }
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduce]);

  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-0">
      <div
        className="absolute inset-0 animate-grid-flicker motion-reduce:animate-none"
        style={{ backgroundImage: GRID, backgroundSize: `${CELL}px ${CELL}px` }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
