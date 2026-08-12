import { inflateSync } from "node:zlib";

/**
 * Minimal PNG decoder — `node:zlib` and nothing else.
 *
 * Why hand-rolled: the report has to shrink screenshots, and every off-the-shelf
 * option costs more than the code does. `sharp` is a native binary, and
 * `optionalDependencies` are installed by default, so it would land in every
 * `npm install sluglist` in a browser project. `jimp` is pure JS but drags a
 * large tree into a package whose entire runtime today is two lazily-imported
 * deps. PNG's happy path is small: zlib does the decompression, and everything
 * left is unfiltering scanlines.
 *
 * Supported: non-interlaced, bit depth 8 and 16, colour types 0/2/3/4/6
 * (grey, RGB, palette, grey+alpha, RGBA), tRNS for palette and greyscale/RGB.
 * Unsupported input (interlaced, bit depth < 8) throws, and the caller embeds
 * the original bytes instead — a bigger report, never a broken one.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

/** Reverse the per-scanline filters in place, returning the raw sample bytes. */
function unfilter(
  raw: Buffer,
  width: number,
  height: number,
  bytesPerPixel: number
): Buffer {
  const stride = width * bytesPerPixel;
  const out = Buffer.allocUnsafe(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const target = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    switch (filter) {
      case 0:
        line.copy(target);
        break;
      case 1:
        for (let i = 0; i < stride; i++) {
          const left = i >= bytesPerPixel ? target[i - bytesPerPixel] : 0;
          target[i] = (line[i] + left) & 0xff;
        }
        break;
      case 2:
        for (let i = 0; i < stride; i++) {
          target[i] = (line[i] + (prior ? prior[i] : 0)) & 0xff;
        }
        break;
      case 3:
        for (let i = 0; i < stride; i++) {
          const left = i >= bytesPerPixel ? target[i - bytesPerPixel] : 0;
          const up = prior ? prior[i] : 0;
          target[i] = (line[i] + ((left + up) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const left = i >= bytesPerPixel ? target[i - bytesPerPixel] : 0;
          const up = prior ? prior[i] : 0;
          const upLeft =
            prior && i >= bytesPerPixel ? prior[i - bytesPerPixel] : 0;
          target[i] = (line[i] + paethPredictor(left, up, upLeft)) & 0xff;
        }
        break;
      default:
        throw new Error(`unsupported PNG filter ${filter}`);
    }
  }
  return out;
}

/** Decode a PNG buffer to RGBA. Throws on anything outside the supported set. */
export function decodePng(buffer: Buffer): RgbaImage {
  for (const [i, byte] of SIGNATURE.entries()) {
    if (buffer[i] !== byte) {
      throw new Error("not a PNG");
    }
  }

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let paletteAlpha: Buffer | null = null;
  let transparent: number[] | null = null;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    switch (type) {
      case "IHDR":
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        depth = data[8];
        colorType = data[9];
        interlace = data[12];
        break;
      case "PLTE":
        palette = Buffer.from(data);
        break;
      case "tRNS":
        if (colorType === 3) {
          paletteAlpha = Buffer.from(data);
        } else {
          transparent = [];
          for (let i = 0; i + 1 < data.length; i += 2) {
            transparent.push(data.readUInt16BE(i));
          }
        }
        break;
      case "IDAT":
        idat.push(Buffer.from(data));
        break;
      default:
        break;
    }
    if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (width <= 0 || height <= 0) {
    throw new Error("PNG has no IHDR");
  }
  if (interlace !== 0) {
    throw new Error("interlaced PNG is not supported");
  }
  if (depth !== 8 && depth !== 16) {
    throw new Error(`unsupported PNG bit depth ${depth}`);
  }
  if (idat.length === 0) {
    throw new Error("PNG has no image data");
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) {
    throw new Error(`unsupported PNG colour type ${colorType}`);
  }
  // Palette images are always 8-bit indices regardless of the sample depth of
  // the palette entries themselves.
  const sampleBytes = colorType === 3 ? 1 : depth / 8;
  const bytesPerPixel = channels * sampleBytes;

  const inflated = inflateSync(Buffer.concat(idat));
  const expected = (width * bytesPerPixel + 1) * height;
  if (inflated.length < expected) {
    throw new Error("PNG image data is truncated");
  }
  const samples = unfilter(inflated, width, height, bytesPerPixel);

  const out = new Uint8Array(width * height * 4);
  const pixels = width * height;
  // 16-bit samples are taken high-byte-first (equivalent to >> 8).
  const step = sampleBytes;

  for (let p = 0; p < pixels; p++) {
    const src = p * bytesPerPixel;
    const dst = p * 4;
    switch (colorType) {
      case 0: {
        const g = samples[src];
        out[dst] = g;
        out[dst + 1] = g;
        out[dst + 2] = g;
        out[dst + 3] =
          transparent && sample16(samples, src, sampleBytes) === transparent[0]
            ? 0
            : 255;
        break;
      }
      case 2: {
        out[dst] = samples[src];
        out[dst + 1] = samples[src + step];
        out[dst + 2] = samples[src + 2 * step];
        out[dst + 3] =
          transparent &&
          sample16(samples, src, sampleBytes) === transparent[0] &&
          sample16(samples, src + step, sampleBytes) === transparent[1] &&
          sample16(samples, src + 2 * step, sampleBytes) === transparent[2]
            ? 0
            : 255;
        break;
      }
      case 3: {
        const index = samples[src];
        if (!palette) {
          throw new Error("palette PNG without a PLTE chunk");
        }
        out[dst] = palette[index * 3];
        out[dst + 1] = palette[index * 3 + 1];
        out[dst + 2] = palette[index * 3 + 2];
        out[dst + 3] = paletteAlpha
          ? (paletteAlpha[index] ?? 255)
          : 255;
        break;
      }
      case 4: {
        const g = samples[src];
        out[dst] = g;
        out[dst + 1] = g;
        out[dst + 2] = g;
        out[dst + 3] = samples[src + step];
        break;
      }
      case 6: {
        out[dst] = samples[src];
        out[dst + 1] = samples[src + step];
        out[dst + 2] = samples[src + 2 * step];
        out[dst + 3] = samples[src + 3 * step];
        break;
      }
      default:
        throw new Error(`unsupported PNG colour type ${colorType}`);
    }
  }

  return { width, height, data: out };
}

/** Read one sample at its full precision, for tRNS comparison. */
function sample16(samples: Buffer, offset: number, sampleBytes: number): number {
  return sampleBytes === 2 ? samples.readUInt16BE(offset) : samples[offset];
}

/**
 * Composite any transparency onto a flat background. JPEG has no alpha channel,
 * so this runs before encoding — without it, transparent regions would encode
 * as black.
 */
export function flatten(image: RgbaImage, background = 255): RgbaImage {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 255) {
      continue;
    }
    const a = alpha / 255;
    data[i] = Math.round(data[i] * a + background * (1 - a));
    data[i + 1] = Math.round(data[i + 1] * a + background * (1 - a));
    data[i + 2] = Math.round(data[i + 2] * a + background * (1 - a));
    data[i + 3] = 255;
  }
  return image;
}

/**
 * Downscale by box filter (average of the source pixels covering each target
 * pixel). For the 2–4× reductions a report does, box averaging is both the
 * cheapest and the most faithful choice — it is a true area resample, so it
 * neither aliases like nearest-neighbour nor softens like repeated bilinear.
 * Never upscales: an image already within bounds is returned untouched.
 */
export function resizeToWidth(image: RgbaImage, maxWidth: number): RgbaImage {
  if (image.width <= maxWidth) {
    return image;
  }
  const targetWidth = maxWidth;
  const targetHeight = Math.max(
    1,
    Math.round((image.height * targetWidth) / image.width)
  );
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const xRatio = image.width / targetWidth;
  const yRatio = image.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.min(image.height, Math.max(y0 + 1, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < targetWidth; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.min(image.width, Math.max(x0 + 1, Math.ceil((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * image.width + sx) * 4;
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          a += image.data[i + 3];
          n++;
        }
      }
      const dst = (y * targetWidth + x) * 4;
      out[dst] = Math.round(r / n);
      out[dst + 1] = Math.round(g / n);
      out[dst + 2] = Math.round(b / n);
      out[dst + 3] = Math.round(a / n);
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}
