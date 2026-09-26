import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameManager } from '../src/game-manager.js';
import { PlayerStore } from '../src/player-store.js';
const classes = JSON.parse(fs.readFileSync(new URL('../config/classes.json', import.meta.url)));
const balance = JSON.parse(fs.readFileSync(new URL('../config/balance.json', import.meta.url)));

function setup() {
  const messages = [];
  const store = new PlayerStore(null, { write:false });
  const manager = new GameManager({ classes, balance, store, broadcast:(message) => messages.push(message), random:() => 0.99 });
  return { manager, store, messages };
}

test('player must choose a class before entering PvP queue', () => {
  const { manager } = setup();
  manager.handleCommand({ userId:'1', username:'One', text:'!pvp' });
  assert.equal(manager.queue.length, 0);
});

test('two players start a battle automatically', () => {
  const { manager, messages } = setup();
  manager.handleCommand({ userId:'1', username:'One', text:'!gladiator' });
  manager.handleCommand({ userId:'1', username:'One', text:'!pvp' });
  manager.handleCommand({ userId:'2', username:'Two', text:'!hawkeye' });
  manager.handleCommand({ userId:'2', username:'Two', text:'!pvp' });
  assert.ok(manager.activeBattle);
  assert.equal(manager.queue.length, 0);
  assert.ok(messages.some((message) => message.type === 'battle:sequence'));
});

test('completed battle is recorded once', () => {
  const { manager, store } = setup();
  manager.handleCommand({ userId:'1', username:'One', text:'!gladiator' });
  manager.handleCommand({ userId:'1', username:'One', text:'!pvp' });
  manager.handleCommand({ userId:'2', username:'Two', text:'!hawkeye' });
  manager.handleCommand({ userId:'2', username:'Two', text:'!pvp' });
  const id = manager.activeBattle.battleId;
  const result = manager.finishBattle(id);
  assert.ok(result);
  assert.equal(store.get('1').battles + store.get('2').battles, 2);
  assert.equal(manager.finishBattle(id), null);
});
