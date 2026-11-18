import { BAYER_4X4, DITHER_ALPHA, DITHER_CELL_PX, DITHER_FRAME_MS, DITHER_RGB } from "../constants/dither";

/** Paints an animated ordered-dither wave into the canvas while it is on screen. */
export function startDither(canvas: HTMLCanvasElement, reduceMotion: boolean) {
  const context = canvas.getContext("2d");
  if (!context) return;
  let width = 0;
  let height = 0;
  let image: ImageData | null = null;
  let visible = false;
  let last = 0;

  function draw(now: number) {
    if (!image || !context) return;
    const time = now * 0.00035;
    const data = image.data;
    for (let y = 0; y < height; y++) {
      const drift = 1.4 * Math.sin(y * 0.021 + time * 1.3);
      for (let x = 0; x < width; x++) {
        const wave = 0.5 + 0.5 * Math.sin(x * 0.018 + drift + time) * Math.cos(y * 0.013 - time * 0.7);
        const threshold = (BAYER_4X4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        const offset = (y * width + x) * 4;
        data[offset] = DITHER_RGB[0];
        data[offset + 1] = DITHER_RGB[1];
        data[offset + 2] = DITHER_RGB[2];
        data[offset + 3] = wave * 0.5 > threshold ? DITHER_ALPHA : 0;
      }
    }
    context.putImageData(image, 0, 0);
  }

  function resize() {
    if (!context) return;
    width = Math.max(1, Math.ceil(canvas.clientWidth / DITHER_CELL_PX));
    height = Math.max(1, Math.ceil(canvas.clientHeight / DITHER_CELL_PX));
    canvas.width = width;
    canvas.height = height;
    image = context.createImageData(width, height);
    draw(performance.now());
  }

  function tick(now: number) {
    if (!visible) return;
    if (now - last >= DITHER_FRAME_MS) {
      last = now;
      draw(now);
    }
    requestAnimationFrame(tick);
  }

  new ResizeObserver(resize).observe(canvas);
  if (reduceMotion) return;
  new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (visible && !wasVisible) requestAnimationFrame(tick);
  }).observe(canvas);
}
