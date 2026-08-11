import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { encodeJpeg } from "../src/cli/jpeg";
import { decodePng, flatten, type RgbaImage, resizeToWidth } from "../src/cli/png";

/**
 * The image pipeline is hand-rolled, so it is verified against an INDEPENDENT
 * decoder rather than against itself: JPEGs we produce are handed to the
 * platform image stack (`sips`, present on every macOS host) and the pixels it
 * returns are compared with what we fed the encoder. A codec that merely
 * round-trips through its own inverse can be self-consistently wrong; this
 * cannot. On hosts without `sips` those checks skip and the structural ones
 * still run.
 */

const dir = mkdtempSync(join(tmpdir(), "sluglist-img-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function hasSips(): boolean {
  try {
    execFileSync("sips", ["--help"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const SIPS = hasSips();

/** Build a PNG by hand so the decoder is tested against known pixel values. */
function makePng(
  width: number,
  height: number,
  colorType: number,
  pixel: (x: number, y: number) => number[]
): Buffer {
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType as 0 | 2 | 4 | 6];
  if (!channels) {
    throw new Error("unsupported test colour type");
  }
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const values = pixel(x, y);
      for (let c = 0; c < channels; c++) {
        raw[y * (stride + 1) + 1 + x * channels + c] = values[c];
      }
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let crc = -1;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xed_b8_83_20 : crc >>> 1;
    }
  }
  return ~crc;
}

/** Decode a JPEG through the platform stack, returning RGBA. */
function decodeViaSips(jpeg: Buffer, name: string): RgbaImage {
  const jpegPath = join(dir, `${name}.jpg`);
  const pngPath = join(dir, `${name}-rt.png`);
  writeFileSync(jpegPath, jpeg);
  execFileSync("sips", ["-s", "format", "png", jpegPath, "--out", pngPath], {
    stdio: "ignore",
  });
  return decodePng(readFileSync(pngPath));
}

function meanAbsError(a: RgbaImage, b: RgbaImage): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(a.data[i + c] - b.data[i + c]);
      n++;
    }
  }
  return sum / n;
}

describe("decodePng", () => {
  it("decodes truecolour RGB", () => {
    const png = makePng(4, 2, 2, (x, y) => [x * 60, y * 100, 30]);
    const img = decodePng(png);
    expect(img.width).toBe(4);
    expect(img.height).toBe(2);
    expect([...img.data.slice(0, 4)]).toEqual([0, 0, 30, 255]);
    expect([...img.data.slice(4, 8)]).toEqual([60, 0, 30, 255]);
    // Second row.
    expect([...img.data.slice(16, 20)]).toEqual([0, 100, 30, 255]);
  });

  it("decodes RGBA, preserving alpha", () => {
    const png = makePng(2, 1, 6, (x) => [10, 20, 30, x === 0 ? 255 : 0]);
    const img = decodePng(png);
    expect([...img.data.slice(0, 8)]).toEqual([10, 20, 30, 255, 10, 20, 30, 0]);
  });

  it("decodes greyscale and grey+alpha", () => {
    const grey = decodePng(makePng(2, 1, 0, (x) => [x === 0 ? 0 : 255]));
    expect([...grey.data.slice(0, 8)]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);

    const greyAlpha = decodePng(makePng(2, 1, 4, (x) => [128, x === 0 ? 255 : 0]));
    expect([...greyAlpha.data.slice(0, 8)]).toEqual([
      128, 128, 128, 255, 128, 128, 128, 0,
    ]);
  });

  it("decodes every scanline filter identically", () => {
    // A gradient exercises Sub/Up/Average/Paeth differently; re-encoding the
    // same pixels under each filter must yield the same decode.
    const reference = decodePng(makePng(16, 16, 2, (x, y) => [x * 16, y * 16, 128]));
    for (const filter of [0, 1, 2, 3, 4]) {
      const png = makePngWithFilter(16, 16, filter, (x, y) => [
        x * 16,
        y * 16,
        128,
      ]);
      expect(decodePng(png).data).toEqual(reference.data);
    }
  });

  it("reads every committed screenshot", () => {
    for (const path of [
      "evidence/capture-matrix/chromium-fullpage.png",
      "evidence/capture-matrix/webkit-fullpage.png",
      "evidence/capture-matrix/firefox-fullpage.png",
      "evidence/capture-matrix/chromium-element.png",
    ]) {
      const img = decodePng(readFileSync(path));
      expect(img.width).toBeGreaterThan(0);
      expect(img.data.length).toBe(img.width * img.height * 4);
    }
  });

  it("rejects a non-PNG and an interlaced PNG", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/not a PNG/);
    const png = makePng(2, 2, 2, () => [0, 0, 0]);
    png[8 + 8 + 12] = 1; // IHDR interlace byte
    expect(() => decodePng(png)).toThrow(/interlaced/);
  });
});

/** As {@link makePng} but forcing one filter type across every scanline. */
function makePngWithFilter(
  width: number,
  height: number,
  filter: number,
  pixel: (x: number, y: number) => number[]
): Buffer {
  const channels = 3;
  const stride = width * channels;
  const flat = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const values = pixel(x, y);
      for (let c = 0; c < channels; c++) {
        flat[y * stride + x * channels + c] = values[c];
      }
    }
  }
  // Apply the chosen filter.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const value = flat[y * stride + i];
      const left = i >= channels ? flat[y * stride + i - channels] : 0;
      const up = y > 0 ? flat[(y - 1) * stride + i] : 0;
      const upLeft =
        y > 0 && i >= channels ? flat[(y - 1) * stride + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = (left + up) >> 1;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      raw[y * (stride + 1) + 1 + i] = (value - predictor) & 0xff;
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("resizeToWidth", () => {
  it("never upscales", () => {
    const img = decodePng(makePng(10, 5, 2, () => [1, 2, 3]));
    expect(resizeToWidth(img, 100)).toBe(img);
  });

  it("halves dimensions and preserves aspect ratio", () => {
    const img = decodePng(makePng(100, 50, 2, () => [10, 20, 30]));
    const out = resizeToWidth(img, 50);
    expect(out.width).toBe(50);
    expect(out.height).toBe(25);
  });

  it("area-averages rather than dropping pixels", () => {
    // A 2×1 image of black and white must average to mid-grey at width 1 —
    // nearest-neighbour would return one of the two extremes instead.
    const img = decodePng(
      makePng(2, 1, 2, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255]))
    );
    const out = resizeToWidth(img, 1);
    expect(out.data[0]).toBeGreaterThan(120);
    expect(out.data[0]).toBeLessThan(136);
  });
});

describe("flatten", () => {
  it("composites transparency onto white", () => {
    const img = decodePng(makePng(2, 1, 6, (x) => [0, 0, 0, x === 0 ? 255 : 0]));
    const out = flatten(img);
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    // Fully transparent black becomes the background, not black.
    expect([...out.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
  });
});

describe("encodeJpeg", () => {
  it("emits SOI/EOI and a JFIF header", () => {
    const img = decodePng(makePng(16, 16, 2, (x, y) => [x * 16, y * 16, 90]));
    const jpeg = encodeJpeg(img, 70);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg.subarray(6, 10).toString("ascii")).toBe("JFIF");
    expect(jpeg.at(-2)).toBe(0xff);
    expect(jpeg.at(-1)).toBe(0xd9);
  });

  it("stuffs a zero byte after every 0xFF in the entropy stream", () => {
    const img = decodePng(makePng(64, 64, 2, (x, y) => [(x * y) % 256, x, y]));
    const jpeg = encodeJpeg(img, 95);
    // Scan from the start of scan data to just before EOI: the only legal
    // 0xFF here is one followed by 0x00.
    const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]));
    const scanStart = sos + 2 + jpeg.readUInt16BE(sos + 2);
    for (let i = scanStart; i < jpeg.length - 2; i++) {
      if (jpeg[i] === 0xff) {
        expect(jpeg[i + 1]).toBe(0x00);
        i++;
      }
    }
  });

  it("a lower quality produces a smaller file", () => {
    const img = decodePng(
      makePng(64, 64, 2, (x, y) => [(x * 7) % 256, (y * 11) % 256, (x + y) % 256])
    );
    expect(encodeJpeg(img, 40).length).toBeLessThan(encodeJpeg(img, 90).length);
  });

  it("rejects an empty image", () => {
    expect(() => encodeJpeg({ width: 0, height: 0, data: new Uint8Array() })).toThrow();
  });

  it.skipIf(!SIPS)("is decodable by the platform stack at the right size", () => {
    const img = decodePng(makePng(37, 19, 2, (x, y) => [x * 6, y * 12, 200]));
    const out = decodeViaSips(encodeJpeg(img, 80), "odd-size");
    // Non-multiple-of-8 dimensions must survive the padded final MCU.
    expect(out.width).toBe(37);
    expect(out.height).toBe(19);
  });

  it.skipIf(!SIPS)("reproduces flat colours almost exactly", () => {
    const img = decodePng(makePng(32, 32, 2, () => [200, 60, 120]));
    const out = decodeViaSips(encodeJpeg(img, 90), "flat");
    expect(meanAbsError(img, out)).toBeLessThan(2);
  });

  it.skipIf(!SIPS)("reproduces a real screenshot within JPEG q70 tolerance", () => {
    const source = decodePng(
      readFileSync("evidence/capture-matrix/chromium-element.png")
    );
    const prepared = flatten(resizeToWidth(source, 1200));
    const out = decodeViaSips(encodeJpeg(prepared, 70), "screenshot");
    expect(out.width).toBe(prepared.width);
    expect(out.height).toBe(prepared.height);
    // q70 on UI content: a few units of mean error is expected; anything
    // larger means the encoder is structurally wrong, not merely lossy.
    expect(meanAbsError(prepared, out)).toBeLessThan(6);
  });

  it("compresses a real screenshot well below its PNG size", () => {
    const png = readFileSync("evidence/capture-matrix/chromium-fullpage.png");
    const jpeg = encodeJpeg(flatten(resizeToWidth(decodePng(png), 1200)), 70);
    expect(jpeg.length).toBeLessThan(png.length);
  });
});
