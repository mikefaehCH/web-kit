// Deterministisches ZIP (STORE, UTF-8, 1980-01-01), ohne Fremdcode oder Pfade aus Nutzereingaben.
const encoder = new TextEncoder();
export function safeArchivePath(path) {
  return (
    typeof path === 'string' &&
    path.length <= 240 &&
    /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path) &&
    path.split('/').every((part) => part !== '.' && part !== '..')
  );
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function createZip(files) {
  if (!(files instanceof Map) || files.size > 200) throw Error('Ungültige ZIP-Dateiliste');
  const local = [],
    central = [];
  let offset = 0,
    centralSize = 0,
    total = 0;
  for (const [path, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!safeArchivePath(path) || !(bytes instanceof Uint8Array))
      throw Error('Ungültiger ZIP-Pfad oder Inhalt');
    total += bytes.length;
    if (total > 10000000) throw Error('ZIP ist zu gross');
    const name = encoder.encode(path),
      crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, bytes.length, true);
    h.setUint32(22, bytes.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, bytes);
    const directory = new Uint8Array(46 + name.length),
      d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, bytes.length, true);
    d.setUint32(24, bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);
    centralSize += directory.length;
    offset += header.length + bytes.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.size, true);
  e.setUint16(10, files.size, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}
