import { APP_NAME } from "@/lib/config";
import { cx } from "./ui";

/**
 * Original 3x5 ASCII pixel font ('#' = on). The wordmark is generated from
 * APP_NAME and drawn as a dot-matrix SVG so it renders identically everywhere.
 */
const FONT: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: [".#.", "#.#", "#.#", "##.", ".##"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#.#", "#.#", "###", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".#.", "..#", "##."],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "##.", "..#", "##."],
  " ": ["..", "..", "..", "..", ".."],
  "-": ["...", "...", "###", "...", "..."],
  ".": [".", ".", ".", ".", "#"],
};

/** ASCII-art rows of the wordmark ('#' on, '.' off), one column gap between glyphs. */
export function renderWordmark(text: string): string[] {
  const glyphs = [...text.toUpperCase()].map((c) => FONT[c] ?? FONT[" "]);
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) rows.push(glyphs.map((g) => g[r]).join("."));
  return rows;
}

const ROWS = renderWordmark(APP_NAME);
const W = ROWS[0].length;
const CURSOR_X = W + 1;

export function AsciiLogo({ className, height = 20, cursor = true }: { className?: string; height?: number; cursor?: boolean }) {
  const total = cursor ? CURSOR_X + 3 : W;
  return (
    <span className={cx("inline-flex items-center", className)}>
      <svg
        role="img"
        aria-label={APP_NAME}
        viewBox={`0 0 ${total} 5`}
        height={height}
        width={(height / 5) * total}
        shapeRendering="crispEdges"
        className="block"
      >
        {ROWS.flatMap((row, y) =>
          [...row].map((ch, x) =>
            ch === "#" ? <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} className="fill-ink" /> : null,
          ),
        )}
        {cursor && (
          <rect x={CURSOR_X} y={4} width={2} height={1} className="animate-blink fill-red motion-reduce:animate-none" />
        )}
      </svg>
    </span>
  );
}
