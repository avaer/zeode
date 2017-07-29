const zeode = require('.');

const buffer = new ArrayBuffer(10 * 1024 * 1024);
let fileSize = 0;
let file = new Uint8Array(buffer, 0, fileSize);

let z = zeode();
z.load(file);
z.makeChunk(0, 0);
z.makeChunk(0, 1);
let chunk = z.getChunk(0, 1);
chunk.addObject(100, [1, 2, 3]);
chunk.addObject(101, [4, 5, 6]);
chunk.removeObject(0);
chunk.forEachObject((n, position) => {
  console.log('got object 1', {n, position});
});
z.save((byteOffset, data) => {
  const file2 = new Uint32Array(buffer, byteOffset, data.length);
  file2.set(data);
  fileSize = Math.max(fileSize, byteOffset + data.byteLength);
});
file = new Uint32Array(buffer, 0, fileSize);
console.log('got new file size', fileSize);

z = zeode();
z.load(file);
chunk = z.getChunk(0, 1);
chunk.forEachObject((n, position) => {
  console.log('got object 2', {n, position});
});
