export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff
  };
}

export function relativeLuminance({ r, g, b }: RGB): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastInk(rgb: RGB): RGB {
  return relativeLuminance(rgb) > 0.52
    ? { r: 11, g: 15, b: 23 }
    : { r: 244, g: 246, b: 251 };
}

export const PRESET_ACCENTS = [
  '#7aa2ff', // periwinkle
  '#5ad1c8', // teal
  '#f8a978', // peach
  '#c79bff', // lavender
  '#ffd166', // honey
  '#ff8fb1', // rose
  '#9ad97a', // sage
  '#ff6b6b' // coral
];
