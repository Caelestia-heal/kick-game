# Kick Duel Game

Браузерная PvP-арена для Kick и OBS. Первая версия включает оригинальную фэнтезийную сцену, тестовых персонажей «Дуэлист» и «Стрелок», локальную панель и полностью автоматический бой.

## Запуск

Требуется Node.js 20 или новее.

```bash
npm install
npm start
```

Откройте:

- тестовая панель: `http://localhost:8080/`
- чистый OBS overlay: `http://localhost:8080/?overlay=1`

Рекомендуемый размер Browser Source в OBS: 1920 × 1080.

## Проверки

```bash
npm test
npm run check
```

## События WebSocket

Relay слушает `ws://localhost:8081`. Для запуска боя отправьте:

```json
{
  "type": "battle:start",
  "fighters": [
    { "id": "kick-user-1", "username": "PlayerOne", "classId": "duelist", "level": 1 },
    { "id": "kick-user-2", "username": "PlayerTwo", "classId": "archer", "level": 1 }
  ]
}
```

В следующем этапе Streamer.bot будет формировать это событие из команд Kick.

## Архитектура

- `src/game-core.js` — расчёт характеристик и исхода боя.
- `overlay/` — визуализация и локальная тестовая панель.
- `relay/server.js` — статический сервер и WebSocket relay.
- `config/` — баланс и классы без захардкоженных значений в UI.
- `tests/` — автоматические тесты боевой логики.

Все изображения первой версии оригинальны и служат тестовыми ассетами проекта.
