/**
 * Putting a raster image into a PDF we write by hand.
 *
 * A PDF carries an image as a stream whose bytes the reader decodes itself, so
 * the useful cases are the ones where the file's own compression *is* a PDF
 * filter and the bytes can be handed over untouched:
 *
 *  - JPEG is DCTDecode. The file goes in exactly as it is.
 *  - PNG is zlib with per-row filters, which is FlateDecode with predictor 15.
 *    Its IDAT data goes in exactly as it is.
 *
 * What that does not cover is a PNG with transparency or a palette. Alpha
 * needs the colour and the alpha split into two streams, and a palette needs
 * the table expanded — both mean actually decompressing the image, and this
 * module runs in the browser bundle as well as on the server, where a zlib is
 * not to hand.
 *
 * So those are refused, by name, with a reason. A letterhead that silently did
 * not print would be the same defect as the PDF that silently had no cover
 * page: the document is wrong and nothing says so.
 */

export type PdfImage = {
  width: number;
  height: number;
  /** The stream bytes, handed to the reader unchanged. */
  data: Uint8Array;
  filter: "DCTDecode" | "FlateDecode";
  colourSpace: "DeviceRGB" | "DeviceGray" | "DeviceCMYK";
  bitsPerComponent: number;
  /** PNG needs its predictor described or the rows decode as noise. */
  decodeParms?: string;
};

export class UnsupportedImage extends Error {}

const be32 = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((v, i) => bytes[i] === v);
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * A PNG whose IDAT can be handed straight to a PDF reader.
 *
 * Colour type 0 is greyscale and 2 is truecolour; both store whole samples in
 * row order, which is what predictor 15 expects. 3 is a palette and 4 and 6
 * carry alpha.
 */
export function readPng(bytes: Uint8Array): PdfImage {
  if (!isPng(bytes)) throw new UnsupportedImage("That file is not a PNG.");
  let at = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = -1;
  let interlace = 0;
  const idat: Uint8Array[] = [];

  while (at + 8 <= bytes.length) {
    const length = be32(bytes, at);
    const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = be32(body, 0);
      height = be32(body, 4);
      bitDepth = body[8]!;
      colourType = body[9]!;
      interlace = body[12]!;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }

  if (!width || !height) throw new UnsupportedImage("That PNG has no readable dimensions.");
  if (interlace !== 0)
    throw new UnsupportedImage(
      "That PNG is interlaced. Save it without interlacing, or use a JPEG.",
    );
  if (colourType === 3)
    throw new UnsupportedImage(
      "That PNG uses a colour palette. Save it as full colour, or use a JPEG.",
    );
  if (colourType === 4 || colourType === 6)
    throw new UnsupportedImage(
      "That PNG has transparency, which cannot be placed without flattening it. Save it on a white background, or use a JPEG.",
    );
  if (colourType !== 0 && colourType !== 2)
    throw new UnsupportedImage("That PNG uses a colour type this export does not support.");
  if (bitDepth !== 8)
    throw new UnsupportedImage(`That PNG is ${bitDepth}-bit. Save it as 8-bit, or use a JPEG.`);
  // Counting chunks is not the same as counting bytes: a PNG can carry an
  // empty IDAT, and that would have written a zero-length stream a reader
  // renders as nothing.
  const total = idat.reduce((n, c) => n + c.length, 0);
  if (!total) throw new UnsupportedImage("That PNG contains no image data.");

  const data = new Uint8Array(total);
  let p = 0;
  for (const c of idat) {
    data.set(c, p);
    p += c.length;
  }

  const colours = colourType === 2 ? 3 : 1;
  return {
    width,
    height,
    data,
    filter: "FlateDecode",
    colourSpace: colourType === 2 ? "DeviceRGB" : "DeviceGray",
    bitsPerComponent: 8,
    decodeParms: `<< /Predictor 15 /Colors ${colours} /BitsPerComponent 8 /Columns ${width} >>`,
  };
}

/** A JPEG's own compression is a PDF filter, so the file is the stream. */
export function readJpeg(bytes: Uint8Array): PdfImage {
  if (!isJpeg(bytes)) throw new UnsupportedImage("That file is not a JPEG.");
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1]!;
    // Every SOF but SOF4 (define Huffman) and the restart/app markers carries
    // the frame header we need.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (isSof) {
      const bitsPerComponent = bytes[at + 4]!;
      const height = (bytes[at + 5]! << 8) | bytes[at + 6]!;
      const width = (bytes[at + 7]! << 8) | bytes[at + 8]!;
      const components = bytes[at + 9]!;
      const colourSpace =
        components === 3 ? "DeviceRGB" : components === 1 ? "DeviceGray" : "DeviceCMYK";
      if (components !== 1 && components !== 3 && components !== 4)
        throw new UnsupportedImage("That JPEG uses a colour model this export does not support.");
      return { width, height, data: bytes, filter: "DCTDecode", colourSpace, bitsPerComponent };
    }
    at += 2 + length;
  }
  throw new UnsupportedImage("That JPEG has no readable frame header.");
}

export function readImage(bytes: Uint8Array): PdfImage {
  if (isPng(bytes)) return readPng(bytes);
  if (isJpeg(bytes)) return readJpeg(bytes);
  throw new UnsupportedImage("Only PNG and JPEG images can be placed in a PDF.");
}

/** The image XObject, as a PDF object body. */
export function imageObject(image: PdfImage, streamAsLatin1: string): string {
  return (
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
    ` /ColorSpace /${image.colourSpace} /BitsPerComponent ${image.bitsPerComponent}` +
    ` /Filter /${image.filter}${image.decodeParms ? ` /DecodeParms ${image.decodeParms}` : ""}` +
    ` /Length ${streamAsLatin1.length} >>\nstream\n${streamAsLatin1}\nendstream`
  );
}
