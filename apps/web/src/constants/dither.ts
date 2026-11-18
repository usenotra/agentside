/** 4x4 ordered-dither threshold matrix. */
export const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
/** CSS pixels per dither cell. */
export const DITHER_CELL_PX = 3;
export const DITHER_FRAME_MS = 90;
export const DITHER_RGB = [139, 92, 246] as const;
export const DITHER_ALPHA = 30;
