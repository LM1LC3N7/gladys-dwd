import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { unzipFirst } from '../src/zip.js';
import { fixtureBuffer } from './helpers/fakeFetch.js';

test('reads the kml out of a real MOSMIX kmz', () => {
  const { name, data } = unzipFirst(fixtureBuffer('mosmix-10384.kmz'));
  assert.equal(name, 'MOSMIX_L_2026101221_10384.kml');
  const kml = data.toString('latin1');
  assert.ok(kml.startsWith('<?xml'));
  assert.ok(kml.includes('<kml:description>BERLIN-TEMPELHOF</kml:description>'));
});

// A zip built by hand: local header + data + central directory + end record.
function zip(name, content, { stored = false } = {}) {
  const raw = Buffer.from(content);
  const data = stored ? raw : deflateRawSync(raw);
  const nameBuffer = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(stored ? 0 : 8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuffer.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(stored ? 0 : 8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuffer.length, 12);
  end.writeUInt32LE(local.length + nameBuffer.length + data.length, 16);
  return Buffer.concat([local, nameBuffer, data, central, nameBuffer, end]);
}

test('reads deflated and stored entries', () => {
  assert.equal(unzipFirst(zip('a.txt', 'hello zip')).data.toString(), 'hello zip');
  assert.equal(unzipFirst(zip('a.txt', 'plain', { stored: true })).data.toString(), 'plain');
});

test('refuses what is not a zip', () => {
  assert.throws(() => unzipFirst(Buffer.from('<?xml version="1.0"?><kml/>')), /not a zip/);
});
