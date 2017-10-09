const mod = require('mod-loop');

const CHUNK_HEADER_SIZE = 2 * 4;
const NUM_SLOTS = 64 * 64;
const OBJECT_SLOT_FIELDS = 1 + 10 + 1;
const OBJECT_SLOT_SIZE = OBJECT_SLOT_FIELDS * 4;
const VEGETATION_SLOT_FIELDS = 1 + 10;
const VEGETATION_SLOT_SIZE = VEGETATION_SLOT_FIELDS * 4;
const TERRAIN_BUFFER_SIZE = 512 * 1024;
const OBJECT_BUFFER_SIZE = NUM_SLOTS * OBJECT_SLOT_SIZE;
const VEGETATION_BUFFER_SIZE = NUM_SLOTS * VEGETATION_SLOT_SIZE;
const BLOCK_BUFFER_SIZE = 16 * 128 * 16 * 4;
const LIGHT_SLOT_FIELDS = 4;
const LIGHT_SLOT_SIZE = LIGHT_SLOT_FIELDS * 4;
const LIGHT_BUFFER_SIZE = NUM_SLOTS * LIGHT_SLOT_SIZE;
const TRAILER_SLOTS = 32;
const CHUNK_TRAILER_SIZE = TRAILER_SLOTS * 4;
const CHUNK_SIZE = CHUNK_HEADER_SIZE + TERRAIN_BUFFER_SIZE + OBJECT_BUFFER_SIZE + BLOCK_BUFFER_SIZE + LIGHT_BUFFER_SIZE + CHUNK_TRAILER_SIZE;

const localMatrix = Array(10);

const _getChunkIndex = (x, z) => mod(x, 65536) | mod(z, 65536) << 16;

class Chunk {
  constructor(
    x = 0,
    z = 0,
    index = 0,
    terrainBuffer,
    objectBuffer,
    vegetationBuffer,
    blockBuffer,
    lightBuffer,
    trailerBuffer
  ) {
    if (!terrainBuffer || !objectBuffer || !vegetationBuffer || !blockBuffer || !lightBuffer || !trailerBuffer) {
      const buffer = new ArrayBuffer(
        (!terrainBuffer ? TERRAIN_BUFFER_SIZE : 0)+
        (!objectBuffer ? OBJECT_BUFFER_SIZE : 0) +
        (!vegetationBuffer ? VEGETATION_BUFFER_SIZE : 0) +
        (!blockBuffer ? BLOCK_BUFFER_SIZE : 0) +
        (!lightBuffer ? LIGHT_BUFFER_SIZE : 0) +
        (!trailerBuffer ? CHUNK_TRAILER_SIZE : 0)
      );
      let byteOffset = 0;
      if (!terrainBuffer) {
        terrainBuffer = new Uint32Array(buffer, byteOffset, TERRAIN_BUFFER_SIZE / Uint32Array.BYTES_PER_ELEMENT);
        byteOffset += TERRAIN_BUFFER_SIZE;
      }
      if (!objectBuffer) {
        objectBuffer = new Uint32Array(buffer, byteOffset, OBJECT_BUFFER_SIZE / Uint32Array.BYTES_PER_ELEMENT);
        byteOffset += OBJECT_BUFFER_SIZE;
      }
      if (!vegetationBuffer) {
        vegetationBuffer = new Uint32Array(buffer, byteOffset, VEGETATION_BUFFER_SIZE / Uint32Array.BYTES_PER_ELEMENT);
        byteOffset += VEGETATION_BUFFER_SIZE;
      }
      if (!blockBuffer) {
        blockBuffer = new Uint32Array(buffer, byteOffset, BLOCK_BUFFER_SIZE / Uint32Array.BYTES_PER_ELEMENT);
        byteOffset += BLOCK_BUFFER_SIZE;
      }
      if (!lightBuffer) {
        lightBuffer = new Float32Array(buffer, byteOffset, LIGHT_BUFFER_SIZE / Float32Array.BYTES_PER_ELEMENT);
        byteOffset += LIGHT_BUFFER_SIZE;
      }
      if (!trailerBuffer) {
        trailerBuffer = new Uint32Array(buffer, byteOffset, CHUNK_TRAILER_SIZE / Uint32Array.BYTES_PER_ELEMENT);
        byteOffset += CHUNK_TRAILER_SIZE;
      }
    }

    this.x = x;
    this.z = z;
    this.index = index;
    this.terrainBuffer = terrainBuffer;
    this.uint32Buffer = objectBuffer;
    this.float32Buffer = new Float32Array(objectBuffer.buffer, objectBuffer.byteOffset, objectBuffer.length);
    this.vegetationBuffer = vegetationBuffer;
    this.vegetationFloat32Buffer = new Float32Array(vegetationBuffer.buffer, vegetationBuffer.byteOffset, vegetationBuffer.length);
    this.blockBuffer = blockBuffer;
    this.lightBuffer = lightBuffer;
    this.trailerBuffer = trailerBuffer;

    this.dirty = false;
  }

  getTerrainBuffer() {
    return this.terrainBuffer;
  }

  getObjectBuffer() {
    return this.uint32Buffer;
  }

  getVegetationBuffer() {
    return this.vegetationBuffer;
  }

  getBlockBuffer() {
    return this.blockBuffer;
  }

  getLightBuffer() {
    return this.lightBuffer;
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
    for (let i = 0; i < NUM_SLOTS; i++) {
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

  forEachBlock(fn) {
    let index = 0;
    for (let oy = 0; oy < (128 / 16); oy++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const n = this.blockBuffer[index];
            if (n) {
              fn(n, x, oy * 16 + y, z);
            }
            index++;
          }
        }
      }
    }
  }

  addObject(n, matrix, value) {
    let freeIndex = -1;
    for (let i = 0; i < NUM_SLOTS; i++) {
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

  addVegetation(n, matrix) {
    let freeIndex = -1;
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (this.vegetationBuffer[i * VEGETATION_SLOT_FIELDS] === 0) {
        freeIndex = i;
        break;
      }
    }

    if (freeIndex !== -1) {
      let offset = freeIndex * VEGETATION_SLOT_FIELDS;
      this.vegetationBuffer[offset] = n;
      offset++;
      for (let i = 0; i < 10; i++) {
        this.vegetationFloat32Buffer[offset] = matrix[i];
        offset++;
      }

      this.dirty = true;
    }

    return freeIndex;
  }

  getBlock(x, y, z) {
    return this.blockBuffer[_getBlockIndex(x, y, z)];
  }

  setBlock(x, y, z, n) {
    this.blockBuffer[_getBlockIndex(x, y, z)] = n;
  }

  clearBlock(x, y, z) {
    const index = _getBlockIndex(x, y, z);
    const oldN = this.blockBuffer[index];
    this.blockBuffer[index] = 0;
    return oldN;
  }

  forEachLight(fn) {
    let offset = 0;
    for (let i = 0; i < NUM_SLOTS; i++) {
      const v = this.lightBuffer[offset + 3];
      if (v > 0) {
        const x = this.lightBuffer[offset + 0];
        const y = this.lightBuffer[offset + 1];
        const z = this.lightBuffer[offset + 2];

        if (fn(x, y, z, v) === false) {
          return false;
        }
      }

      offset += 4;
    }

    return true;
  }

  addLight(x, y, z, v) {
    let freeIndex = -1;
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (this.lightBuffer[i * LIGHT_SLOT_FIELDS + 3] === 0) {
        freeIndex = i;
        break;
      }
    }

    if (freeIndex !== -1) {
      const offset = freeIndex * LIGHT_SLOT_FIELDS;
      this.lightBuffer[offset + 0] = x;
      this.lightBuffer[offset + 1] = y;
      this.lightBuffer[offset + 2] = z;
      this.lightBuffer[offset + 3] = v;

      this.dirty = true;
    }

    return freeIndex;
  }

  addLightAt(index, x, y, z, v) {
    const offset = index * LIGHT_SLOT_FIELDS;
    this.lightBuffer[offset + 0] = x;
    this.lightBuffer[offset + 1] = y;
    this.lightBuffer[offset + 2] = z;
    this.lightBuffer[offset + 3] = v;

    this.dirty = true;

    return index;
  }

  removeLight(index) {
    const offset = index * LIGHT_SLOT_FIELDS;

    const oldV = this.lightBuffer[offset + 3];

    this.lightBuffer[offset + 0] = 0;
    this.lightBuffer[offset + 1] = 0;
    this.lightBuffer[offset + 2] = 0;
    this.lightBuffer[offset + 3] = 0;

    this.dirty = true;

    return oldV;
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
    this.chunks = {};
  }

  load(buffer) {
    const numChunks = Math.floor(buffer.length / CHUNK_SIZE);
    let {byteOffset} = buffer;
    for (let i = 0; i < numChunks; i++) {
      const chunkHeader = new Int32Array(buffer.buffer, byteOffset, 2);
      const x = chunkHeader[0];
      const z = chunkHeader[1];
      byteOffset += 2 * 4;
      const terrainBuffer = new Uint32Array(buffer.buffer, byteOffset, TERRAIN_BUFFER_SIZE / 4);
      byteOffset += TERRAIN_BUFFER_SIZE;
      const objectBuffer = new Uint32Array(buffer.buffer, byteOffset, OBJECT_BUFFER_SIZE / 4);
      byteOffset += OBJECT_BUFFER_SIZE;
      const blockBuffer = new Uint32Array(buffer.buffer, byteOffset, BLOCK_BUFFER_SIZE / 4);
      byteOffset += BLOCK_BUFFER_SIZE;
      const lightBuffer = new Float32Array(buffer.buffer, byteOffset, LIGHT_BUFFER_SIZE / 4);
      byteOffset += LIGHT_BUFFER_SIZE;
      const chunkTrailer = new Uint32Array(buffer.buffer, byteOffset, CHUNK_TRAILER_SIZE / 4);
      byteOffset += CHUNK_TRAILER_SIZE;

      this.chunks[_getChunkIndex(x, z)] = new Chunk(x, z, i, terrainBuffer, objectBuffer, blockBuffer, lightBuffer, chunkTrailer);
    }
  }

  save(fn) {
    for (const index in this.chunks) {
      const chunk = this.chunks[index];

      if (chunk) {
        if (chunk.dirty) {
          let byteOffset = CHUNK_SIZE * chunk.index;
          fn(byteOffset, Int32Array.from([chunk.x, chunk.z]));
          byteOffset += CHUNK_HEADER_SIZE;
          fn(byteOffset, chunk.terrainBuffer);
          byteOffset += TERRAIN_BUFFER_SIZE;
          fn(byteOffset, chunk.uint32Buffer);
          byteOffset += OBJECT_BUFFER_SIZE;
          fn(byteOffset, chunk.blockBuffer);
          byteOffset += BLOCK_BUFFER_SIZE;
          fn(byteOffset, chunk.lightBuffer);
          byteOffset += LIGHT_BUFFER_SIZE;
          fn(byteOffset, chunk.trailerBuffer);
          byteOffset += CHUNK_TRAILER_SIZE;

          chunk.dirty = false;
        }
      }
    }
  }

  getChunk(x, z) {
    return this.chunks[_getChunkIndex(x, z)];
  }

  addChunk(x, z, i, terrainBuffer, objectBuffer, blockBuffer, lightBuffer) {
    const chunk = new Chunk(x, z, terrainBuffer, objectBuffer, blockBuffer, lightBuffer);
    this.chunks[_getChunkIndex(x, z)] = chunk;
    return chunk;
  }

  removeChunk(x, z) {
    const index = _getChunkIndex(x, z);
    const oldChunk = this.chunks[index];
    this.chunks[index] = null;
    return oldChunk;
  }

  makeChunk(x, z) {
    const chunk = new Chunk(x, z);
    this.chunks[_getChunkIndex(x, z)] = chunk;
    return chunk;
  }

  pushChunk(chunk) {
    this.chunks[_getChunkIndex(chunk.x, chunk.z)] = chunk;
  }

  forEachObject(fn) {
    for (const index in this.chunks) {
      const chunk = this.chunks[index];
      if (chunk) {
        chunk.forEachObject(fn);
      }
    }
  }

  forEachBlock(fn) {
    for (const index in this.chunks) {
      const chunk = this.chunks[index];
      if (chunk) {
        chunk.forEachBlock(fn);
      }
    }
  }

  forEachLight(fn) {
    for (const index in this.chunks) {
      const chunk = this.chunks[index];
      if (chunk) {
        chunk.forEachLight(fn);
      }
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
zeode.TERRAIN_BUFFER_SIZE = TERRAIN_BUFFER_SIZE;
zeode.OBJECT_BUFFER_SIZE = OBJECT_BUFFER_SIZE;
zeode.VEGETATION_BUFFER_SIZE = VEGETATION_BUFFER_SIZE;
zeode.BLOCK_BUFFER_SIZE = BLOCK_BUFFER_SIZE;
zeode.LIGHT_BUFFER_SIZE = LIGHT_BUFFER_SIZE;

module.exports = zeode;
