import {
  SPARKLE_COLORS,
  SPARKLE_COUNT,
  SPARKLE_DISTANCE_PX,
  SPARKLE_DURATION_MS,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_PATH,
  SPARKLE_SIZE_PX,
} from "../constants/copy-button";

const SVG_NS = "http://www.w3.org/2000/svg";
// Eased per phase: a quick pop out, then a slower drift while it shrinks and fades.
const POP_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const DRIFT_EASING = "cubic-bezier(0.45, 0, 0.55, 1)";

function between(range: { min: number; max: number }) {
  return range.min + Math.random() * (range.max - range.min);
}

/**
 * Bursts sparkles outward from the edge of `host`. The host needs a non-static position.
 * Does nothing when the user prefers reduced motion.
 */
export function burstSparkles(host: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = SPARKLE_COLORS[window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"];
  const halfWidth = host.offsetWidth / 2;
  const halfHeight = host.offsetHeight / 2;

  for (let index = 0; index < SPARKLE_COUNT; index++) {
    const angle = (index / SPARKLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Start on the button's edge so the sparkles never cover the label.
    const startX = cos * halfWidth * 0.85;
    const startY = sin * halfHeight * 0.85;
    const distance = between(SPARKLE_DISTANCE_PX);
    const endX = startX + cos * distance;
    const endY = startY + sin * distance;
    const spin = (Math.random() - 0.5) * 200;
    const size = between(SPARKLE_SIZE_PX);

    const sparkle = document.createElementNS(SVG_NS, "svg");
    sparkle.setAttribute("viewBox", "0 0 24 24");
    sparkle.setAttribute("aria-hidden", "true");
    sparkle.classList.add("copy-sparkle");
    sparkle.style.width = `${size}px`;
    sparkle.style.height = `${size}px`;
    sparkle.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", SPARKLE_PATH);
    path.setAttribute("fill", colors[index % colors.length]);
    sparkle.append(path);
    host.append(sparkle);

    sparkle
      .animate(
        [
          {
            transform: `translate(${startX}px, ${startY}px) scale(0) rotate(0deg)`,
            opacity: 1,
            easing: POP_EASING,
          },
          {
            transform: `translate(${startX + cos * distance * 0.55}px, ${startY + sin * distance * 0.55}px) scale(1) rotate(${spin / 2}deg)`,
            opacity: 1,
            offset: 0.35,
            easing: DRIFT_EASING,
          },
          { transform: `translate(${endX}px, ${endY}px) scale(0.2) rotate(${spin}deg)`, opacity: 0 },
        ],
        {
          duration: between(SPARKLE_DURATION_MS),
          delay: Math.random() * SPARKLE_MAX_DELAY_MS,
          fill: "both",
        },
      )
      .finished.then(
        () => sparkle.remove(),
        () => sparkle.remove(),
      );
  }
}
