import { flushSync } from "react-dom";

type Direction = "forward" | "back" | "morph" | "none";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs a React state update inside a same-document View Transition when the
 * browser supports it; otherwise applies it immediately. `direction` drives the
 * slide direction in CSS via `html[data-nav]`.
 */
export function withTransition(update: () => void, direction: Direction = "none"): ViewTransition | null {
  if (typeof document.startViewTransition !== "function" || reduced()) {
    update();
    return null;
  }
  const root = document.documentElement;
  root.dataset.nav = direction;
  const transition = document.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    delete root.dataset.nav;
  });
  return transition;
}
