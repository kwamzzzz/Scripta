import { describe, expect, it } from "vitest";
import { isJpeg, isPng, readImage, readPng, UnsupportedImage } from "./pdf-image";

/** A minimal PNG: signature, IHDR with the given settings, one IDAT, IEND. */
function png(opts: {
  width?: number;
  height?: number;
  bitDepth?: number;
  colourType?: number;
  interlace?: number;
  idat?: number[];
}): Uint8Array {
  const { width = 4, height = 2, bitDepth = 8, colourType = 2, interlace = 0 } = opts;
  const idat = opts.idat ?? [1, 2, 3];
  const out: number[] = [137, 80, 78, 71, 13, 10, 26, 10];
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, body: number[]) => {
    out.push(...be(body.length));
    out.push(...[...type].map((c) => c.charCodeAt(0)));
    out.push(...body);
    out.push(0, 0, 0, 0); // CRC, never read here
  };
  chunk("IHDR", [...be(width), ...be(height), bitDepth, colourType, 0, 0, interlace]);
  chunk("IDAT", idat);
  chunk("IEND", []);
  return new Uint8Array(out);
}

/** A minimal JPEG: SOI, an SOF0 frame header, EOI. */
function jpeg(components = 3, width = 300, height = 100): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 255,
    height & 255,
    (width >> 8) & 255,
    width & 255,
    components,
    0xff,
    0xd9,
  ]);
}

describe("recognising a file", () => {
  it("knows a PNG from a JPEG", () => {
    expect(isPng(png({}))).toBe(true);
    expect(isJpeg(png({}))).toBe(false);
    expect(isJpeg(jpeg())).toBe(true);
  });

  it("refuses anything else by name rather than producing a blank page", () => {
    expect(() => readImage(new Uint8Array([1, 2, 3, 4]))).toThrow(UnsupportedImage);
    expect(() => readImage(new Uint8Array([1, 2, 3, 4]))).toThrow(/Only PNG and JPEG/);
  });
});

describe("PNG", () => {
  it("passes truecolour IDAT through with a predictor, which is what makes this work", () => {
    const image = readPng(png({ width: 40, height: 10 }));
    expect(image).toMatchObject({
      width: 40,
      height: 10,
      filter: "FlateDecode",
      colourSpace: "DeviceRGB",
      bitsPerComponent: 8,
    });
    expect(image.decodeParms).toContain("/Predictor 15");
    expect(image.decodeParms).toContain("/Colors 3");
    expect(image.decodeParms).toContain("/Columns 40");
  });

  it("reads greyscale as one colour", () => {
    expect(readPng(png({ colourType: 0 })).colourSpace).toBe("DeviceGray");
    expect(readPng(png({ colourType: 0 })).decodeParms).toContain("/Colors 1");
  });

  it("joins every IDAT chunk, because a real PNG splits them", () => {
    // Two IDATs would be two streams if this were wrong, and the image would
    // decode as noise after the first chunk.
    const bytes = readPng(png({ idat: [9, 9, 9, 9] })).data;
    expect([...bytes]).toEqual([9, 9, 9, 9]);
  });

  it("refuses transparency, saying what to do instead", () => {
    expect(() => readPng(png({ colourType: 6 }))).toThrow(/transparency/);
    expect(() => readPng(png({ colourType: 6 }))).toThrow(/white background, or use a JPEG/);
  });

  it("refuses a palette and an interlaced image, each by name", () => {
    expect(() => readPng(png({ colourType: 3 }))).toThrow(/colour palette/);
    expect(() => readPng(png({ interlace: 1 }))).toThrow(/interlaced/);
  });

  it("refuses a bit depth it cannot pass through", () => {
    expect(() => readPng(png({ bitDepth: 16 }))).toThrow(/16-bit/);
  });

  it("refuses a PNG with no image data rather than writing an empty stream", () => {
    expect(() => readPng(png({ idat: [] }))).toThrow(/no image data/);
  });
});

describe("JPEG", () => {
  it("reads the frame header and keeps the file as the stream", () => {
    const bytes = jpeg(3, 300, 100);
    const image = readImage(bytes);
    expect(image).toMatchObject({
      width: 300,
      height: 100,
      filter: "DCTDecode",
      colourSpace: "DeviceRGB",
    });
    expect(image.data).toBe(bytes);
  });

  it("reads a greyscale JPEG", () => {
    expect(readImage(jpeg(1)).colourSpace).toBe("DeviceGray");
  });

  it("refuses a colour model it cannot describe", () => {
    expect(() => readImage(jpeg(2))).toThrow(/colour model/);
  });
});
