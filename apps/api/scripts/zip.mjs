// Упаковывает dist/handler.js в dist/lambda.zip без внешних зависимостей
// (путь совпадает с lambda_package_path в infra/terraform/variables.tf)
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const name = Buffer.from('handler.js');
const data = readFileSync('dist/handler.js');
const comp = deflateRawSync(data);
const crc = crc32(data);
// Фиксированные дата/время: архив детерминирован, source_code_hash не меняется без изменений кода
const common = [20, 0, 0, 0, 8, 0, 0x21, 0, 0, 0]; // version, flags, method=8, time, date(1980-01-01)

const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0);
Buffer.from(common).copy(local, 4, 0, 10);
local.writeUInt32LE(crc, 14);
local.writeUInt32LE(comp.length, 18);
local.writeUInt32LE(data.length, 22);
local.writeUInt16LE(name.length, 26);

const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0);
central.writeUInt16LE(20, 4);
Buffer.from(common).copy(central, 6, 0, 10);
central.writeUInt32LE(crc, 16);
central.writeUInt32LE(comp.length, 20);
central.writeUInt32LE(data.length, 24);
central.writeUInt16LE(name.length, 28);
central.writeUInt32LE((0o100644 << 16) >>> 0, 38);

const localPart = Buffer.concat([local, name, comp]);
const centralPart = Buffer.concat([central, name]);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(1, 8);
end.writeUInt16LE(1, 10);
end.writeUInt32LE(centralPart.length, 12);
end.writeUInt32LE(localPart.length, 16);

writeFileSync('dist/lambda.zip', Buffer.concat([localPart, centralPart, end]));
