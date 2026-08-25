import { inflateRawSync } from "node:zlib";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const MAX_UNCOMPRESSED_BYTES = 1000000;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

function crc32(buffer) {
  if (typeof crc32.table === "undefined") {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let step = 0; step < 8; step += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
      table[index] = value;
    }
    crc32.table = table;
  }
  let value = 0xffffffff;
  for (const byte of buffer) value = crc32.table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function fail(message) {
  throw new Error(message);
}

function findEocdOffset(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let position = buffer.length - 22; position >= minimum; position -= 1) {
    if (buffer.readUInt32LE(position) === EOCD_SIGNATURE) return position;
  }
  return -1;
}

function readCentralDirectory(buffer, eocdOffset) {
  const totalEntries = buffer.readUInt16LE(eocdOffset + 8);
  const totalEntriesCentral = buffer.readUInt16LE(eocdOffset + 10);
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    totalEntries === ZIP64_SENTINEL_16
    || totalEntriesCentral === ZIP64_SENTINEL_16
    || directorySize === ZIP64_SENTINEL_32
    || directoryOffset === ZIP64_SENTINEL_32
  ) {
    fail("Los artifacts ZIP64 no están soportados.");
  }
  if (directoryOffset + directorySize > buffer.length) {
    fail("El artifact ZIP está malformado: el directorio central está fuera de los límites del archivo.");
  }
  const entries = [];
  let cursor = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > directoryOffset + directorySize || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      fail("El artifact ZIP está malformado: directorio central truncado o corrupto.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc32Value = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    if (
      compressedSize === ZIP64_SENTINEL_32
      || uncompressedSize === ZIP64_SENTINEL_32
      || localHeaderOffset === ZIP64_SENTINEL_32
    ) {
      fail("Los artifacts ZIP64 no están soportados.");
    }
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    entries.push({
      name,
      flags,
      method,
      crc32Value,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decompressEntry(buffer, entry) {
  if (entry.flags & 1) {
    fail(`La entrada "${entry.name}" está cifrada.`);
  }
  if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
    fail(`La entrada "${entry.name}" usa un método de compresión no soportado (método ${entry.method}).`);
  }
  if (Number.isInteger(entry.uncompressedSize) && entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
    fail(`La entrada "${entry.name}" supera el límite de 1.000.000 bytes descomprimidos.`);
  }

  if (entry.localHeaderOffset + 30 > buffer.length) {
    fail(`Los datos de la entrada "${entry.name}" están fuera de los límites del archivo.`);
  }
  const localNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
  if (dataStart + entry.compressedSize > buffer.length) {
    fail(`Los datos de la entrada "${entry.name}" están fuera de los límites del archivo.`);
  }
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_SIGNATURE) {
    fail(`El artifact ZIP está malformado: cabecera local inválida para "${entry.name}".`);
  }

  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  const data = entry.method === METHOD_DEFLATE ? inflateRawSync(compressed) : Buffer.from(compressed);
  if (crc32(data) !== entry.crc32Value) {
    fail("La entrada ZIP tiene un CRC32 inválido.");
  }
  if (Number.isInteger(entry.uncompressedSize) && entry.uncompressedSize < 0xffffffff && data.length !== entry.uncompressedSize) {
    fail(`El artifact ZIP está malformado: tamaño descomprimido incoherente en "${entry.name}".`);
  }
  return { name: entry.name, data };
}

/**
 * Localiza una entrada dentro de un buffer ZIP en memoria sin ejecutables externos.
 * Soporta compresión store (0) y deflate (8). Rechaza entradas cifradas,
 * métodos no soportados, offsets/tamaños fuera de los límites y entradas
 * descomprimidas por encima de 1.000.000 bytes.
 *
 * @param {Buffer} buffer contenido completo del ZIP.
 * @param {(name: string) => boolean} predicate criterio sobre el nombre de la entrada.
 * @returns {{ name: string, data: Buffer } | null} entrada encontrada o null.
 */
export function findZipEntry(buffer, predicate) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    fail("El artifact ZIP está malformado: buffer ausente o demasiado corto.");
  }
  const eocdOffset = findEocdOffset(buffer);
  if (eocdOffset === -1) {
    fail("El artifact ZIP está malformado: no se encontró la estructura final (EOCD).");
  }
  const entries = readCentralDirectory(buffer, eocdOffset);
  for (const entry of entries) {
    if (!predicate(entry.name)) continue;
    return decompressEntry(buffer, entry);
  }
  return null;
}
