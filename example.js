const zeode = require('.');

const buffer = new ArrayBuffer(10 * 1024 * 1024);
let fileSize = 0;
let file = new Uint8Array(buffer, 0, fileSize);

let z = zeode();
z.load(file);
z.makeChunk(0, 0);
z.makeChunk(0, 1);
let chunk = z.getChunk(0, 1);
chunk.addObject(100, [1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
chunk.addObject(101, [4, 5, 6, 0, 0, 0, 1, 1, 1, 1]);
chunk.removeObject(0);
chunk.forEachObject((n, matrix) => {
  console.log('got object 1', {n, matrix});
});

chunk.addTrailer(1);
chunk.addTrailer(2);
chunk.removeTrailer(0);
console.log('got trailer 1', chunk.hasTrailer(1), chunk.hasTrailer(2), chunk.hasTrailer(3));

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
chunk.forEachObject((n, matrix) => {
  console.log('got object 2', {n, matrix});
});

console.log('got trailer 2', chunk.hasTrailer(1), chunk.hasTrailer(2), chunk.hasTrailer(3));
