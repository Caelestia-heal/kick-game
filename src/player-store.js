import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DATA = { version: 1, players: {} };

export function xpRequired(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return 10 + (safeLevel - 1) * 5;
}

export function normalizeUsername(username) {
  return String(username || '').trim().replace(/^@/, '').toLowerCase();
}

export class PlayerStore {
  constructor(filePath, { write = true } = {}) {
    this.filePath = filePath;
    this.write = write;
    this.data = structuredClone(DEFAULT_DATA);
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed && parsed.players) this.data = parsed;
    } catch (error) {
      console.error('Не удалось прочитать базу игроков:', error.message);
    }
  }

  save() {
    if (!this.write || !this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2));
    fs.renameSync(temporary, this.filePath);
  }

  get(userId) {
    return this.data.players[String(userId)] || null;
  }

  getOrCreate({ userId, username }) {
    const id = String(userId || normalizeUsername(username));
    if (!id) throw new Error('Не указан ID пользователя');
    let player = this.data.players[id];
    if (!player) {
      player = {
        id,
        username: String(username || id),
        classId: null,
        level: 1,
        xp: 0,
        wins: 0,
        losses: 0,
        battles: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.data.players[id] = player;
      this.save();
    } else if (username && player.username !== username) {
      player.username = String(username);
      player.updatedAt = new Date().toISOString();
      this.save();
    }
    return structuredClone(player);
  }

  setClass(userId, classId) {
    const player = this.data.players[String(userId)];
    if (!player) throw new Error('Игрок не найден');
    player.classId = classId;
    player.updatedAt = new Date().toISOString();
    this.save();
    return structuredClone(player);
  }

  addXp(userId, amount) {
    const player = this.data.players[String(userId)];
    if (!player) throw new Error('Игрок не найден');
    player.xp += Math.max(0, Math.floor(Number(amount) || 0));
    let levelsGained = 0;
    while (player.xp >= xpRequired(player.level)) {
      player.xp -= xpRequired(player.level);
      player.level += 1;
      levelsGained += 1;
    }
    player.updatedAt = new Date().toISOString();
    this.save();
    return { player: structuredClone(player), levelsGained };
  }

  recordBattle(winnerId, loserId, winnerXp, loserXp) {
    const winner = this.data.players[String(winnerId)];
    const loser = this.data.players[String(loserId)];
    if (!winner || !loser) throw new Error('Один из игроков не найден');
    winner.wins += 1;
    winner.battles += 1;
    winner.currentWinStreak += 1;
    winner.bestWinStreak = Math.max(winner.bestWinStreak, winner.currentWinStreak);
    loser.losses += 1;
    loser.battles += 1;
    loser.currentWinStreak = 0;
    const winnerProgress = this.addXp(winner.id, winnerXp);
    const loserProgress = this.addXp(loser.id, loserXp);
    this.save();
    return { winner: winnerProgress, loser: loserProgress };
  }
}
