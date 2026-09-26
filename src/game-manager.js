import crypto from 'node:crypto';
import { buildFighter, createBattle } from './game-core.js';
import { normalizeUsername, xpRequired } from './player-store.js';

export class GameManager {
  constructor({ classes, balance, store, broadcast = () => {}, sendChat = () => {}, random = Math.random }) {
    this.classes = classes;
    this.balance = balance;
    this.store = store;
    this.broadcast = broadcast;
    this.sendChat = sendChat;
    this.random = random;
    this.queue = [];
    this.activeBattle = null;
    this.cooldowns = new Map();
  }

  resolveUser(input = {}) {
    const username = String(input.username || input.userName || input.sender || '').trim().replace(/^@/, '');
    const userId = String(input.userId || input.id || input.senderId || normalizeUsername(username));
    if (!username || !userId) throw new Error('Не удалось определить пользователя');
    return { userId, username };
  }

  reply(message, user = null) {
    const payload = { type: 'chat:reply', message, ...(user ? { userId: user.userId, username: user.username } : {}) };
    this.sendChat(payload);
    this.broadcast(payload);
    return payload;
  }

  help(user) {
    return this.reply('Команды: !gladiator, !hawkeye, !pvp, !leave, !stats, !queue, !help', user);
  }

  chooseClass(user, classId) {
    const player = this.store.getOrCreate(user);
    this.store.setClass(player.id, classId);
    return this.reply(`@${player.username}, выбран класс «${this.classes[classId].name}». Встаньте в очередь: !pvp`, user);
  }

  stats(user) {
    const player = this.store.getOrCreate(user);
    const className = player.classId ? this.classes[player.classId]?.name : 'не выбран';
    return this.reply(`@${player.username}: ур. ${player.level}, опыт ${player.xp}/${xpRequired(player.level)}, побед ${player.wins}, поражений ${player.losses}, серия ${player.currentWinStreak}, класс ${className}.`, user);
  }

  queueStatus(user) {
    if (!this.queue.length) return this.reply('Очередь PvP пуста.', user);
    return this.reply(`Очередь PvP (${this.queue.length}): ${this.queue.map((item, index) => `${index + 1}. @${item.username}`).join(', ')}`, user);
  }

  joinQueue(user) {
    const player = this.store.getOrCreate(user);
    if (!player.classId) return this.reply(`@${player.username}, сначала выберите класс: !gladiator или !hawkeye`, user);
    if (this.activeBattle?.playerIds.includes(player.id)) return this.reply(`@${player.username}, вы уже участвуете в текущем бою.`, user);
    if (this.queue.some((item) => item.id === player.id)) return this.reply(`@${player.username}, вы уже в очереди.`, user);
    const cooldownUntil = this.cooldowns.get(player.id) || 0;
    if (Date.now() < cooldownUntil) {
      const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return this.reply(`@${player.username}, до следующего входа в очередь ${seconds} сек.`, user);
    }
    this.queue.push(player);
    this.broadcast({ type: 'queue:update', players: this.queue.map(({ id, username, classId, level }) => ({ id, username, classId, level })) });
    this.reply(`@${player.username} в очереди PvP. Позиция: ${this.queue.length}.`, user);
    this.tryStartBattle();
  }

  leaveQueue(user) {
    const index = this.queue.findIndex((item) => item.id === user.userId);
    if (index < 0) return this.reply(`@${user.username}, вас нет в очереди.`, user);
    this.queue.splice(index, 1);
    this.broadcast({ type: 'queue:update', players: this.queue.map(({ id, username, classId, level }) => ({ id, username, classId, level })) });
    return this.reply(`@${user.username} покинул очередь PvP.`, user);
  }

  tryStartBattle() {
    if (this.activeBattle || this.queue.length < 2) return null;
    const players = this.queue.splice(0, 2);
    const [player1, player2] = players;
    const fighter1 = buildFighter({ id: player1.id, username: player1.username, classId: player1.classId, level: player1.level }, this.classes);
    const fighter2 = buildFighter({ id: player2.id, username: player2.username, classId: player2.classId, level: player2.level }, this.classes);
    const battle = createBattle({ fighter1, fighter2, maxTurns: this.balance.battle.maxTurns, random: this.random });
    const battleId = crypto.randomUUID();
    this.activeBattle = { battleId, playerIds: players.map((player) => player.id), battle };
    this.broadcast({ type: 'queue:update', players: this.queue.map(({ id, username, classId, level }) => ({ id, username, classId, level })) });
    this.broadcast({ type: 'battle:sequence', battleId, events: battle.events });
    this.reply(`Бой начинается: @${player1.username} против @${player2.username}!`);
    return this.activeBattle;
  }

  finishBattle(battleId) {
    if (!this.activeBattle || this.activeBattle.battleId !== battleId) return null;
    const { winner, loser } = this.activeBattle.battle;
    const result = this.store.recordBattle(winner.id, loser.id, this.balance.progression.winnerXp, this.balance.progression.loserXp);
    const cooldownMs = Math.max(0, Number(this.balance.progression.pvpCooldownSeconds) || 0) * 1000;
    this.cooldowns.set(winner.id, Date.now() + cooldownMs);
    this.cooldowns.set(loser.id, Date.now() + cooldownMs);
    this.activeBattle = null;
    this.broadcast({ type: 'battle:recorded', battleId, winner: result.winner, loser: result.loser });
    this.reply(`Победитель: @${winner.username}. +${this.balance.progression.winnerXp} опыта!`);
    this.tryStartBattle();
    return result;
  }

  handleCommand(input = {}) {
    const user = this.resolveUser(input);
    const text = String(input.text || input.message || '').trim();
    const command = text.split(/\s+/)[0].toLowerCase();
    if (!command.startsWith('!')) return null;
    const aliases = {
      '!gladiator': 'gladiator', '!гладиатор': 'gladiator', '!duelist': 'gladiator', '!knight': 'gladiator',
      '!hawkeye': 'hawkeye', '!хавк': 'hawkeye', '!archer': 'hawkeye', '!ranger': 'hawkeye',
      '!pvp': 'pvp', '!пвп': 'pvp', '!leave': 'leave', '!выйти': 'leave',
      '!stats': 'stats', '!статы': 'stats', '!queue': 'queue', '!очередь': 'queue', '!help': 'help', '!помощь': 'help'
    };
    const action = aliases[command];
    if (!action) return null;
    if (action === 'gladiator' || action === 'hawkeye') return this.chooseClass(user, action);
    if (action === 'pvp') return this.joinQueue(user);
    if (action === 'leave') return this.leaveQueue(user);
    if (action === 'stats') return this.stats(user);
    if (action === 'queue') return this.queueStatus(user);
    return this.help(user);
  }
}
