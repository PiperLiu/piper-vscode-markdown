'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
async function assertSeparateDestination(source, destination) {
  if (path.resolve(source) === path.resolve(destination)) throw new Error('Export must not overwrite the source Markdown document.');
  const sourceStat = await fs.stat(source);
  try {
    const targetStat = await fs.stat(destination);
    if (sourceStat.dev === targetStat.dev && sourceStat.ino === targetStat.ino) throw new Error('Export destination points to the source Markdown document.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
module.exports = { assertSeparateDestination };
