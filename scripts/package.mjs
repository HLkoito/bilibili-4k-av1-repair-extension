import fs from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root=new URL('../',import.meta.url);
export const packageFiles=[
  'extension/manifest.json','extension/repair-core.js','extension/mse-hook.js',
  'README.md','LICENSE','PRIVACY.md','docs/av1-metadata-failure.md'
];
const manifest=JSON.parse(await fs.readFile(new URL('extension/manifest.json',root),'utf8'));
const prefix=`bilibili-av1-repair-${manifest.version}/`;
const local=[],central=[];let offset=0;
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
for(const path of packageFiles){
  const data=await fs.readFile(new URL(path,root)),name=Buffer.from(prefix+path),packed=deflateRawSync(data,{level:9}),crc=crc32(data);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
  local.push(h,name,packed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  central.push(c,name);offset+=h.length+name.length+packed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(packageFiles.length,8);end.writeUInt16LE(packageFiles.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...local,directory,end]),file=`bilibili-av1-repair-${manifest.version}.zip`;
await fs.mkdir(new URL('dist/',root),{recursive:true});await fs.writeFile(new URL('dist/'+file,root),zip);
await fs.writeFile(new URL('dist/SHA256SUMS',root),`${createHash('sha256').update(zip).digest('hex')}  ${file}\n`);
console.log(`Packaged ${packageFiles.length} allowlisted files: dist/${file} (${zip.length} bytes)`);
