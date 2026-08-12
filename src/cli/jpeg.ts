import type { RgbaImage } from "./png";

/**
 * Baseline JPEG encoder (sequential DCT, Huffman, 4:4:4), dependency-free.
 *
 * Pairs with `png.ts` to give `sluglist report` an image pipeline with zero
 * install cost — see the rationale there. Chroma is NOT subsampled: report
 * screenshots are mostly text and UI edges, where 4:2:0 smears coloured type
 * for a saving the size budget does not need.
 *
 * Tables are the standard ones from ITU-T T.81 Annex K.
 */

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
];

const LUMA_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const CHROMA_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56,
  99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99,
];

const DC_LUMA_BITS = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUMA_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DC_CHROMA_BITS = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHROMA_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const AC_LUMA_BITS = [
  0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d,
];
const AC_LUMA_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13,
  0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
  0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

const AC_CHROMA_BITS = [
  0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77,
];
const AC_CHROMA_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51,
  0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1,
  0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24,
  0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a,
  0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66,
  0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82,
  0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa,
  0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9,
  0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

/** code, length — indexed by Huffman symbol. */
type HuffTable = Map<number, { code: number; length: number }>;

/** Build the canonical Huffman code table from a BITS/VALUES pair. */
function buildHuffTable(bits: number[], values: number[]): HuffTable {
  const table: HuffTable = new Map();
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < bits[length]; i++) {
      table.set(values[k++], { code, length });
      code++;
    }
    code <<= 1;
  }
  return table;
}

/** Scale a base quantization table for a quality in 1..100. */
function scaleQuant(base: number[], quality: number): Int32Array {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  const out = new Int32Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = Math.min(255, Math.max(1, Math.floor((base[i] * scale + 50) / 100)));
  }
  return out;
}

/** Separable 8×8 forward DCT-II, in place over a 64-sample block. */
function forwardDct(block: Float32Array): void {
  const tmp = new Float32Array(64);
  // Rows.
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0;
      for (let x = 0; x < 8; x++) {
        sum += block[y * 8 + x] * COS[u * 8 + x];
      }
      tmp[y * 8 + u] = sum / 2;
    }
  }
  // Columns.
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let y = 0; y < 8; y++) {
        sum += tmp[y * 8 + u] * COS[v * 8 + y];
      }
      block[v * 8 + u] = sum / 2;
    }
  }
}

/** `C(u)·cos((2x+1)uπ/16)`, indexed `[u*8 + x]`. Built once at load. */
const COS = ((): Float32Array => {
  const table = new Float32Array(64);
  for (let u = 0; u < 8; u++) {
    const cu = u === 0 ? Math.SQRT1_2 : 1;
    for (let x = 0; x < 8; x++) {
      table[u * 8 + x] = cu * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
  }
  return table;
})();

/** Bit-level writer with the mandatory 0xFF byte stuffing. */
class BitWriter {
  private readonly bytes: number[] = [];
  private accumulator = 0;
  private bitCount = 0;

  writeBits(code: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.accumulator = (this.accumulator << 1) | ((code >> i) & 1);
      this.bitCount++;
      if (this.bitCount === 8) {
        this.bytes.push(this.accumulator & 0xff);
        // A 0xFF data byte must be followed by a literal 0x00 so it cannot be
        // mistaken for a marker.
        if ((this.accumulator & 0xff) === 0xff) {
          this.bytes.push(0x00);
        }
        this.accumulator = 0;
        this.bitCount = 0;
      }
    }
  }

  /** Pad the final partial byte with 1-bits, as the spec requires. */
  flush(): void {
    while (this.bitCount > 0) {
      this.writeBits(1, 1);
    }
  }

  toBuffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

/** Magnitude category and the value's bit pattern, per T.81 F.1.2. */
function category(value: number): { size: number; bits: number } {
  if (value === 0) {
    return { size: 0, bits: 0 };
  }
  const magnitude = Math.abs(value);
  let size = 0;
  while (magnitude >> size) {
    size++;
  }
  // Negative values are encoded as the one's complement of their magnitude.
  return { size, bits: value > 0 ? value : value + (1 << size) - 1 };
}

interface Component {
  quant: Int32Array;
  dcTable: HuffTable;
  acTable: HuffTable;
  previousDc: number;
}

/** Encode one 8×8 block: DCT → quantize → zigzag → Huffman. */
function encodeBlock(
  writer: BitWriter,
  samples: Float32Array,
  component: Component
): void {
  forwardDct(samples);

  const quantized = new Int32Array(64);
  for (let i = 0; i < 64; i++) {
    quantized[i] = Math.round(samples[ZIGZAG[i]] / component.quant[i]);
  }

  // DC: difference from the previous block of the same component.
  const diff = quantized[0] - component.previousDc;
  component.previousDc = quantized[0];
  const dc = category(diff);
  const dcCode = component.dcTable.get(dc.size);
  if (!dcCode) {
    throw new Error(`no DC Huffman code for size ${dc.size}`);
  }
  writer.writeBits(dcCode.code, dcCode.length);
  if (dc.size > 0) {
    writer.writeBits(dc.bits, dc.size);
  }

  // AC: run-length of zeros, then the coefficient.
  let end = 63;
  while (end > 0 && quantized[end] === 0) {
    end--;
  }
  let run = 0;
  for (let i = 1; i <= end; i++) {
    if (quantized[i] === 0) {
      run++;
      continue;
    }
    // Runs longer than 15 are emitted as ZRL (16 zeros) blocks.
    while (run > 15) {
      const zrl = component.acTable.get(0xf0);
      if (!zrl) {
        throw new Error("no ZRL Huffman code");
      }
      writer.writeBits(zrl.code, zrl.length);
      run -= 16;
    }
    const ac = category(quantized[i]);
    const symbol = (run << 4) | ac.size;
    const acCode = component.acTable.get(symbol);
    if (!acCode) {
      throw new Error(`no AC Huffman code for symbol ${symbol}`);
    }
    writer.writeBits(acCode.code, acCode.length);
    writer.writeBits(ac.bits, ac.size);
    run = 0;
  }
  // End-of-block, unless the block ran all the way to coefficient 63.
  if (end < 63) {
    const eob = component.acTable.get(0x00);
    if (!eob) {
      throw new Error("no EOB Huffman code");
    }
    writer.writeBits(eob.code, eob.length);
  }
}

function marker(id: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, id, (length >> 8) & 0xff, length & 0xff, ...payload];
}

/**
 * Encode an RGBA image as a baseline JPEG. Alpha is ignored — call
 * {@link flatten} first if the source may be transparent.
 *
 * @param quality 1..100 (the report uses 70).
 */
export function encodeJpeg(image: RgbaImage, quality = 70): Buffer {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) {
    throw new Error("cannot encode an empty image");
  }

  const lumaQuant = scaleQuant(LUMA_QUANT, quality);
  const chromaQuant = scaleQuant(CHROMA_QUANT, quality);

  const header: number[] = [0xff, 0xd8]; // SOI

  // APP0 / JFIF: density 1x1, no thumbnail.
  header.push(
    ...marker(0xe0, [
      0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
      0x00, 0x00,
    ])
  );

  // DQT: both tables, written in zigzag order.
  const dqt: number[] = [];
  for (const [id, table] of [lumaQuant, chromaQuant].entries()) {
    dqt.push(id);
    for (let i = 0; i < 64; i++) {
      dqt.push(table[i]);
    }
  }
  header.push(...marker(0xdb, dqt));

  // SOF0: 8-bit, 3 components, all at sampling factor 1×1 (4:4:4).
  header.push(
    ...marker(0xc0, [
      8,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      3,
      1, 0x11, 0, // Y  — quant table 0
      2, 0x11, 1, // Cb — quant table 1
      3, 0x11, 1, // Cr — quant table 1
    ])
  );

  // DHT: four tables (DC/AC × luma/chroma).
  const tables: [number, number[], number[]][] = [
    [0x00, DC_LUMA_BITS, DC_LUMA_VALUES],
    [0x10, AC_LUMA_BITS, AC_LUMA_VALUES],
    [0x01, DC_CHROMA_BITS, DC_CHROMA_VALUES],
    [0x11, AC_CHROMA_BITS, AC_CHROMA_VALUES],
  ];
  for (const [id, bits, values] of tables) {
    header.push(...marker(0xc4, [id, ...bits.slice(1), ...values]));
  }

  // SOS: 3 components, spectral selection 0..63, no successive approximation.
  header.push(
    ...marker(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0x00, 0x3f, 0x00])
  );

  const dcLuma = buildHuffTable(DC_LUMA_BITS, DC_LUMA_VALUES);
  const acLuma = buildHuffTable(AC_LUMA_BITS, AC_LUMA_VALUES);
  const dcChroma = buildHuffTable(DC_CHROMA_BITS, DC_CHROMA_VALUES);
  const acChroma = buildHuffTable(AC_CHROMA_BITS, AC_CHROMA_VALUES);

  const y: Component = {
    quant: lumaQuant,
    dcTable: dcLuma,
    acTable: acLuma,
    previousDc: 0,
  };
  const cb: Component = {
    quant: chromaQuant,
    dcTable: dcChroma,
    acTable: acChroma,
    previousDc: 0,
  };
  const cr: Component = {
    quant: chromaQuant,
    dcTable: dcChroma,
    acTable: acChroma,
    previousDc: 0,
  };

  const writer = new BitWriter();
  const blockY = new Float32Array(64);
  const blockCb = new Float32Array(64);
  const blockCr = new Float32Array(64);

  // 4:4:4 ⇒ one 8×8 block per component per MCU, interleaved Y, Cb, Cr.
  for (let mcuY = 0; mcuY < height; mcuY += 8) {
    for (let mcuX = 0; mcuX < width; mcuX += 8) {
      for (let row = 0; row < 8; row++) {
        // Edge blocks replicate the last real pixel rather than padding with a
        // constant, which would ring along the right/bottom edges.
        const sy = Math.min(mcuY + row, height - 1);
        for (let col = 0; col < 8; col++) {
          const sx = Math.min(mcuX + col, width - 1);
          const i = (sy * width + sx) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const at = row * 8 + col;
          // BT.601 RGB → YCbCr, then the -128 level shift.
          blockY[at] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          blockCb[at] = -0.168_736 * r - 0.331_264 * g + 0.5 * b;
          blockCr[at] = 0.5 * r - 0.418_688 * g - 0.081_312 * b;
        }
      }
      encodeBlock(writer, blockY, y);
      encodeBlock(writer, blockCb, cb);
      encodeBlock(writer, blockCr, cr);
    }
  }

  writer.flush();
  return Buffer.concat([
    Buffer.from(header),
    writer.toBuffer(),
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}
