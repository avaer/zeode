const CHUNK_HEADER_SIZE = 2 * 4;
const OBJECT_SLOTS = 64 * 64;
const OBJECT_SLOT_FIELDS = 1 + 10 + 1;
const OBJECT_SLOT_SIZE = OBJECT_SLOT_FIELDS * 4;
const OBJECT_BUFFER_SIZE = OBJECT_SLOTS * OBJECT_SLOT_SIZE;
const BLOCK_BUFFER_SIZE = 16 * 128 * 16 * 4;
const GEOMETRY_BUFFER_SIZE = 1 * 1024 * 1024;
const TRAILER_SLOTS = 32;
const CHUNK_TRAILER_SIZE = TRAILER_SLOTS * 4;
const CHUNK_SIZE = CHUNK_HEADER_SIZE + BLOCK_BUFFER_SIZE + OBJECT_BUFFER_SIZE + GEOMETRY_BUFFER_SIZE + CHUNK_TRAILER_SIZE;

const localMatrix = Array(10);

class Chunk {
  constructor(
    x = 0,
    z = 0,
    objectBuffer = new Uint32Array(OBJECT_BUFFER_SIZE / 4),
    blockBuffer = new Uint32Array(BLOCK_BUFFER_SIZE / 4),
    geometryBuffer = new Uint8Array(GEOMETRY_BUFFER_SIZE),
    trailerBuffer = new Uint32Array(CHUNK_TRAILER_SIZE / 4)
  ) {
    this.x = x;
    this.z = z;
    this.uint32Buffer = objectBuffer;
    this.float32Buffer = new Float32Array(objectBuffer.buffer, objectBuffer.byteOffset, objectBuffer.length);
    this.blockBuffer = blockBuffer;
    this.geometryBuffer = geometryBuffer;
    this.trailerBuffer = trailerBuffer;

    this.dirty = false;
  }

  getObjectBuffer() {
    return this.uint32Buffer;
  }

  getBlockBuffer() {
    return this.blockBuffer;
  }

  getGeometryBuffer() {
    return this.geometryBuffer;
  }

  getObjectN(i) {
    return this.uint32Buffer[i * OBJECT_SLOT_FIELDS];
  }

  getObjectMatrix(i) {
    let offset = i * OBJECT_SLOT_FIELDS;
    offset++;

    for (let j = 0; j < 10; j++) {
      localMatrix[j] = this.float32Buffer[offset];
      offset++;
    }

    return localMatrix;
  }

  forEachObject(fn) {
    let offset = 0;
    for (let i = 0; i < OBJECT_SLOTS; i++) {
      const n = this.uint32Buffer[offset];
      offset++;

      if (n !== 0) {
        for (let j = 0; j < 10; j++) {
          localMatrix[j] = this.float32Buffer[offset];
          offset++;
        }
        const value = this.uint32Buffer[offset];
        offset++;

        if (fn(n, localMatrix, value, i) === false) {
          return false;
        }
      } else {
        offset += 11;
      }
    }

    return true;
  }

  addObject(n, matrix, value) {
    let freeIndex = -1;
    for (let i = 0; i < OBJECT_SLOTS; i++) {
      if (this.uint32Buffer[i * OBJECT_SLOT_FIELDS] === 0) {
        freeIndex = i;
        break;
      }
    }

    if (freeIndex !== -1) {
      let offset = freeIndex * OBJECT_SLOT_FIELDS;
      this.uint32Buffer[offset] = n;
      offset++;
      for (let i = 0; i < 10; i++) {
        this.float32Buffer[offset] = matrix[i];
        offset++;
      }
      this.uint32Buffer[offset] = value;
      offset++;

      this.dirty = true;
    }

    return freeIndex;
  }

  removeObject(index) {
    let offset = index * OBJECT_SLOT_FIELDS;

    const oldN = this.uint32Buffer[offset];

    this.uint32Buffer[offset] = 0;
    offset++;
    for (let i = 0; i < 10; i++) {
      this.float32Buffer[offset] = 0;
      offset++;
    }
    this.uint32Buffer[offset] = 0;
    offset++;

    this.dirty = true;

    return oldN;
  }

  setObjectData(index, value) {
    this.uint32Buffer[(index * OBJECT_SLOT_FIELDS) + (1 + 10)] = value;

    this.dirty = true;
  }

  getObject(index) {
    let offset = index * OBJECT_SLOT_FIELDS;
    const n = this.uint32Buffer[offset];

    if (n !== 0) {
      offset++;
      for (let i = 0; i < 10; i++) {
        localMatrix[i] = this.float32Buffer[offset];
        offset++;
      }
      const value = this.uint32Buffer[offset];

      return [n, localMatrix, value, index];
    } else {
      return null;
    }
  }

  getBlock(x, y, z) {
    return this.blockBuffer[_getBlockIndex(x, y, z)];
  }

  setBlock(x, y, z, n) {
    this.blockBuffer[_getBlockIndex(x, y, z)] = n;
  }

  clearBlock(x, y, z) {
    this.blockBuffer[_getBlockIndex(x, y, z)] = 0;
  }

  addTrailer(n) {
    let freeIndex = -1;
    for (let i = 0; i < TRAILER_SLOTS; i++) {
      if (this.trailerBuffer[i] === 0) {
        freeIndex = i;
        break;
      }
    }

    if (freeIndex !== -1) {
      this.trailerBuffer[freeIndex] = n;

      this.dirty = true;
    }

    return freeIndex;
  }

  removeTrailer(index) {
    this.trailerBuffer[index] = 0;
  }

  hasTrailer(n) {
    return this.trailerBuffer.includes(n);
  }
}

class Zeode {
  constructor() {
    this.chunks = [];
  }

  load(buffer) {
    const numChunks = buffer.length / CHUNK_SIZE;
    let {byteOffset} = buffer;
    for (let i = 0; i < numChunks; i++) {
      const chunkHeader = new Int32Array(buffer.buffer, byteOffset, 2);
      const x = chunkHeader[0];
      const z = chunkHeader[1];
      byteOffset += 2 * 4;
      const objectBuffer = new Uint32Array(buffer.buffer, byteOffset, OBJECT_BUFFER_SIZE / 4);
      byteOffset += OBJECT_BUFFER_SIZE;
      const blockBuffer = new Uint32Array(buffer.buffer, byteOffset, BLOCK_BUFFER_SIZE / 4);
      byteOffset += BLOCK_BUFFER_SIZE;
      const geometryBuffer = new Uint8Array(buffer.buffer, byteOffset, GEOMETRY_BUFFER_SIZE);
      byteOffset += GEOMETRY_BUFFER_SIZE;
      const chunkTrailer = new Uint32Array(buffer.buffer, byteOffset, CHUNK_TRAILER_SIZE / 4);
      byteOffset += CHUNK_TRAILER_SIZE;

      this.chunks.push(new Chunk(x, z, objectBuffer, blockBuffer, geometryBuffer, chunkTrailer));
    }
  }

  save(fn) {
    let byteOffset = 0;

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];

      if (chunk.dirty) {
        fn(byteOffset, Int32Array.from([chunk.x, chunk.z]));
        byteOffset += CHUNK_HEADER_SIZE;
        fn(byteOffset, chunk.uint32Buffer);
        byteOffset += BLOCK_BUFFER_SIZE;
        fn(byteOffset, chunk.blockBuffer);
        byteOffset += OBJECT_BUFFER_SIZE;
        fn(byteOffset, chunk.geometryBuffer);
        byteOffset += GEOMETRY_BUFFER_SIZE;
        fn(byteOffset, chunk.trailerBuffer);
        byteOffset += CHUNK_TRAILER_SIZE;

        chunk.dirty = false;
      } else {
        byteOffset += CHUNK_SIZE;
      }
    }
  }

  getChunk(x, z) {
    return this.chunks.find(chunk => chunk.x === x && chunk.z === z) || null;
  }

  addChunk(x, z, objectBuffer, geometryBuffer) {
    const chunk = new Chunk(x, z, objectBuffer, geometryBuffer);
    this.chunks.push(chunk);
    return chunk;
  }

  removeChunk(x, z) {
    return this.chunks.splice(this.chunks.findIndex(chunk => chunk.x === x && chunk.z === z), 1)[0];
  }

  makeChunk(x, z) {
    const chunk = new Chunk(x, z);
    this.chunks.push(chunk);
    return chunk;
  }

  pushChunk(chunk) {
    this.chunks.push(chunk);
  }

  forEachObject(fn) {
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i].forEachObject(fn);
    }
  }
}

const _getBlockIndex = (x, y, z) => {
  const ay = Math.floor(y / 16);
  y = y - ay * 16;
  return (ay * (BLOCK_BUFFER_SIZE / 4 / (128 / 16))) + x + y * 16 + z * 16 * 16;
};

const zeode = () => new Zeode();
zeode.Chunk = Chunk;
zeode.OBJECT_BUFFER_SIZE = OBJECT_BUFFER_SIZE;
zeode.BLOCK_BUFFER_SIZE = BLOCK_BUFFER_SIZE;
zeode.GEOMETRY_BUFFER_SIZE = GEOMETRY_BUFFER_SIZE;

module.exports = zeode;
