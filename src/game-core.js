export class SeededRandom {
  constructor(seed = Date.now()) {
    this.state = Number(seed) >>> 0 || 1;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

export function buildFighter({ id, username, classId, level = 1 }, classes) {
  const classConfig = classes[classId];
  if (!classConfig) throw new Error(`Неизвестный класс: ${classId}`);
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const levelOffset = safeLevel - 1;
  const maxHp = classConfig.baseHp + classConfig.hpPerLevel * levelOffset;
  return {
    id,
    username: String(username || 'Игрок'),
    classId,
    className: classConfig.name,
    role: classConfig.role,
    level: safeLevel,
    maxHp,
    hp: maxHp,
    damage: classConfig.baseDamage + classConfig.damagePerLevel * levelOffset,
    dodgeChance: classConfig.dodgePerLevel * levelOffset,
    critChance: classConfig.critPerLevel * levelOffset,
    critMultiplier: classConfig.critMultiplier,
    asset: classConfig.asset
  };
}

export function calculateAttack(attacker, defender, random = Math.random) {
  const dodgeRoll = random() * 100;
  if (dodgeRoll < defender.dodgeChance) {
    return { dodged: true, critical: false, damage: 0 };
  }

  const critical = random() * 100 < attacker.critChance;
  const rawDamage = critical ? attacker.damage * attacker.critMultiplier : attacker.damage;
  return { dodged: false, critical, damage: Math.max(1, Math.round(rawDamage)) };
}

export function createBattle({ fighter1, fighter2, maxTurns = 100, random = Math.random }) {
  const fighters = [structuredClone(fighter1), structuredClone(fighter2)];
  const events = [{ type: 'battle:start', fighters: structuredClone(fighters) }];
  let turn = 0;

  while (fighters[0].hp > 0 && fighters[1].hp > 0 && turn < maxTurns) {
    const actorIndex = turn % 2;
    const targetIndex = actorIndex === 0 ? 1 : 0;
    const actor = fighters[actorIndex];
    const target = fighters[targetIndex];
    const result = calculateAttack(actor, target, random);

    events.push({ type: 'turn:start', turn: turn + 1, actorId: actor.id, targetId: target.id });
    events.push({ type: 'attack', actorId: actor.id, targetId: target.id, role: actor.role });

    if (result.dodged) {
      events.push({ type: 'dodge', actorId: actor.id, targetId: target.id });
    } else {
      target.hp = Math.max(0, target.hp - result.damage);
      events.push({
        type: 'damage',
        actorId: actor.id,
        targetId: target.id,
        damage: result.damage,
        critical: result.critical,
        targetHp: target.hp,
        targetMaxHp: target.maxHp
      });
    }
    turn += 1;
  }

  const winner = fighters.find((fighter) => fighter.hp > 0) || fighters[0];
  const loser = fighters.find((fighter) => fighter.id !== winner.id);
  events.push({ type: 'death', fighterId: loser.id, winnerId: winner.id });
  events.push({ type: 'battle:end', winnerId: winner.id, loserId: loser.id, turns: turn });

  return { events, fighters, winner, loser, turns: turn };
}
