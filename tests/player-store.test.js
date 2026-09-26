import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerStore, xpRequired } from '../src/player-store.js';

test('PlayerStore creates a profile and persists class', () => {
  const store = new PlayerStore(null, { write:false });
  const player = store.getOrCreate({ userId:'1', username:'Hero' });
  assert.equal(player.level, 1);
  assert.equal(player.classId, null);
  assert.equal(store.setClass('1', 'gladiator').classId, 'gladiator');
});

test('experience can grant several levels', () => {
  const store = new PlayerStore(null, { write:false });
  store.getOrCreate({ userId:'1', username:'Hero' });
  const result = store.addXp('1', xpRequired(1) + xpRequired(2) + 2);
  assert.equal(result.player.level, 3);
  assert.equal(result.player.xp, 2);
  assert.equal(result.levelsGained, 2);
});

test('battle result updates wins, losses and streaks', () => {
  const store = new PlayerStore(null, { write:false });
  store.getOrCreate({ userId:'1', username:'Winner' });
  store.getOrCreate({ userId:'2', username:'Loser' });
  const result = store.recordBattle('1', '2', 5, 1);
  assert.equal(result.winner.player.wins, 1);
  assert.equal(result.winner.player.currentWinStreak, 1);
  assert.equal(result.loser.player.losses, 1);
});
