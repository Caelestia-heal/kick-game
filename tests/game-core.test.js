import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFighter, calculateAttack, createBattle, SeededRandom } from '../src/game-core.js';

const classes = JSON.parse(fs.readFileSync(new URL('../config/classes.json', import.meta.url)));

test('характеристики растут от уровня', () => {
  const fighter = buildFighter({ id: '1', username: 'Test', classId: 'gladiator', level: 5 }, classes);
  assert.equal(fighter.maxHp, 122);
  assert.equal(fighter.damage, 15);
  assert.equal(fighter.dodgeChance, 1.4);
});

test('уклонение отменяет урон', () => {
  const attacker = { damage: 10, critChance: 0, critMultiplier: 1.75 };
  const defender = { dodgeChance: 100 };
  assert.deepEqual(calculateAttack(attacker, defender, () => 0), { dodged: true, critical: false, damage: 0 });
});

test('бой всегда завершается победителем', () => {
  const random = new SeededRandom(42);
  const fighter1 = buildFighter({ id: 'p1', username: 'A', classId: 'gladiator' }, classes);
  const fighter2 = buildFighter({ id: 'p2', username: 'B', classId: 'hawkeye' }, classes);
  const result = createBattle({ fighter1, fighter2, random: () => random.next() });
  assert.ok(result.winner);
  assert.equal(result.loser.hp, 0);
  assert.equal(result.events.at(-1).type, 'battle:end');
  assert.ok(result.turns <= 100);
});
