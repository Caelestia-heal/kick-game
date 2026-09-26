# Kick PvP Arena

Браузерная дуэльная арена для Kick и OBS. Визуальное направление вдохновлено классическими high-fantasy MMORPG, при этом все изображения и интерфейс проекта оригинальные и не используют игровые файлы, логотипы или точные копии персонажей сторонних игр.

## Что реализовано

- Автоматический бой Гладиатора и Снайпера.
- Очередь PvP из команд чата.
- Постоянные профили игроков в `data/players.json`.
- Классы, уровни, опыт, победы, поражения и серии побед.
- Урон, критические удары, уклонение, стрела, смерть и экран победителя.
- Тестовая чат-панель без Kick.
- Единый HTTP + WebSocket сервер на порту 8080.
- Чистый OBS-режим через `?overlay=1`.

## Запуск

```bash
npm install
npm start
```

Откройте:

- тестовая панель: `http://localhost:8080/`
- OBS Browser Source: `http://localhost:8080/?overlay=1`
- WebSocket: `ws://localhost:8080/ws`

Рекомендуемый размер OBS: 1920×1080, 60 FPS.

## Команды чата

| Команда | Действие |
|---|---|
| `!gladiator` / `!гладиатор` | Выбрать Гладиатора |
| `!hawkeye` / `!хавк` | Выбрать Снайпера |
| `!pvp` / `!пвп` | Войти в очередь |
| `!leave` / `!выйти` | Покинуть очередь |
| `!stats` / `!статы` | Показать профиль |
| `!queue` / `!очередь` | Показать очередь |
| `!help` / `!помощь` | Показать команды |

## Формат Streamer.bot

Streamer.bot должен отправлять в WebSocket:

```json
{
  "type": "chat:command",
  "userId": "kick-user-id",
  "username": "ViewerName",
  "text": "!pvp"
}
```

Для упрощённой интеграции доступен HTTP endpoint:

```http
POST http://localhost:8080/api/chat-command
Content-Type: application/json
```

```json
{
  "userId": "kick-user-id",
  "username": "ViewerName",
  "text": "!stats"
}
```

Ответы для чата транслируются событием `chat:reply`. На следующем этапе будет добавлен готовый C# Action для Streamer.bot.

## Проверка

```bash
npm test
npm run check
```

## Ручной коммит

После распаковки обновления поверх локального репозитория:

```bash
git status
git add .
git commit -m "feat: add PvP queue profiles and classic MMORPG arena"
git push origin main
```
