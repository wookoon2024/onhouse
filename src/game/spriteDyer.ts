// Helper to convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

// Helper to convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r = l;
  let g = l;
  let b = l;

  if (s !== 0) {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const canvasCache: Record<string, HTMLCanvasElement> = {};

/**
 * Creates a dyed and/or desaturated off-screen canvas version of a character sprite sheet.
 * Shifting is targeted strictly at the blue clothing/accessories area to preserve skin color.
 */
export function getDyedSprite(
  img: HTMLImageElement,
  hueOffset: number,
  isOnline: boolean
): HTMLCanvasElement {
  const cacheKey = `${img.src}_${hueOffset}_${isOnline}`;
  if (canvasCache[cacheKey]) {
    return canvasCache[cacheKey];
  }

  // Create offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = img.width || 64;
  offscreen.height = img.height || 112;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return offscreen;

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // If hueOffset is 0 and user is online, no need for pixel manipulation
  if (hueOffset === 0 && isOnline) {
    canvasCache[cacheKey] = offscreen;
    return offscreen;
  }

  // Perform pixel processing
  const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip fully transparent pixels
    if (a === 0) continue;

    // Convert to HSL
    const [h, s, l] = rgbToHsl(r, g, b);

    // Preserve skin tones (typically 10° to 45° in HSL with medium-high lightness)
    const isSkinTone = h >= 10 && h <= 45 && l >= 0.35 && l <= 0.88;

    let finalR = r;
    let finalG = g;
    let finalB = b;

    // Shift hue for non-skin pixels with color saturation (s > 0.12) on ALL characters!
    if (!isSkinTone && s > 0.12 && hueOffset !== 0) {
      const shiftedHue = (h + hueOffset) % 360;
      const [newR, newG, newB] = hslToRgb(shiftedHue, s, l);
      finalR = newR;
      finalG = newG;
      finalB = newB;
    }

    // Apply grayscaling and opacity fade if the user is offline
    if (!isOnline) {
      const gray = Math.round(0.299 * finalR + 0.587 * finalG + 0.114 * finalB);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      data[i + 3] = Math.round(a * 0.65); // make transparent
    } else {
      data[i] = finalR;
      data[i + 1] = finalG;
      data[i + 2] = finalB;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  canvasCache[cacheKey] = offscreen;
  return offscreen;
}
