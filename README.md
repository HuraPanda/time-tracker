# Time Tracker Test Task

Полноценный каркас тестового приложения для трекинга времени:

- `backend`: NestJS + PostgreSQL + Redis + JWT auth + Jest unit tests
- `frontend`: React + Vite + browser activity tracking
- `desktop`: Electron shell с OS-level idle/lock tracking
- `infra`: Docker Compose, `.env`, отдельные Dockerfile

## Что реализовано

### Backend

- JWT авторизация: `POST /auth/register`, `POST /auth/login`
- Таблица `users`
- Таблица `timers` с одной записью на пользователя в рамках календарного дня
- Таблица `timer_logs` для истории смен состояний и ручных корректировок
- Состояния таймера:
  - `stop`
  - `active`
  - `idle`
  - `lock`
  - `shutdown`
- Ручная корректировка времени: `POST /timers/adjust`
- Логи переходов: `GET /timers/logs`
- Redis-кэш для `today` и `logs`
- Периодическая cron-задача, которая переводит “зависшие” таймеры в `lock`, если heartbeat давно не приходил

### Frontend

- Регистрация и логин
- Экран текущей дневной сессии
- Кнопки `start` / `stop`
- Форма ручной корректировки минут
- Список логов состояний
- Activity tracker:
  - слушает `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`
  - каждые 30 секунд отправляет heartbeat
  - использует `visibilitychange`, `pagehide`, `beforeunload`

### Desktop

- Electron `main` process отслеживает `powerMonitor.getSystemIdleTime()`
- Electron ловит `lock-screen`, `unlock-screen`, `shutdown`, `suspend`, `resume`
- React автоматически переключается с browser tracking на desktop tracking, если открыт внутри Electron
- В Electron idle/lock продолжают отслеживаться, даже если окно свернуто или не в фокусе

## Нюанс по отслеживанию активности

### Browser-режим

В обычной браузерной версии приложение видит только события внутри своей вкладки или окна браузера.

Что используется:

- DOM events: `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`
- `visibilitychange`
- `pagehide` и `beforeunload`
- периодический heartbeat на backend

Что это даёт:

- можно надёжно определить `idle`, если пользователь не двигает мышью и не нажимает клавиши внутри вкладки больше 15 минут
- можно best-effort определить, что вкладка скрыта или окно браузера закрывается

Ограничения browser-режима:

- нельзя глобально отслеживать мышь и клавиатуру вне вкладки браузера
- нельзя надёжно отличить `lock` компьютера от простого ухода со вкладки
- нельзя гарантированно определить системный `shutdown`
- background tabs могут throttling-ить таймеры и события

Итог:

- browser-режим хорошо подходит для демонстрации логики `start / active / idle / manual adjust / logs`
- но для полного и надёжного соблюдения desktop-сценария он ограничен возможностями браузера

### Desktop-режим

В desktop-режиме приложение запускается внутри Electron, и отслеживание идёт не из вкладки, а из `main` process на уровне ОС.

Что используется:

- `powerMonitor.getSystemIdleTime()`
- `lock-screen`
- `unlock-screen`
- `shutdown`
- `suspend` / `resume`

Что это даёт:

- `idle` определяется по системному времени бездействия, даже если окно приложения свернуто
- `lock` можно ловить как системное событие, а не как эвристику по скрытой вкладке
- `shutdown` можно получать ближе к реальному системному событию
- логика продолжает работать, даже если пользователь переключился в другое приложение

Итог:

- именно desktop-режим является корректным способом закрыть исходное ТЗ без оговорок про ограничения браузера
- browser-режим остаётся полезным fallback и способом быстро показать UI/API часть решения

## Как я трактую состояния

- `stop`: дефолт после запуска приложения или после ручной остановки
- `active`: пользователь активен, таймер считает время
- `idle`: с момента последнего клавиатурного/мышиного действия прошло больше 15 минут
- `lock`: web-best-effort состояние, когда вкладка скрыта или heartbeat перестал приходить
- `shutdown`: best-effort событие закрытия страницы/браузера через `keepalive` request

При переходе в `lock` и `shutdown` активный таймер останавливается: накопленное время сохраняется, а текущий активный интервал закрывается.

## Важный инженерный trade-off

Если это именно web-приложение в браузере, то **точно** отличить `lock` от `shutdown` на уровне ОС нельзя. Поэтому в этом решении:

- `idle` реализован честно и надёжно через browser events
- `lock` и `shutdown` реализованы как best-effort эвристики

В Electron-режиме это ограничение существенно меньше, потому что idle/lock/shutdown берутся из desktop-слоя, а не только из событий вкладки.

Если бы нужно было довести это до production-уровня именно для desktop use-case, я бы сделал thin desktop shell на `Electron` или `Tauri` поверх текущего React UI и:

- подписался бы на OS power/session events
- различал бы `screen lock`, `sleep`, `resume`, `shutdown`
- оставил бы текущий Nest backend без серьёзных изменений

## API

### Auth

- `POST /auth/register`
- `POST /auth/login`

### Timers

- `GET /timers/today`
- `GET /timers/logs?date=YYYY-MM-DD`
- `POST /timers/start`
- `POST /timers/stop`
- `POST /timers/adjust`
- `POST /timers/heartbeat`
- `POST /timers/system-event`

Пример heartbeat:

```json
{
  "lastInputAt": "2026-05-22T12:00:00.000Z",
  "isVisible": true,
  "userAgent": "Mozilla/5.0"
}
```

Пример ручной корректировки:

```json
{
  "minutes": 15,
  "reason": "Forgot to start timer"
}
```

## Запуск через Docker Compose

```bash
docker compose up --build
```

После старта:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3000`
- healthcheck: `http://localhost:3000/health`

Примечание:

- `postgres` и `redis` проброшены на нестандартные порты хоста:
  - Postgres: `localhost:55432`
  - Redis: `localhost:56379`
- это позволяет запускать `backend` локально или в Electron-режиме, не конфликтуя с локальными сервисами на `5432/6379`
- для CORS в dev-режиме разрешены оба origin frontend: `localhost:5173` и `127.0.0.1:5173`

## Локальный запуск без Docker

1. Поднять PostgreSQL и Redis
2. Проверить `.env`
3. Запустить backend:

```bash
pnpm install
pnpm start:dev
```

4. Запустить frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

## Локальный запуск в Electron

Для desktop-режима удобнее всего поднять только инфраструктуру через Docker:

```bash
docker compose up -d postgres redis
```

1. Проверить `.env`
2. Установить зависимости:

```bash
pnpm install
pnpm --dir frontend install
```

3. Запустить backend + frontend + Electron одной командой:

```bash
pnpm desktop:dev
```

Что делает команда:

- поднимает Nest backend на `3000`
- поднимает Vite frontend на `5173`
- ждёт готовности обоих сервисов
- открывает Electron окно поверх текущего React UI

На Linux dev-режим Electron здесь запускается с `--no-sandbox`, чтобы не упираться в системную настройку `chrome-sandbox` у локальной `node_modules`-версии Electron. Для тестового и локальной разработки это допустимо, но для production так делать не стоит.

Если на Linux появится ошибка `EMFILE: too many open files` или проблемы с file watchers, текущие dev-скрипты уже переведены на polling. Если этого всё равно недостаточно, можно временно увеличить лимиты:

```bash
ulimit -n 65535
```

## Как протестить Electron руками

1. Подними инфраструктуру:

```bash
docker compose up -d postgres redis
```

2. Запусти `pnpm desktop:dev`
3. В открывшемся Electron окне зарегистрируй пользователя и войди
4. Нажми `Start`
5. Не трогай клавиатуру и мышь 15 минут
6. Таймер должен перейти в `idle`
7. Снова подвигай мышью или нажми клавишу
8. Таймер должен автоматически вернуться в `active`
9. Сверни Electron окно и подожди 15 минут
10. После возврата в окно проверь, что состояние определилось корректно через desktop idle tracking
11. Если на ОС поддерживается `lock-screen`, заблокируй компьютер и затем разблокируй его
12. В логах состояний должны появиться переходы `active -> lock` и затем возврат к `active` после новой активности

Важно:

- в обычном браузере движение мыши вне вкладки не отслеживается
- в Electron это отслеживается через `powerMonitor`, потому что трекинг живёт в `main` process

Для ускоренного локального теста можно временно поставить в `.env` значение `IDLE_TIMEOUT_MINUTES=1`, но штатная конфигурация по ТЗ здесь `15`.

## Соответствие ТЗ

- Приложение для трекинга времени реализовано как единый таймер без проектов и категорий.
- Таймер имеет состояния `stop`, `active`, `idle`, `lock`, `shutdown`.
- Начальное состояние дня создаётся как `stop`.
- Пользователь вручную запускает таймер кнопкой `Start`.
- Неактивность определяется по отсутствию клавиатуры и мыши более 15 минут.
- В browser-режиме это делается через DOM events и heartbeat.
- В Electron-режиме это делается надёжнее через `powerMonitor.getSystemIdleTime()` и системные power/session events.
- При `lock` и `shutdown` активный интервал закрывается, а таймер перестаёт идти.
- Показывается длительность текущей дневной сессии.
- Есть ручная корректировка времени в плюс и минус.
- Есть лог переходов состояний и ручных корректировок.

## Тесты

```bash
pnpm test
pnpm test:e2e
pnpm --dir frontend build
pnpm build
```

## Что бы я улучшил дальше

- Добавил бы миграции вместо `synchronize: true`
- Вынес бы state machine в отдельный domain-layer с более жёсткой матрицей допустимых переходов
- Сделал бы refresh token + logout invalidation
- Добавил бы пагинацию и фильтрацию логов
- Перевёл бы frontend на React Query для серверного состояния
- Для production desktop-сценария довёл бы Electron-часть до полноценного distributable-приложения: packaging, auto-update, code signing и platform-specific smoke tests
- Добавил бы platform-specific fallback-логику для `lock`/`shutdown` событий на Linux, где поведение desktop environment может отличаться
- Разделил бы browser-mode и desktop-mode на более явные продуктовые сценарии в UI и документации, чтобы пользователь сразу понимал уровень точности tracking в каждом режиме
# time-tracker
