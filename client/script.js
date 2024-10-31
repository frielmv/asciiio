// stuff for recording keybinds
const KEYBINDS = {
  'W': 'use0',
  'D': 'use1',
  'S': 'use2',
  'A': 'use3',

  ' ': 'move',
  'E': 'pickup',
  'SHIFT': 'reload',
  'V': 'drop'
};
var startScreen = true; // whether to display the start screen info
var actions = new Set();
var actionDeleteCache = new Set();
window.addEventListener('keydown', function(event) {
  if(KEYBINDS[event.key.toUpperCase()] !== undefined) {
    startScreen = false;
    actions.add(KEYBINDS[event.key.toUpperCase()]);
  }
});
window.addEventListener('keyup', function() {
  if(KEYBINDS[event.key.toUpperCase()] !== undefined) {
    actionDeleteCache.add(KEYBINDS[event.key.toUpperCase()]);
  }
});

// display stuff
const REQUEST_RATE = 100; // request rate in milliseconds, should be divisible by tick rate
const TERRAIN_CHARS = [
  ['~', 'blue'], // water
  [';', 'sandybrown'], // sand
  ['/', 'burlywood'], // plains
  ['%', 'green'], // grassland
  ['*', 'darkgreen'], // forest
  ['&', '#613317'], // hills
  ['#', 'dimgray'], // mountains
  ['A', 'silver'], // peaks
];
const SCREEN_SIZE = 55;
const halfView = Math.floor(SCREEN_SIZE / 2);
var pixels = [];
for(let i = 0; i < SCREEN_SIZE ** 2; i++) {
  const pixel = document.createElement('div');
  document.getElementById('screen').appendChild(pixel);
  pixels.push(pixel);
}
function sentence(startPos, str) {
  let startIndex = startPos[1] * SCREEN_SIZE + startPos[0];
  const chars = str.split('');
  let pos = -1;
  for(let i = 0; i < chars.length; i++) {
    pos++;
    if(chars[i] != ' ') {
      if(chars[i] == '\n') {
        startIndex += SCREEN_SIZE;
        pos = -1;
      } else {
        char(pixels[startIndex + pos], chars[i], 'white');
      }
    }
  }
}
function char(pixel, character, color, className = '') {
  pixel.textContent = character;
  pixel.style.color = color;
  pixel.style.backgroundImage = 'none';
  pixel.className = className;
}

function img(pixel, objectNames, className = '') {
  pixel.textContent = '';
  pixel.style.color = 'transparent';
  pixel.style.backgroundImage = objectNames.map(name => `url("assets/${name}.png")`).join(', ');
  pixel.className = className;
}

// coordinates from top left
var name, color, map, lastClock, clockDelay;
var testing = false;

var mouseX, mouseY;
window.onmousemove = function(event) {
  mouseX = event.clientX - (window.innerWidth / 2);
  mouseY = event.clientY - (window.innerHeight / 2);
}

fetch('/start', { method: 'GET' })
  .then(res => res.json())
  .then(init);

function init(data) {
  name = data.name;
  color = data.color;
  map = data.map;
  clock();
}

function clock() {
  lastClock = Date.now();
  fetch('/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name,
      direction: Math.atan2(mouseY, mouseX),
      activeSlots: [actions.has('use0'), actions.has('use1'), actions.has('use2'), actions.has('use3')],
      actions: Array.from(actions)
    })
  })
  .then(res => res.text())
  .then(data => {
    if(data == 'killed') { // killing player if they got disconnected
      window.close();
      document.body.textContent = "You Died.";
    }
    data = JSON.parse(data);

    let index = 0;
    for(let y = data.pos[1] - halfView; y <= data.pos[1] + halfView; y++) { // displaying terrain
      for(let x = data.pos[0] - halfView; x <= data.pos[0] + halfView; x++) {
        if(x < 0 || x >= map[0].length || y < 0 || y >= map.length) { // off the border
          char(pixels[index], 'X', '#222222');
        } else { // terrain
          char(pixels[index], ...TERRAIN_CHARS[map[y][x]]);
        }
        index++;
      }
    }

    for(let i = 0; i < data.objects.length; i++) {
      const object = data.objects[i];
      const relativePos = [object.pos[0] - data.pos[0], object.pos[1] - data.pos[1]];
      const loc = (relativePos[1] + halfView) * SCREEN_SIZE + (relativePos[0] + halfView);
      if(Math.max(Math.abs(relativePos[0]), Math.abs(relativePos[1])) <= halfView) {
        if(object.type == 'player') {
          char(pixels[loc], 'O', object.color);
        } else if(object.type == 'item') {
          let names = [object.name];
          if(object.status == 'firing') names.unshift('muzzleFlash');
          img(pixels[loc], names, object.status);
        } else if(object.type == 'projectile') {
          img(pixels[loc], [object.name]);
        }
      }
    }

    if(startScreen) {
      sentence([1, 1], 'move: SPACE\n\npick up: E\n\nshoot: W/A/S/D\n\nreload: SHIFT+W/A/S/D\n\ndrop: V+W/A/S/D');
    } else {
      sentence([1, 1], name);
    }

    // clearing removed keybinds
    for(const action of Array.from(actionDeleteCache)) {
      actions.delete(action);
    }
    actionDeleteCache.clear();

    if(testing) {
      console.log(clockDelay);
    }
    clockDelay = Math.max(0, REQUEST_RATE - (Date.now() - lastClock)); // this must be above 0 otherwise it lags
  	setTimeout(clock, clockDelay);
  });
}

function test() {
  testing = true;
}