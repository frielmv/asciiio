const path = require('path');
const chalk = require('chalk');
const terrain = require(path.join(__dirname, 'terrain.js'));

// returns a value limited to the map size
function clamp(val) {
  if(val < 0) return 0;
  else if(val > terrain.MAP_SIZE -1) return terrain.MAP_SIZE -1;
  else return val;
}

const fetch = require('sync-fetch');
const COLORS =
  fetch('https://xkcd.com/color/rgb.txt')
  .text()
  .split('\n')
  .map(set => {
    const array = set.split('\t').slice(0, -1);
    return {
      name: array[0],
      hex: array[1]
    };
  })
  .slice(1);

const TICK_RATE = 100; // tick rate in milliseconds
function tick() {
  return Math.floor(Date.now() / TICK_RATE);
}

function randomPos() {
  return [Math.floor(Math.random() * terrain.MAP_SIZE), Math.floor(Math.random() * terrain.MAP_SIZE)];
}

var players = {}; // list of players, { name: PlayerObject }
const MOVEMENT_SPEED = 1.1; // number of pixels to move per server call (not per tick)
class Player { // players in the game
  constructor(colorData) {
    this.name = colorData.name;
    this.color = colorData.hex;
  }

  lastPing = Date.now();

  updateHotbarPos() {
    for(let slot = 0; slot < this.hotbar.length; slot++) {
      if(this.hotbar[slot] !== null) {
        let relativePos;
        switch(slot) {
          case 0:
            relativePos = [0, -1];
            break;
          case 1:
            relativePos = [1, 0];
            break;
          case 2:
            relativePos = [0, 1];
            break;
          case 3:
            relativePos = [-1, 0];
        }
        this.hotbar[slot].pos = [this.pos[0] + relativePos[0], this.pos[1] + relativePos[1]];
      }
    }
  }
  
  // movement
  pos = randomPos();
  direction = 0;
  decimalPos = this.pos;
  move() { // direction to move in radians
    const inWater = terrain.array[this.pos[1]][this.pos[0]] == 0;
    let movementMultiplier = MOVEMENT_SPEED;
    if(inWater) {
      movementMultiplier *= 0.4; // fraction of speed in water
    }
    
    this.decimalPos = [clamp(this.decimalPos[0] + (Math.cos(this.direction) * movementMultiplier)), clamp(this.decimalPos[1] + (Math.sin(this.direction) * movementMultiplier))];
    this.pos = [Math.round(this.decimalPos[0]), Math.round(this.decimalPos[1])];
    this.updateHotbarPos();
  }

  hotbar = [null, null, null, null]; // [top, right, bottom, left]
  attemptPickup(item) {
    for(let i = 0; i < this.hotbar.length; i++) {
      if(this.hotbar[i] === null) {
        this.hotbar[i] = item;
        item.owner = {
          player: this,
          slot: i
        };
        break;
      }
    }
    this.updateHotbarPos();
  }
  dropItem(slotIndex) {
    this.hotbar[slotIndex].owner = undefined;
    this.hotbar[slotIndex] = null;
  }

  kill(forced, message) {
    const shield = this.hotbar.find(slot => slot !== null && slot.name == 'shield'); // finding the first shield
    if(!forced && shield !== undefined) { // using a shield
      shield.destroy();
    } else {
      for(let i = 0; i < this.hotbar.length; i++) { // drop all items on death
        if(this.hotbar[i] !== null) {
          this.dropItem(i);
        }
      }
      for(let i = 0; i < ITEMS_PER_PLAYER; i++) { // this part is inefficient, maybe fix later
        let loc = Math.floor(Math.random() * items.length);
        while(items[loc].owner !== undefined) {
          loc = (loc + 1) % items.length;
        }
        items.splice(loc, 1);
      }
      console.log(message);
      delete players[this.name];
    }
  }
}

var items = [];
const itemData = {
  ar: {
    CAPACITY: 20,
    COOLDOWN: 2, // cooldown between shots in ticks
    RELOAD: 12, // number of ticks to reload
    SPEED: 1.5,
    RANGE: 100,
    shoot(item) {
      projectiles.add(new Projectile('bullet', item));
    }
  },
  pistol: {
    CAPACITY: 10,
    COOLDOWN: 3,
    RELOAD: 6,
    SPEED: 1.5,
    RANGE: 50,
    shoot(item) {
      projectiles.add(new Projectile('bullet', item));
    }
  },
  shotgun: {
    CAPACITY: 1,
    RELOAD: 5,
    SPEED: 1.2,
    RANGE: 20,
    shoot(item, direction) {
      for(let i = -1; i <= 1; i++) {
        projectiles.add(new Projectile('bullet', item, direction + (i * 0.1)));
      }
    }
  },
  smg: {
    CAPACITY: 40,
    RELOAD: 15,
    COOLDOWN: 1,
    SPEED: 2,
    RANGE: 30,
    shoot(item) {
      projectiles.add(new Projectile('bullet', item));
    }
  },
  minigun: {
    CAPACITY: 100,
    RELOAD: 30,
    SPEED: 2.5,
    RANGE: 30,
    shoot(item, direction) {
      projectiles.add(new Projectile('bullet', item, direction - 0.15 + (Math.random() * 0.3)));
    }
  },
  grenade: {
    SINGLE_USE: true,
    SPEED: 1,
    RANGE: 15,
    shoot(item) {
      const BULLET_COUNT = 30;
      projectiles.add(new Projectile('grenadeLit', item, undefined, false, function(newPos) {
        for(let i = 0; i < BULLET_COUNT; i++) {
          projectiles.add(new Projectile('bullet', { SPEED: 1, RANGE: 6, pos: newPos, shooterName: 'grenade' }, 2 * Math.PI / BULLET_COUNT * i));
        }
      }));
    }
  },
  shield: {
    // shield code is in the player.kill() method
  }
};
const ITEM_NAMES = Object.keys(itemData);
class Item { // items that can be picked up and used
  name = ITEM_NAMES[Math.floor(Math.random() * ITEM_NAMES.length)];
  pos = randomPos();
  owner = undefined; // owner (undefined if no owner) { player, slot }
  data = itemData[this.name];
  lastUsed = 0;
  startedReload = 0;
  reloaded = true;
  ammo = this.data.CAPACITY;
  destroy() {
    this.owner.player.hotbar[this.owner.slot] = null;
    items.splice(items.indexOf(this), 1);
    items.push(new Item());
  }
  use() { // shoot / throw item
    if(this.data.SINGLE_USE) { // single use things like grenades
      this.data.shoot(this, this.owner.player.direction);
      this.destroy();
    } else if(
      this.data.shoot !== undefined
      &&
      this.reloaded && this.ammo > 0
      &&
      (this.data.COOLDOWN === undefined || tick() - this.lastUsed > this.data.COOLDOWN)
    ) {
      this.data.shoot(this, this.owner.player.direction);
      this.ammo--;
      this.lastUsed = tick();
    }
  }
  status() {
    if(!this.reloaded && tick() - this.startedReload >= this.data.RELOAD) {
      this.ammo = this.data.CAPACITY;
      this.reloaded = true;
    }

    if(this.lastUsed == tick()) return 'firing';
    else if(!this.reloaded) return 'reloading';
    else if(this.ammo == 0) return 'unloaded';
    else return 'loaded';
  }
  reload() {
    if(this.data.RELOAD !== undefined) {
      this.startedReload = tick();
      this.reloaded = false;
    }
  }
}

var projectiles = new Set();
const BULLET_HEIGHT = 2; // height of bullet over terrain
class Projectile { // bullets, grenades, things that can't be picked up and inflict damage
  constructor(name, item, dir, terrainInteraction = true, callback) {
    this.name = name;
    if(item instanceof Item) { // item object
      this.speed = itemData[item.name].SPEED;
      this.range = itemData[item.name].RANGE;
      this.shooter = item.owner.player;
      this.direction = dir;
      if(this.direction === undefined) {
        this.direction = this.shooter.direction;
      }
    } else { // custom properties
      this.speed = item.SPEED;
      this.range = item.RANGE;
      this.shooterName = item.shooterName;
      this.direction = dir;
    }
    this.startPos = item.pos;
    this.terrainInteraction = terrainInteraction;
    this.callback = callback;
  }
  startTick = tick();
  distance() {
    return (tick() - this.startTick) * this.speed;
  }
  getPos() {
    const dist = this.distance();
    return [Math.round(this.startPos[0] + (Math.cos(this.direction) * dist)), Math.round(this.startPos[1] + (Math.sin(this.direction) * dist))];
  }
  clock() {
    const pos = this.getPos();
    if(
      this.distance() > this.range // travel distance
      ||
      Math.max(...pos) >= terrain.MAP_SIZE || Math.min(...pos) < 0 // edge of map
      ||
      (this.terrainInteraction && terrain.array[pos[1]][pos[0]] > terrain.array[this.startPos[1]][this.startPos[0]] + BULLET_HEIGHT - 1) // terrain interaction
    ) { // bullet strikes something
      if(this.callback !== undefined) {
        this.callback(pos);
      }
      projectiles.delete(this);
    } else {
      for(const player of Object.values(players)) { // killing players
        if(player !== this.shooter && player.pos[0] == pos[0] && player.pos[1] == pos[1]) {
          player.kill(false, `${this.shooter === undefined ? chalk.bold(this.shooterName) : chalk.bold.hex(this.shooter.color)(this.shooter.name)} killed ${chalk.bold.hex(player.color)(player.name)}.`);
        }
      }
    }
  }
}

const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/client')));
const PORT = 3000;
// get this using "ipconfig" in command prompt
const HOST = 'localhost';
app.listen(PORT, function() {
  console.log('Server running at ' + chalk.bold(`http://${HOST}:${PORT}`) + '.');
});

// prevents bad request errors
app.use((err, req, res, next) =>
{
	if(!err.code == 'ECONNABORTED')
		console.warn(err.stack);
	res.end();
});

const ITEMS_PER_PLAYER = 20; // number of items that spawn per player (must be >= number of hotbar items otherwise game will crash)
app.get('/start', (req, res) => {
  let colorData;
  do {
    colorData = COLORS[Math.floor(Math.random() * COLORS.length)];
  } while(players[colorData.name] !== undefined);
  players[colorData.name] = new Player(colorData);
  for(let i = 0; i < ITEMS_PER_PLAYER; i++) {
    items.push(new Item());
  }
  console.log(`${chalk.bold.hex(colorData.hex)(colorData.name)} joined the server.`);
  res.json({
    name: colorData.name,
    color: colorData.hex,
    map: terrain.array
  });
});

const PLAYER_TIMEOUT = 10 * 1000; // number of milliseconds before a player is considered disconnected
// inputs: name, cursor rotation (null if not moving)
app.post('/update', (req, res) => {
  const requestingPlayer = players[req.body.name];

  if(requestingPlayer === undefined) { // player is dead
    res.send('killed');
    return;
  }

  if(tick() > requestingPlayer.lastPing) { // run on a new tick
    requestingPlayer.direction = req.body.direction;
    if(req.body.actions.includes('move')) { // movement
      requestingPlayer.move();
    }

    if(req.body.actions.includes('pickup')) {
      for(const item of items.filter(item => item.owner === undefined)) { // pick up items
        if(Math.max(Math.abs(requestingPlayer.pos[0] - item.pos[0]), Math.abs(requestingPlayer.pos[1] - item.pos[1])) <= 1) {
          requestingPlayer.attemptPickup(item);
        }
      }
    } else {
      for(let i = 0; i < req.body.activeSlots.length; i++) { // using items
        if(req.body.activeSlots[i] && requestingPlayer.hotbar[i] !== null) {
          if(req.body.actions.includes('drop')) {
            requestingPlayer.dropItem(i);
          } else if(req.body.actions.includes('reload')) {
            requestingPlayer.hotbar[i].reload();
          } else {
            requestingPlayer.hotbar[i].use();
          }
        }
      }
    }
  }

  for(const projectile of Array.from(projectiles)) { // 
    projectile.clock();
  }

  let objects = Array.from(projectiles).map(projectile => ({ // in order of back to front (which object overwrites another)
    type: 'projectile',
    name: projectile.name,
    pos: projectile.getPos()
  }));

  let frontObjects = []; // objects in the front z position

  for(const item of items) {
    const data = {
      type: 'item',
      name: item.name,
      pos: item.pos,
      status: item.status()
    };
    if(item.owner === undefined) { // unowned items
      objects.push(data);
    } else {
      frontObjects.push(data);
    }
  }

  requestingPlayer.lastPing = tick();
  // removing inactive players and adding others to array
  for(const [name, player] of Object.entries(players)) {
    if(tick() - player.lastPing > PLAYER_TIMEOUT / TICK_RATE) {
      players[name].kill(true, `${chalk.bold.hex(players[name].color)(name)} disconnected (timeout).`);
    }
    objects.push({
      type: 'player',
      color: player.color,
      pos: player.pos
    });
  }

  res.json({
    pos: requestingPlayer.pos,
    hotbar: requestingPlayer.hotbar.map(slot => slot === null ? null : slot.name),
    objects: objects.concat(frontObjects)
  });
});
