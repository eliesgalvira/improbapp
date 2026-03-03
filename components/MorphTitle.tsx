"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// ── Anchor phrases (configure the loop here) ──────────────────────────
// The title cycles through these in order, then wraps back.
const FRAMES = [
  "Improb app",
  "Improbable",
  "Impro babble",
  "Im poppable",
  "Improvable",
  "Improv a ball",
  "Improv apple",
];

// ── Timing ────────────────────────────────────────────────────────────
const INTERVAL_MS = 2800; // dwell time on each phrase before morphing

// ── Component ─────────────────────────────────────────────────────────
export function MorphTitle() {
  const [i, setI] = useState(0);
  const text = FRAMES[i];
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return; // static when reduced motion is on
    const id = window.setInterval(() => {
      setI((v) => (v + 1) % FRAMES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="inline-flex flex-col gap-2">
      <h1
        className="overflow-visible whitespace-nowrap font-mono text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.3] tracking-[-0.02em] text-[#1a1a2e]"
        aria-label={text}
      >
        <span className="inline-flex items-baseline" aria-hidden="true">
          {text.split("").map((ch, index) => (
            <AnimatePresence key={index} initial={false} mode="popLayout">
              <motion.span
                key={`${index}-${ch}`}
                layout
                initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : 6 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="relative inline-block motion-reduce:transition-none"
              >
                {ch === " " ? "\u00A0" : ch}
              </motion.span>
            </AnimatePresence>
          ))}
        </span>
      </h1>
      <div className="h-[3px] w-12 rounded-full bg-[#2d6a4f]" aria-hidden="true" />
    </div>
  );
}
