import expect from "./expect";

export const WORD = 2;
export const DOUBLE_WORD = 4;
export const QUAD_WORD = 8;

export enum Endian {
  little,
  big
}

// Most engines store as little-endian, but here we'll check.
const littleEndian = () => {
  const u16 = new Uint16Array([0x0102]);
  const u8 = new Uint8Array(u16.buffer);
  return u8[0] === 0x02;
};

const engineEndian = littleEndian() ? Endian.little : Endian.big;

// Sign bit and u64 full.
// const one = BigInt(1);
// const max = one << BigInt(63);
// const full = one << BigInt(64);

export default class Cursor {
  offset: number;
  buf: Uint8Array;

  // Endian of file.
  endian: Endian;

  static OverflowError = class extends Error {};

  constructor(into: Uint8Array, endian: Endian, jump: number = 0) {
    this.buf = into;
    this.offset = jump;
    if (this.atEnd)
      throw new Cursor.OverflowError("Jump cannot be > length of buffer");
    this.endian = endian;
  }

  get atEnd() {
    if (this.offset > this.length - 1) return true;
    return false;
  }

  get length() {
    return this.buf.length;
  }

  clone() {
    // Return a shallow (that is, reference to the same underlying ArrayBuffer) copy.
    return new Cursor(this.buf, this.offset);
  }

  slice(bytes: number, start?: number) {
    // Return a new cursor with a new view into the underlying ArrayBuffer,
    // starting from the current offset, unless you pass in `start` as well.
    const begin = start ?? this.offset;
    const view = this.buf.subarray(begin, begin + bytes);
    return new Cursor(view, this.endian);
  }

  reset() {
    this.offset = 0;
  }

  seek(idx: number) {
    this.offset = idx;
    if (this.atEnd) throw new Cursor.OverflowError();
  }

  seekEnd(idx: number) {
    this.offset = this.length - idx;
    if (this.atEnd) throw new Cursor.OverflowError();
  }

  skip(idx: number) {
    this.seek(this.offset + idx);
  }

  nextUint8() {
    if (this.atEnd) return null;
    return this.buf[this.offset++];
  }

  nextUint16() {
    const u16 = [
      expect(this.nextUint8(), Cursor.OverflowError),
      expect(this.nextUint8(), Cursor.OverflowError)
    ];
    if (this.endian === Endian.little) return (u16[1] << 8) | u16[0];
    return (u16[0] << 8) | u16[1];
  }

  nextUint32() {
    const u32 = [this.nextUint16(), this.nextUint16()];
    // JS stores numbers as 32 bits by default. As a result we >>> 0 to force
    // an unsigned interpretation.
    if (this.endian === Endian.little) return ((u32[1] << 16) | u32[0]) >>> 0;
    return ((u32[0] << 16) | u32[1]) >>> 0;
  }

  // nextUint64() {
  //   // No native 64-bit integer is goofy, so we have to use BigInt.
  //   const u64 = [
  //     BigInt(this.nextUint32()),
  //     BigInt(this.nextUint32())
  //   ];
  //   if (this.endian === Endian.little) return (u64[1] << BigInt(32)) | u64[0];
  //   return (u64[0] << BigInt(32)) | u64[1];
  // }

  // And we'll throw in some bitwise tricks to get signed values too.
  nextInt16() {
    const u16 = this.nextUint16();
    // Greater than sign bit, subtract.
    return u16 >= 0x8000 ? u16 - 0x10000 : u16;
  }

  nextInt32() {
    // Flip it back to a i32.
    return this.nextUint32() | 0;
  }

  // nextInt64() {
  //   const u64 = this.nextUint64();
  //   // We apply the same sign trick as we did for `nextInt16()`.
  //   return u64 >= max ? u64 - full : u64;
  // }

  // And more tricks for floats. We use ArrayBuffer because it looks clean.
  nextFloat() {
    const bytes = Array.from({ length: 4 }, () =>
      expect(this.nextUint8(), Cursor.OverflowError)
    );
    let u32 = new Uint8Array(bytes);
    if (this.endian !== engineEndian)
      // If file endian doesn't match `engineEndian`, which is what the ArrayBuffer
      // will store the bytes as.
      u32 = u32.reverse();
    const f32 = new Float32Array(u32.buffer);
    return f32[0];
  }

  nextDouble() {
    const bytes = Array.from({ length: 8 }, () =>
      expect(this.nextUint8(), Cursor.OverflowError)
    );
    let u64 = new Uint8Array(bytes);
    if (this.endian !== engineEndian) u64 = u64.reverse();
    const f64 = new Float64Array(u64.buffer);
    return f64[0];
  }

  string(length: number) {
    const s = this.slice(length);
    this.offset += length;
    return String.fromCharCode(...s.buf);
  }
}
