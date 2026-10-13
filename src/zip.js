// -----------------------------------------------------------------------------
// The smallest zip reader that reads a MOSMIX kmz: one deflated kml inside.
//
// Node has no zip module and a dependency for one entry is not worth its
// weight. The central directory (at the end of the file) gives the offset,
// the method and the compressed size of each entry, reliably even when the
// local header carries a data descriptor (sizes written after the data).
// -----------------------------------------------------------------------------

import { inflateRawSync } from 'node:zlib';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

/** The first entry of a zip archive, inflated. */
export function unzipFirst(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entries = buffer.readUInt16LE(eocd + 10);
  const directory = buffer.readUInt32LE(eocd + 16);
  if (entries === 0 || buffer.readUInt32LE(directory) !== CENTRAL_FILE_HEADER) {
    throw new Error('zip: empty archive');
  }
  const method = buffer.readUInt16LE(directory + 10);
  const compressedSize = buffer.readUInt32LE(directory + 20);
  const nameLength = buffer.readUInt16LE(directory + 28);
  const extraLength = buffer.readUInt16LE(directory + 30);
  const commentLength = buffer.readUInt16LE(directory + 32);
  const local = buffer.readUInt32LE(directory + 42);
  const name = buffer.toString('utf8', directory + 46, directory + 46 + nameLength);
  if (buffer.readUInt32LE(local) !== LOCAL_FILE_HEADER) {
    throw new Error('zip: bad local header');
  }
  // The local header has its own name and extra field lengths.
  const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const data = buffer.subarray(dataStart, dataStart + compressedSize);
  void (extraLength + commentLength);
  if (method === STORED) {
    return { name, data: Buffer.from(data) };
  }
  if (method === DEFLATED) {
    return { name, data: inflateRawSync(data) };
  }
  throw new Error(`zip: unsupported compression method ${method}`);
}

// The end record is 22 bytes plus an optional comment: scan backwards.
function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      return i;
    }
  }
  throw new Error('zip: not a zip archive');
}
