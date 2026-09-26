import { buildFighter, createBattle, SeededRandom } from '../src/game-core.js';

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const params = new URLSearchParams(location.search);
if (params.get('overlay') === '1') document.body.classList.add('overlay-mode');

const elements = {
  stage: $('#battleStage'), status: $('#roundStatus'), log: $('#battleLog'), result: $('#battleResult'),
  winnerName: $('#winnerName'), winnerReward: $('#winnerReward'), start: $('#startBattle'), reset: $('#resetBattle'),
  projectile: $('#projectile'), impact: $('#impact'), connection: $('#connectionStatus'),
  slots: {
    left: { root: $('#fighterLeft'), image: $('#leftImage'), name: $('#leftName'), className: $('#leftClass'), level: $('#leftLevel'), fill: $('#leftHpFill'), text: $('#leftHpText'), track: $('#fighterLeft .hp-track') },
    right: { root: $('#fighterRight'), image: $('#rightImage'), name: $('#rightName'), className: $('#rightClass'), level: $('#rightLevel'), fill: $('#rightHpFill'), text: $('#rightHpText'), track: $('#fighterRight .hp-track') }
  }
};

let classes;
let balance;
let battleRunning = false;
let currentFighters = [];
let socket;

async function loadConfig() {
  [classes, balance] = await Promise.all([
    fetch('../config/classes.json').then((response) => response.json()),
    fetch('../config/balance.json').then((response) => response.json())
  ]);
  resetArena();
  connectWebSocket();
}

function formFighter(side) {
  const prefix = side === 'left' ? 'left' : 'right';
  return buildFighter({
    id: side,
    username: $(`#${prefix}NameInput`).value.trim() || (side === 'left' ? 'Игрок 1' : 'Игрок 2'),
    classId: $(`#${prefix}ClassInput`).value,
    level: Number($(`#${prefix}LevelInput`).value)
  }, classes);
}

function renderFighter(side, fighter) {
  const ui = elements.slots[side];
  ui.root.dataset.fighterId = fighter.id;
  ui.root.dataset.role = fighter.role;
  ui.name.textContent = fighter.username;
  ui.className.textContent = fighter.className;
  ui.level.textContent = `УР. ${fighter.level}`;
  ui.image.src = fighter.asset;
  ui.image.alt = `${fighter.className}, ${fighter.username}`;
  ui.root.classList.toggle('is-archer', fighter.classId === 'archer');
  setHp(side, fighter.hp, fighter.maxHp);
}

function setHp(side, hp, maxHp) {
  const ui = elements.slots[side];
  const safeHp = Math.max(0, Math.min(maxHp, hp));
  const percent = maxHp ? (safeHp / maxHp) * 100 : 0;
  ui.fill.style.width = `${percent}%`;
  ui.text.textContent = `${safeHp} / ${maxHp}`;
  ui.track.setAttribute('aria-valuemax', String(maxHp));
  ui.track.setAttribute('aria-valuenow', String(safeHp));
}

function addLog(message) {
  const item = document.createElement('li');
  item.textContent = message;
  elements.log.prepend(item);
  while (elements.log.children.length > 3) elements.log.lastElementChild.remove();
}

function clearTransientClasses() {
  Object.values(elements.slots).forEach(({ root }) => root.classList.remove('is-approaching', 'is-attacking', 'is-ranged', 'is-hit', 'is-dodging'));
}

function resetArena() {
  if (!classes) return;
  battleRunning = false;
  elements.start.disabled = false;
  elements.result.classList.remove('is-visible');
  elements.log.replaceChildren();
  elements.status.textContent = 'Ожидание боя';
  Object.values(elements.slots).forEach(({ root }) => root.className = root.classList.contains('fighter-slot--left') ? 'fighter-slot fighter-slot--left' : 'fighter-slot fighter-slot--right');
  currentFighters = [formFighter('left'), formFighter('right')];
  renderFighter('left', currentFighters[0]);
  renderFighter('right', currentFighters[1]);
  addLog('Арена готова. Запустите тестовый бой.');
}

function sideById(id) {
  return currentFighters[0]?.id === id ? 'left' : 'right';
}

function pointFor(slot, kind = 'center') {
  const rect = elements.slots[slot].image.getBoundingClientRect();
  const stageRect = elements.stage.getBoundingClientRect();
  const xRatio = kind === 'launch' ? (slot === 'left' ? .72 : .28) : .5;
  return { x: rect.left - stageRect.left + rect.width * xRatio, y: rect.top - stageRect.top + rect.height * .44 };
}

async function animateProjectile(actorSide, targetSide) {
  const start = pointFor(actorSide, 'launch');
  const end = pointFor(targetSide);
  const projectile = elements.projectile;
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  projectile.style.display = 'block';
  projectile.style.left = `${start.x}px`;
  projectile.style.top = `${start.y}px`;
  projectile.style.transform = `translate(0,0) rotate(${angle}deg)`;
  projectile.style.transition = 'none';
  void projectile.offsetWidth;
  projectile.style.transition = `transform ${balance.battle.projectileMs}ms linear`;
  projectile.style.transform = `translate(${end.x - start.x}px,${end.y - start.y}px) rotate(${angle}deg)`;
  await sleep(balance.battle.projectileMs);
  projectile.style.display = 'none';
  elements.impact.style.left = `${end.x}px`;
  elements.impact.style.top = `${end.y}px`;
  elements.impact.classList.remove('is-active');
  void elements.impact.offsetWidth;
  elements.impact.classList.add('is-active');
}

function showDamage(side, amount, critical) {
  const point = pointFor(side);
  const number = document.createElement('span');
  number.className = `damage-number${critical ? ' critical' : ''}`;
  number.textContent = critical ? `КРИТ −${amount}` : `−${amount}`;
  number.style.left = `${point.x}px`;
  number.style.top = `${point.y}px`;
  elements.stage.append(number);
  number.addEventListener('animationend', () => number.remove(), { once: true });
}

async function playEvents(events) {
  for (const event of events) {
    const actorSide = event.actorId ? sideById(event.actorId) : null;
    const targetSide = event.targetId ? sideById(event.targetId) : null;
    const actor = event.actorId ? currentFighters.find((fighter) => fighter.id === event.actorId) : null;
    const target = event.targetId ? currentFighters.find((fighter) => fighter.id === event.targetId) : null;

    if (event.type === 'battle:start') {
      elements.status.textContent = 'Бой начался';
      addLog(`${currentFighters[0].username} и ${currentFighters[1].username} вступают в бой.`);
      await sleep(700);
    }
    if (event.type === 'turn:start') {
      elements.status.textContent = `Ход ${event.turn}`;
      clearTransientClasses();
      await sleep(balance.battle.turnDelayMs);
    }
    if (event.type === 'attack') {
      const actorUi = elements.slots[actorSide];
      if (event.role === 'melee') {
        actorUi.root.classList.add('is-approaching');
        await sleep(balance.battle.meleeApproachMs);
        actorUi.root.classList.add('is-attacking');
        addLog(`${actor.username} атакует ${target.username} в ближнем бою.`);
        await sleep(balance.battle.attackMs);
      } else {
        actorUi.root.classList.add('is-ranged');
        addLog(`${actor.username} выпускает стрелу в ${target.username}.`);
        await sleep(240);
        await animateProjectile(actorSide, targetSide);
      }
    }
    if (event.type === 'dodge') {
      elements.slots[targetSide].root.classList.add('is-dodging');
      addLog(`${target.username} уклоняется от атаки.`);
      await sleep(balance.battle.damagePauseMs);
    }
    if (event.type === 'damage') {
      const fighter = currentFighters.find((item) => item.id === event.targetId);
      fighter.hp = event.targetHp;
      setHp(targetSide, event.targetHp, event.targetMaxHp);
      elements.slots[targetSide].root.classList.add('is-hit');
      showDamage(targetSide, event.damage, event.critical);
      addLog(`${target.username} получает ${event.damage} урона${event.critical ? ' — критический удар!' : '.'}`);
      await sleep(balance.battle.damagePauseMs);
    }
    if (event.type === 'death') {
      const side = sideById(event.fighterId);
      const fallen = currentFighters.find((fighter) => fighter.id === event.fighterId);
      elements.slots[side].root.classList.add('is-dead');
      addLog(`${fallen.username} повержен.`);
      await sleep(800);
    }
    if (event.type === 'battle:end') {
      const winner = currentFighters.find((fighter) => fighter.id === event.winnerId);
      elements.status.textContent = `Бой окончен · ${event.turns} ходов`;
      elements.winnerName.textContent = winner.username;
      elements.winnerReward.textContent = `+${balance.progression.winnerXp} опыта`;
      elements.result.classList.add('is-visible');
      addLog(`${winner.username} побеждает и получает ${balance.progression.winnerXp} опыта.`);
      await sleep(balance.battle.endPauseMs);
    }
  }
  battleRunning = false;
  elements.start.disabled = false;
}

async function startLocalBattle() {
  if (battleRunning) return;
  resetArena();
  battleRunning = true;
  elements.start.disabled = true;
  const random = new SeededRandom(Date.now());
  const result = createBattle({ fighter1: currentFighters[0], fighter2: currentFighters[1], maxTurns: balance.battle.maxTurns, random: () => random.next() });
  await playEvents(result.events);
}

async function handleExternalBattle(payload) {
  if (battleRunning || !payload?.fighters?.length) return;
  battleRunning = true;
  currentFighters = payload.fighters.map((fighter) => buildFighter(fighter, classes));
  renderFighter('left', currentFighters[0]);
  renderFighter('right', currentFighters[1]);
  const result = createBattle({ fighter1: currentFighters[0], fighter2: currentFighters[1], maxTurns: balance.battle.maxTurns });
  await playEvents(result.events);
}

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    socket = new WebSocket(`${protocol}//${location.hostname || 'localhost'}:8081`);
    socket.addEventListener('open', () => { elements.connection.innerHTML = '<i></i> WebSocket подключён'; elements.connection.classList.add('is-online'); });
    socket.addEventListener('message', (message) => {
      try {
        const payload = JSON.parse(message.data);
        if (payload.type === 'battle:start') handleExternalBattle(payload);
        if (payload.type === 'arena:reset') resetArena();
      } catch (error) { console.error('Некорректное событие WebSocket', error); }
    });
    socket.addEventListener('close', () => { elements.connection.innerHTML = '<i></i> Автономно'; elements.connection.classList.remove('is-online'); });
  } catch (error) { console.info('Работаем без WebSocket', error); }
}

elements.start.addEventListener('click', startLocalBattle);
elements.reset.addEventListener('click', resetArena);
['leftNameInput','leftClassInput','leftLevelInput','rightNameInput','rightClassInput','rightLevelInput'].forEach((id) => $(`#${id}`).addEventListener('change', () => { if (!battleRunning) resetArena(); }));
loadConfig().catch((error) => { console.error(error); elements.status.textContent = 'Ошибка загрузки'; addLog('Не удалось загрузить конфигурацию. Запускайте проект через npm start.'); });
