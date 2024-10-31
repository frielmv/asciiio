const perlin = require('perlin-noise');

function getTerrainValue(val) {
  if (val < 0.3) return 0; //water
  if (val < 0.38) return 1; //sand
  if (val < 0.46) return 2; //plains
  if (val < 0.6) return 3; //grassland
  if (val < 0.7) return 4; //forest
  if (val < 0.75) return 5; //hills
  if (val < 0.85) return 6; //mountains
  else           return 7; //peaks
}
const MAP_SIZE = 100; // size of the map
var terrainTmp = perlin.generatePerlinNoise(MAP_SIZE, MAP_SIZE, { octaveCount: 5 }).map(getTerrainValue);
var terrain = [];
for(let i = 0; i < MAP_SIZE ** 2; i += MAP_SIZE) {
  let innerArray = terrainTmp.slice(i, i + MAP_SIZE);
  terrain.push(innerArray);
}

//2d array map[y][x]
exports.array = terrain;

exports.MAP_SIZE = MAP_SIZE; // subtracting 2 for borders