# Janus — спецификация на изискванията

> Документът е подредена версия на първоначалните работни бележки. Всяко изискване следва един шаблон; полетата, маркирани с **TBD**, предстои да се уточнят.

## Метаинформация

| Поле | Стойност |
|------|----------|
| Продукт | Janus — счетоводно приложение за търговия с активи |
| Технологии | Angular + Cordova (хибридно приложение) |
| Версия на документа | 0.7 |
| Статус | Чернова — активно попълване |
| Език на документа | български |
| Последна промяна | _TBD_ |

### Легенда

| Статус | Значение |
|--------|----------|
| `чернова` | Идея е записана; детайлите не са уточнени |
| `уточнява се` | Работи се по дефиниция или критерии |
| `одобрено` | Готово за имплементация |
| `реализирано` | Имплементирано и проверено |

| Приоритет | Значение |
|-----------|----------|
| `задължително` | Блокира MVP / безплатната версия |
| `желателно` | Важно, но може да следва след MVP |
| `бъдещо` | Архитектурна подготовка; не е в първата версия |

| Обхват | Значение |
|--------|----------|
| `безплатна` | Само безплатната версия |
| `платена` | Разширения в платена версия |
| `всички` | Важи за всички версии |

---

## 1. Преглед на продукта

### 1.1 Цел

Janus е счетоводно приложение за търговия с активи (ценни книжа). Потребителят въвежда или импортира транзакции, приложението изчислява състояние на портфейла и данъчни отчети според избран данъчен режим.

### 1.2 Целеви платформи и deployment

Един production артефакт за всички клиенти — **Cordova browser platform**, хостван на **GitHub Pages** (HTTPS). Потребителят зарежда приложението от URL; по желание го инсталира като **PWA** (Add to Home Screen на mobile, Install на desktop). Отделни native builds (Electron, App Store) не са в обхвата на MVP.

| Начин на ползване | Статус | Бележки |
|-------------------|--------|---------|
| Браузър (таб) | `задължително` | Зареждане от GitHub Pages URL |
| PWA — mobile (iOS/Android) | `задължително` | Същият deploy; install от браузъра |
| PWA — desktop | `задължително` | Същият deploy; install от браузъра |
| Cordova runtime | `задължително` | `cordova.js`, plugins, `deviceready` — на всички клиенти, включително PWA |

**Build и deploy**

Production deploy е **автоматичен** чрез **GitHub Actions** — без ръчно качване на файлове.

| Стъпка | Детайл |
|--------|--------|
| CI/CD | GitHub Actions workflow в repo `janus` (`.github/workflows/pages.yml`) |
| Trigger | Push към `main`; опционално `workflow_dispatch` (ръчно пускане) |
| Build (CI) | `npm ci` → `cordova platform add browser` → `cordova build browser` → артефакт `platforms/browser/www/` |
| Deploy (CI) | `actions/upload-pages-artifact` + `actions/deploy-pages` към GitHub Pages |
| GitHub Pages | Source: **GitHub Actions** (не branch/folder); environment `github-pages` |
| Base path | `<base href>` и SW scope съответстват на GitHub Pages path (напр. `/janus/`) |

**Бележки**

- PWA не е отделен build — същият Cordova browser артефакт, различен launch context (таб vs standalone).
- Offline app shell изисква Service Worker в production (виж REQ-001) — assets се теглят от GitHub Pages, не са локално пакетирани.
- Локален dev build (`npm run cordova:run`) не замества CI — production deploy минава само през GitHub Actions.
- `platforms/` не е в git; CI винаги добавя browser platform и пуска `cordova build browser` от нулата.

### 1.3 Версии на продукта

| Версия | Кратко описание |
|--------|-----------------|
| Безплатна | 1 данъчен режим, 1 портфейл, CSV вход/изход, Markdown данъчен отчет |
| Платена | _TBD — множество режими, портфейли, формати_ |

Подробностите по версиите са в [раздел 8](#8-матрица-безплатна-vs-платена-версия).

---

## 2. Терминология

| Термин | Определение | Статус |
|------|-------------|--------|
| Портфейл | Колекция от входни данни (транзакции) за един набор активи | `чернова` |
| Данъчен режим | BPMN process definition + job workers за данъчно отчитане и отчети; един regime ≈ един deploy-нат `.bpmn` | `чернова` |
| Workflow service | `TaxWorkflowService` — единствена runtime точка; стартира `@bpmnkit/engine` за избран regime | `чернова` |
| BPMN definition | BPMN 2.0 XML файл, bundle-нат в приложението; моделира се във **външен** редактор (не в Janus UI) | `чернова` |
| Job worker | TypeScript handler, регистриран в engine по `jobType`; изпълнява service task (зареждане данни, изчисление, …) | `чернова` |
| Workflow manifest | `manifest.json` — map `regimeId` → BPMN asset(и), `processId`, version, display metadata | `чернова` |
| Входни данни | Транзакции — движения по портфейл (buy, sell, dividend, split, funding, withdrawal) | `уточнява се` |
| Транзакция | Един запис в domain model `Transaction` (§2.1); пази се в IndexedDB `transactions` | `уточнява се` |
| Ticker | Символ на ценна книжа (`Transaction.ticker`) | `уточнява се` |
| Котировка | Обменен курс на валута, нужен за превалутиране | `чернова` |
| Import merge | Сливане на транзакции от нов import с вече записани в IndexedDB за същия портфейл | `чернова` |
| Merge конфликт | Транзакция с един и същ `id` (или conflict group — §2.1) съществува локално и в import файла с различни полета | `уточнява се` |

_Допълнителни workflow термини: §2.2_

### 2.1 Domain model — Transaction

Каноничен TypeScript модел за транзакция. Всички import parsers (REQ-021, REQ-022) нормализират към тази структура; IndexedDB `transactions` store пази същите полета (+ `portfolioId`).

```typescript
export type TransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'split'
  | 'funding'
  | 'withdrawal';

export interface Transaction {
  id: number;
  date: string; // ISO 8601 YYYY-MM-DD
  time: string; // HH:MM:SS.mmm (always present; defaults to 00:00:00.000 if not specified)
  ticker: string;
  type: TransactionType;
  quantity: number;
  price: number;
  currency: string; // ISO 4217 code (e.g., 'USD', 'EUR', 'GBP')
  fee?: number; // Optional fee (applicable for all transaction types)
  notes: string;
  seqNo?: number; // Tie-breaker for reordering within a same date+time+ticker conflict group
}

export type NewTransaction = Omit<Transaction, 'id'>;
```

| Поле | Тип | Задължително | Бележки |
|------|-----|--------------|---------|
| `id` | `number` | да (след persist) | Stable identifier; primary match key при merge/re-import (REQ-023). **Auto-increment per portfolio** при import без колона/стойност `id` (REQ-021) |
| `date` | `string` | да | `YYYY-MM-DD` |
| `time` | `string` | да | `HH:MM:SS.mmm`; default `00:00:00.000` ако липсва във входа |
| `ticker` | `string` | да | Символ на ценна книжа |
| `type` | `TransactionType` | да | Виж enum по-горе |
| `quantity` | `number` | да | |
| `price` | `number` | да | |
| `currency` | `string` | да | ISO 4217 |
| `fee` | `number` | не | Приложимо за всички типове |
| `notes` | `string` | да | Може да е празен string |
| `seqNo` | `number` | не | Tie-breaker при множество транзакции с еднакви `date` + `time` + `ticker` |

**Conflict group** (secondary match, когато `id` липсва в import реда): `(date, time, ticker, seqNo?)`. `seqNo` различава записи в една група при merge UI.

**Типове транзакции**

| `TransactionType` | Описание |
|-------------------|----------|
| `buy` | Покупка на ценна книга |
| `sell` | Продажба на ценна книга |
| `dividend` | Дивидент |
| `split` | Split / corporate action |
| `funding` | Внасяне на средства |
| `withdrawal` | Теглене на средства |

### 2.2 Workflow — BPMN assets и runtime

Данъчните режими се моделират като **BPMN 2.0** процеси извън приложението (напр. Camunda Desktop Modeler). Janus **не** включва BPMN редактор — само **runtime** чрез [`@bpmnkit/engine`](https://www.npmjs.com/package/@bpmnkit/engine) (MIT).

**Asset layout (build-time)**

```
src/assets/workflows/
  manifest.json          # regime registry metadata
  bg-tax-v1.bpmn         # process definition per regime
  bg-tax-v1.dmn          # optional DMN decision tables
```

**Manifest entry (пример)**

```json
{
  "id": "bg-tax-v1",
  "displayName": "България — данъчно отчитане",
  "processId": "bg-tax-process",
  "bpmn": "bg-tax-v1.bpmn",
  "dmn": ["bg-tax-v1.dmn"],
  "version": "1.0.0"
}
```

Service tasks в BPMN използват `zeebe:taskDefinition type="<jobType>"` (или еквивалент, съвместим с engine job worker API). Job types са стабилен договор между BPMN и TypeScript workers (виж REQ-011).

---

## 3. Шаблон на изискване

Всяко изискване по-долу следва тази структура. При добавяне на ново изискване копирайте блока и присвоете следващ свободен ID.

```markdown
### REQ-XXX: Заглавие

| Поле | Стойност |
|------|----------|
| ID | REQ-XXX |
| Статус | чернова |
| Приоритет | задължително |
| Обхват | всички |

**Описание**

...

**Критерии за приемане**

- [ ] ...

**Технически бележки**

...

**Зависимости**

- REQ-YYY

**Отворени въпроси**

- ...
```

---

## 4. Нефункционални изисквания

### REQ-001: Offline-first работа и поверителност

| Поле | Стойност |
|------|----------|
| ID | REQ-001 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Приложението се зарежда веднъж и след това работи offline. Production deploy е **Cordova browser platform** на **GitHub Pages** (§1.2); клиентите са браузър таб или инсталиран PWA — един и същ артефакт. Поверителността на счетоводните данни е критична; локалните данни не трябва да се изпращат без изрично съгласие на потребителя.

**Критерии за приемане**

- [ ] Основните функции (преглед, изчисления, запис, отчети) работят без мрежова връзка след първоначално зареждане
- [ ] Няма фонови мрежови заявки без потребителско действие
- [ ] В production (GitHub Pages) Service Worker кешира app shell; UI работи offline след първо зареждане — в браузър таб и в инсталиран PWA
- [ ] Service Worker се регистрира в production build (`environment.production`); в local dev може да е изключен
- [ ] Актуализация на приложението: ръчна проверка („Провери за актуализация“) + настройка за периодично напомняне; мрежова проверка само след потвърждение на потребителя (REQ-002, REQ-003); прилагане чрез `location.reload()` или SW `skipWaiting` + reload
- [ ] Локалните счетоводни данни се пазят в IndexedDB; не се изпращат без изрично съгласие

**Технически бележки**

Двуслойна стратегия — app shell и данни са разделени. Deployment: §1.2 (един Cordova browser build → GitHub Pages).

**Слой A — app shell (offline UI и актуализация)**

Приложението е **hosted** (assets от GitHub Pages), не локално пакетирано. Cordova runtime (`cordova.js`) **не** е причина да се пропусне Service Worker — напротив, SW е задължителен в production за offline shell.

- Service Worker + Cache API — кеширане на статични assets (JS, CSS, HTML, `cordova.js`); scope и `<base href>` съответстват на GitHub Pages path
- Регистрация: `shouldRegisterServiceWorker()` → `environment.production && 'serviceWorker' in navigator && isSecureContext`; не се деактивира заради наличие на Cordova
- PWA install (mobile/desktop) ползва същия SW и origin — няма отделна offline/update стратегия за standalone режим
- `AppUpdateService` — регистрация на SW, ръчна проверка за нова версия, периодично напомняне (интервал в настройки — виж REQ-003); при налична актуализация — диалог; прилагане чрез `location.reload()` или `skipWaiting` + reload след потвърждение
- GitHub Pages: статичен deploy, без server-side routing; нужен е коректен base path и (при нужда) `404.html` fallback за deep links в PWA
- PWA manifest — icons, `start_url`, `scope` съгласувани с base path (Cordova browser manifest може да изисква допълнение)

**Слой B — данни (IndexedDB)**

- IndexedDB база `janus` — основен източник на истина за счетоводни данни (виж REQ-020); `LocalDataStore` като абстракция
- Портфейл = логически workspace в обща IDB база (аналог на worksheet в Excel workbook); изолация чрез `portfolioId`

**IndexedDB schema (`janus`)**

| Object store | Обхват | Съдържание |
|--------------|--------|------------|
| `portfolios` | глобално | id, име, метаданни, данъчен режим, created/updated |
| `transactions` | per portfolio | `Transaction` (§2.1) + `portfolioId`; индекс `portfolioId`; уникален `id` per portfolio |
| `quotes` | per portfolio | валутни курсове за конкретния портфейл |
| `shared_library` | глобално | споделими ресурси (котировки и др.) — копиране по избор (REQ-050) |
| `import_provenance` | per portfolio | път/име на последен import, checksum, timestamp |
| `app_settings` | глобално | мрежови политики (REQ-003), език, интервал за update напомняне |

**Какво не се пази в IndexedDB**

| Данни | Къде / защо |
|-------|-------------|
| Raw import файл (CSV) | Потребителят държи файла; import е еднократна конверсия към нормализиран модел |
| App shell assets | Service Worker Cache API |
| Изчислени отчети (P&L, данъчен MD) | Производни — генерират се on-demand; опционален in-memory cache, не персистентен |
| Мрежови API отговори | Не се кешират извън нормализираните котировки в `quotes` / `shared_library` |
| UI transient state | Component signals / memory |

**Зависимости**

- REQ-002, REQ-003, REQ-020

**Отворени въпроси**

- _Решено:_ Актуализацията е user-initiated (ръчна проверка) или reminder-initiated (локален диалог → потвърждение → мрежова проверка); не се случва silent background update.

---

### REQ-002: Изрично съгласие преди мрежов достъп

| Поле | Стойност |
|------|----------|
| ID | REQ-002 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Преди всяка мрежова заявка приложението пита потребителя за достъп до интернет. Диалогът трябва ясно да описва **направлението на данните**:

- **изтегляне** — зареждане на данни от интернет (напр. валутни котировки);
- **изпращане** — изпращане на данни към сървър.

**Критерии за приемане**

- [ ] Всяка мрежова операция минава през механизъм за потвърждение (освен ако настройките позволяват автоматично разрешение — виж REQ-003)
- [ ] Диалогът различава изтегляне и изпращане на човекочетим език
- [ ] _TBD — текстове на EN/BG_

**Технически бележки**

_TBD — централен NetworkGate / Interceptor service_

**Зависимости**

- REQ-003

**Отворени въпроси**

- _Решено:_ Проверката за актуализация на приложението **не е изключение** от consent flow (REQ-002), но не се случва автоматично — само след изрично действие или потвърждение на периодично напомняне (REQ-001, REQ-003).

---

### REQ-003: Настройки за мрежов достъп

| Поле | Стойност |
|------|----------|
| ID | REQ-003 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

В настройките потребителят конфигурира политика за интернет достъп:

1. **Винаги питай** — преди всяка заявка се показва диалог (по подразбиране?)
2. **Разрешено до края на денонощието** — след еднократно „Да“ не се пита до полунощ (локално време?)
3. **Винаги разрешено** — без диалог за мрежови операции

Допълнителна настройка за актуализация на приложението (REQ-001):

4. **Напомняне за проверка на актуализация** — интервал: изключено / 1 месец (по подразбиране?) / персонализиран; при изтекъл интервал — локален диалог без мрежа; мрежова проверка само след потвърждение

**Критерии за приемане**

- [ ] Трите режима са достъпни в UI на настройки
- [ ] Избраната политика се запазва между сесии
- [ ] Настройка за интервал на напомняне за app update (изключено / 1 месец / персонализиран) се запазва в `app_settings` (REQ-001)
- [ ] _TBD — поведение при смяна на режим по време на активна сесия_

**Технически бележки**

- Мрежовите политики и интервалът за update напомняне се пазят в IndexedDB `app_settings` (REQ-001)

**Зависимости**

- REQ-002

**Отворени въпроси**

- Кой режим е стойност по подразбиране?
- „Край на денонощието“ — локална timezone на устройството?

---

### REQ-004: Динамична смяна на език (i18n)

| Поле | Стойност |
|------|----------|
| ID | REQ-004 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Приложението поддържа динамична смяна на езика без рестарт.

| Език | Роля |
|------|------|
| English | По подразбиране |
| Български | Допълнителен |

**Критерии за приемане**

- [ ] UI текстовете се превключват без презареждане на приложението
- [ ] Изборът на език се запазва между сесии
- [ ] _TBD — форматиране на дати, числа, валути_

**Технически бележки**

_TBD — Angular i18n, ngx-translate или друго_

**Зависимости**

- _няма_

**Отворени въпроси**

- Дали данъчните отчети следват езика на UI или имат отделна настройка?

---

### REQ-005: Модулен UI — независими компоненти

| Поле | Стойност |
|------|----------|
| ID | REQ-005 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

UI се гради от независими компоненти с отделни HTML шаблони и CSS стилове. Компонентите не споделят имплицитно състояние или стилове извън дефинираните shared abstractions.

**Критерии за приемане**

- [ ] Всяка UI единица има собствен `.html` и `.css`
- [ ] _TBD — правила за споделяне на UI библиотека с `dynamic-components`_

**Технически бележки**

_TBD — връзка с web components monorepo_

**Зависимости**

- REQ-006, REQ-007, REQ-008

**Отворени въпроси**

- Кои компоненти идват от `dynamic-components`, кои са локални за Janus?

---

### REQ-006: Тънки компоненти, бизнес логика в services

| Поле | Стойност |
|------|----------|
| ID | REQ-006 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Контролерите (компонентите) са възможно най-кратки. Бизнес имплементацията живее в injectable services.

**Критерии за приемане**

- [ ] Компонентите оркестрират UI събития и delegират към services
- [ ] _TBD — максимален размер/сложност на component class (lint rule?)_

**Технически бележки**

Angular standalone components + `providedIn` / component-level providers.

**Зависимости**

- REQ-007, REQ-008

**Отворени въпроси**

- _няма_

---

### REQ-007: CSS по методология BEM

| Поле | Стойност |
|------|----------|
| ID | REQ-007 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

CSS класовете следват BEM (Block__Element--Modifier).

**Критерии за приемане**

- [ ] Компонентните стилове използват BEM именуване
- [ ] _TBD — глобални стилове, design tokens, dark mode_

**Технически бележки**

Пример: `.portfolio-card__title--highlighted`

**Зависимости**

- REQ-005

**Отворени въпроси**

- _TBD — stylelint правило за BEM_

---

### REQ-008: Standalone components и организация на файлове (SRP)

| Поле | Стойност |
|------|----------|
| ID | REQ-008 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Компонентите са **standalone** с ясна файлова структура. Принцип: single responsibility. Service, ползван **само** от един компонент, живее в директорията на компонента.

**Примерна структура**

```
src/app/components/my-component/
  my-component.ts
  my-component.html
  my-component.css
  services/my-component.service1.ts      ← само за този компонент
  services/my-component.service2.ts      ← само за този компонент
```

**Критерии за приемане**

- [ ] Нови компоненти са `standalone: true`
- [ ] Colocated services са на същото ниво като компонента
- [ ] _TBD — naming convention (`my-component.ts` vs `my-component.component.ts`)_

**Технически бележки**

Проектът вече използва `app.ts` без `.component.` infix — виж [AGENTS.md](AGENTS.md).

**Зависимости**

- REQ-009

**Отворени въпроси**

- _няма_

---

### REQ-009: Shared services на най-близкото общо ниво

| Поле | Стойност |
|------|----------|
| ID | REQ-009 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Services, споделяни между няколко компонента в една feature/parent директория, се поставят в `shared/services/` **на нивото на най-близката обща родителска директория**.

**Примерна структура**

```
src/app/components/
  my-component/
    my-component.ts
    my-component.service.ts
  sibling-component/
    sibling-component.ts
  shared/
    services/
      my-shared.service.ts
```

**Критерии за приемане**

- [ ] Споделен service не живее в директория на един компонент
- [ ] _TBD — правило кога service става app-level (`src/app/services/`)_

**Технически бележки**

_TBD_

**Зависимости**

- REQ-008

**Отворени въпроси**

- Иерархия: feature → app → root?

---

## 5. Функционални изисквания — данъчни режими

### REQ-010: Workflow Service и BPMN engine (`@bpmnkit/engine`)

| Поле | Стойност |
|------|----------|
| ID | REQ-010 |
| Статус | `чернова` |
| Приоритет | `задължително` (архитектура) |
| Обхват | `всички` |

**Описание**

Приложението поддържа различни данъчни режими. Оркестрацията е централизирана в **`TaxWorkflowService`** — единствена runtime точка за tax/P&L изчисления от UI.

Workflow service embed-ва **`@bpmnkit/engine`** (MIT) като BPMN 2.0 execution engine в браузъра (offline-first, без backend сървър). BPMN процесите се **моделират извън приложението** (външен редактор — виж §2.2); Janus **не** включва BPMN modeler.

Отговорности на `TaxWorkflowService`:

- resolve на regime от `TaxRegimeRegistry` (REQ-012);
- deploy на BPMN (+ optional DMN) assets за избрания regime;
- стартиране на process instance с входни variables (`portfolioId`, `period`, …);
- делегиране на service tasks към регистрирани **job workers** (REQ-011);
- map на engine/worker грешки към структуриран `WorkflowResult` (без необработени throw в UI);
- опционален in-memory cache на резултат (не в IndexedDB — REQ-001).

**Критерии за приемане**

- [ ] `TaxWorkflowService.run(request)` е единственият публичен API за стартиране на tax/P&L workflow от feature UI
- [ ] Request изисква `portfolioId`, `kind` (`portfolio-state` \| `tax-calculation`), `period: { from, to }`; regime по подразбиране от portfolio metadata, с optional `regimeId` override
- [ ] Runtime използва `@bpmnkit/engine`; BPMN definitions се зареждат от bundled assets (`src/assets/workflows/`, §2.2), не от мрежа
- [ ] Приложението **не** съдържа BPMN редактор; design-time е външен tool (напр. Camunda Desktop Modeler)
- [ ] Липса на portfolio, regime, BPMN asset, transactions или задължителна котировка → `WorkflowResult` с `ok: false`, без crash
- [ ] Грешките имат `code`, `message`, опционално `field` и `context` (виж типове по-долу)
- [ ] Warnings не спират изпълнението; UI ги показва отделно от errors
- [ ] Мрежов fetch на котировки се извиква само от job worker, през network gate (REQ-002), не директно от engine
- [ ] Free build: опит за неразрешен `regimeId` → `REGIME_NOT_LICENSED` (REQ-013)

**Технически бележки**

- NPM dependency: `@bpmnkit/engine` (опционално `@bpmnkit/reebe-wasm` за WASM runner при performance нужда)
- Thin adapter: `BpmnWorkflowEngine` wrap-ва `Engine` от `@bpmnkit/engine`; `TaxWorkflowService` не импортира engine API директно в UI компоненти
- Boot: при app init (или lazy при първи `run`) — `engine.deploy({ bpmn, decisions? })` за всички regimes от manifest; `registerJobWorker(type, handler)` за общите workers
- Process start: `engine.start(processId, variables)` → subscribe `onChange` / await completion → map variables snapshot към `TaxCalculationResult` / `PortfolioStateResult`

```typescript
export type WorkflowKind = 'portfolio-state' | 'tax-calculation';

export interface WorkflowRequest {
  portfolioId: string;
  kind: WorkflowKind;
  period: { from: string; to: string };
  regimeId?: string;
  options?: { fetchMissingQuotes?: boolean; locale?: string };
}

export type WorkflowErrorCode =
  | 'PORTFOLIO_NOT_FOUND'
  | 'REGIME_NOT_FOUND'
  | 'REGIME_NOT_LICENSED'
  | 'BPMN_DEPLOY_FAILED'
  | 'PROCESS_START_FAILED'
  | 'NO_TRANSACTIONS'
  | 'MISSING_QUOTE'
  | 'INVALID_TRANSACTION'
  | 'WORKER_FAILED'
  | 'PROCESS_FAILED';

export interface WorkflowError {
  code: WorkflowErrorCode;
  message: string;
  field?: string;
  context?: Record<string, unknown>;
}

export interface WorkflowResult<T = unknown> {
  ok: boolean;
  data?: T;
  errors: WorkflowError[];
  warnings: WorkflowError[];
  meta: {
    regimeId: string;
    portfolioId: string;
    processId: string;
    computedAt: string;
  };
}
```

- File layout: `src/app/services/workflow/tax-workflow.service.ts`, `bpmn-workflow-engine.ts`, `workflow-job-worker.registry.ts`
- Shared workers (`src/app/services/workflow/workers/`) — не в component directories (REQ-009)

**Зависимости**

- REQ-001, REQ-011, REQ-012, REQ-013

**Отворени въпроси**

- Кои конкретни данъчни режими са в MVP (България — _TBD_)?
- P&L и tax в един BPMN process или отделни `.bpmn` per `WorkflowKind`?

---

### REQ-011: Данъчни режими — BPMN definitions и job workers

| Поле | Стойност |
|------|----------|
| ID | REQ-011 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Всеки данъчен режим е **BPMN process definition** (`.bpmn`, опционално `.dmn`), bundle-нат в приложението, плюс набор от **job workers** — TypeScript handlers за service tasks.

BPMN моделира **последователност и control flow** (gateways, error boundaries, parallel paths). Бизнес логиката (зареждане на транзакции, валидация, изчисление, report data) живее в workers; workers четат/пишат само през `LocalDataStore` и други app services, не директно IndexedDB от UI.

Добавяне на нов regime **не изисква промени в UI компонентите** — само нов BPMN asset + manifest entry + (при нужда) нови workers.

**Канонични job types (MVP skeleton)**

| `jobType` | Отговорност |
|-----------|-------------|
| `janus.load-portfolio-context` | Portfolio metadata, regimeId, period |
| `janus.load-transactions` | Transactions от IndexedDB за `portfolioId` + period filter |
| `janus.load-quotes` | Quotes от portfolio + `shared_library` fallback |
| `janus.validate-input` | Структурна валидация; липси → worker error / BPMN error boundary |
| `janus.calculate-portfolio-state` | P&L / positions (REQ-040) |
| `janus.calculate-tax` | Данъчно изчисление за regime |
| `janus.build-report-model` | Структуриран резултат за report renderer (REQ-041) |

Реалните tax algorithms могат да са в dedicated services, извиквани от workers; workers са thin adapters към engine job API.

**Критерии за приемане**

- [ ] Всеки regime има уникален `id` в manifest и стабилен `processId` в BPMN
- [ ] Service tasks в BPMN map-ват към регистриран `jobType`; неизвестен type → `WORKER_FAILED`
- [ ] Workers получават process variables + job payload; записват резултат обратно в process variables по договор
- [ ] Нов regime = нов `.bpmn` (+ optional `.dmn`) + manifest entry; без промяна на tax/report UI компоненти
- [ ] DMN (ако се ползва) се deploy-ва заедно с BPMN чрез `engine.deploy({ bpmn, decisions? })`
- [ ] _TBD — пълен списък job types и variable schema за първия BG regime_

**Технически бележки**

- `WorkflowJobWorkerRegistry` — регистрация при bootstrap: `engine.registerJobWorker(type, handler)`
- Worker handler signature съвместим с `@bpmnkit/engine` job worker API (`complete` / `fail` с variables)
- Design-time: Camunda Desktop Modeler (MIT) или друг BPMN 2.0 редактор; export XML → commit в `src/assets/workflows/`
- CI/validation (препоръка): smoke test — deploy BPMN + start process с fixture variables в Vitest

**Зависимости**

- REQ-010, REQ-012, REQ-020, REQ-040, REQ-041, REQ-050

**Отворени въпроси**

- Данъчни правила в DMN decision tables vs само TypeScript в workers?
- Един споделен „skeleton“ BPMN с variables vs отделен `.bpmn` per regime?

---

### REQ-012: Регистър на данъчни режими (workflow manifest)

| Поле | Стойност |
|------|----------|
| ID | REQ-012 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Приложението поддържа **`TaxRegimeRegistry`** — каталог на налични BPMN-based regimes от `src/assets/workflows/manifest.json`. UI и `TaxWorkflowService` resolve-ват regime по `id`, не чрез hard-coded imports на `.bpmn` файлове.

Registry metadata (display name, version, licensed flag) е отделена от BPMN XML; изпълнението идва от engine deploy на съответните assets.

**Критерии за приемане**

- [ ] `manifest.json` описва всички bundled regimes: `id`, `displayName`, `processId`, `bpmn`, optional `dmn[]`, `version`
- [ ] API: `getAll()`, `getById(id)`, `getLicensedIds()` (интеграция с REQ-013)
- [ ] `TaxWorkflowService` зарежда BPMN за regime чрез registry, не чрез директен path в компоненти
- [ ] Display names поддържат i18n key или resolved string (_TBD — стратегия_)
- [ ] При липсващ или невалиден manifest entry → `REGIME_NOT_FOUND` / `BPMN_DEPLOY_FAILED`

**Технически бележки**

- `TaxRegimeRegistry` — Angular `providedIn: 'root'` service; зарежда manifest чрез `HttpClient` от assets (работи offline след първо зареждане)
- License layer (REQ-013) филтрира `getAll()` / блокира `run()` за неразрешени `regimeId`
- Portfolio ↔ regime: 1:1 по подразбиране (`portfolios.taxRegimeId` в IndexedDB — REQ-030); override в `WorkflowRequest.regimeId` за бъдещо сравнение между regimes

**Зависимости**

- REQ-010, REQ-011, REQ-013, REQ-030

**Отворени въпроси**

- Дали безплатната версия показва заключени regimes в UI или ги скрива?

---

### REQ-013: Безплатна версия — един данъчен режим

| Поле | Стойност |
|------|----------|
| ID | REQ-013 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `безплатна` |

**Описание**

Безплатната версия активира **един** данъчен режим. Архитектурата и UI трябва да позволяват бъдещо добавяне на режими без refactor.

**Критерии за приемане**

- [ ] Free build използва точно един регистриран regime
- [ ] Кодовата база не предполага „единствен режим“ извън конфигурация/licensing слой
- [ ] _TBD — кой режим е включен в free_

**Технически бележки**

_TBD — feature flags / license service_

**Зависимости**

- REQ-012

**Отворени въпроси**

- _TBD_

---

## 6. Функционални изисквания — данни и файлове

### REQ-020: Импорт и експорт на входни данни (абстракция)

| Поле | Стойност |
|------|----------|
| ID | REQ-020 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Входните данни се зареждат от файл и при нужда се експортират обратно във файл. **Работният източник на истина е IndexedDB** (REQ-001); файловете са interchange формат за import/export. Нужни са отделни механизми за:

- **зареждане** (import / read);
- **запис** (export / save);
- **валидиране** след parse.

Основен тип входни данни: **транзакции** (`Transaction` — §2.1): buy, sell, dividend, split, funding, withdrawal.

**Критерии за приемане**

- [ ] Единен service layer за file I/O, не разпръсната логика в компоненти
- [ ] Грешки при parse/validation се показват на потребителя
- [ ] Import конвертира файла към каноничен вътрешен модел; при налични локални данни минава през merge flow (REQ-023) преди запис в IndexedDB
- [ ] Промените в UI пишат в IndexedDB; няма автоматичен write-back към файл
- [ ] Export е изрично потребителско действие — сериализира текущото състояние от IndexedDB към файл
- [ ] Import **не** overwrite-ва автоматично съществуващи транзакции без потребителско потвърждение (REQ-023)

**Технически бележки**

- Cordova File API, browser File API — за четене/запис на файлове
- Import поток: файл → parse → validate → normalize → **merge plan** (REQ-023) → потребителско потвърждение → upsert в IndexedDB (`transactions`, `import_provenance`)
- Export поток: IndexedDB → serialize → файл
- `FileIOService` чете/записва само през `LocalDataStore` (REQ-001), не директно в UI компоненти
- **ID generation:** import ред без `id` получава `NewTransaction`; при persist — следващ свободен `id` = `max(existing ids in portfolio) + 1` (per `portfolioId`, auto-increment)

**Зависимости**

- REQ-001, REQ-021, REQ-023, REQ-030

**Отворени въпроси**

- _Решено:_ Hybrid модел — IndexedDB е основен източник на истина; файловете са import/export интерфейс.

---

### REQ-021: Безплатна версия — CSV формат (Janus schema)

| Поле | Стойност |
|------|----------|
| ID | REQ-021 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `безплатна` |

**Описание**

Безплатната версия чете и записва CSV по **формат, дефиниран от приложението** (Janus CSV schema). Колоните map-ват 1:1 към `Transaction` (§2.1).

**Критерии за приемане**

- [ ] Документирана спецификация на CSV колоните (виж таблица по-долу); примери: [`docs/sample-transactions.csv`](docs/sample-transactions.csv) (с `id`), [`docs/sample-transactions-no-id.csv`](docs/sample-transactions-no-id.csv) (без колона `id`)
- [ ] Import на валиден CSV попълва транзакциите в портфейла като `Transaction`
- [ ] Import приема CSV **с или без** колона `id` в header-а; липсваща колона → всички редове са `NewTransaction` (auto-increment при persist)
- [ ] Export генерира CSV с всички полета, вкл. `id`, за re-import без загуба (merge по `id` — REQ-023)
- [ ] `time` липсващ в CSV → default `00:00:00.000` при import
- [ ] `fee`, `seqNo` и **`id`** — optional колони при import; празни стойности в `id`/`fee`/`seqNo` се третират като липсващи
- [ ] Import ред **без** `id` → при persist auto-increment per portfolio (§2.1, REQ-020)
- [ ] Първи ред на CSV е **header** с имената на колоните (както в таблицата по-долу)
- [ ] **MVP (безплатна) CSV file format:** encoding UTF-8; delimiter `,` (запетая); decimal separator `.` (точка); export **без** UTF-8 BOM
- [ ] Export **не** добавя UTF-8 BOM (MVP)

**MVP CSV file format (безплатна версия)**

| Параметър | Стойност | Бележки |
|-----------|----------|---------|
| Encoding | UTF-8 | |
| Delimiter | `,` (запетая) | |
| Decimal separator | `.` (точка) | За `quantity`, `price`, `fee` |
| Header row | да | Първи ред = имена на колони |
| BOM при **export** | **не** | Export файл започва директно с `id,date,...` — без `EF BB BF` |
| BOM при **import** | толерантен | Ако входният файл има UTF-8 BOM — parser го strip-ва преди parse |

**Janus CSV колони**

Колоните `id`, `time`, `fee`, `seqNo` са **optional при import** (може да липсват от header-а). Export винаги включва `id` (и останалите дефинирани колони).

| CSV колона | Поле | Тип | Колона при import | Стойност при import | Бележки |
|------------|------|-----|-------------------|---------------------|---------|
| `id` | `id` | number | **не** (optional) | не (optional) | Колона може да липсва изцяло. Празна стойност в ред → `NewTransaction`. При export колоната **винаги** присъства с присвоен `id` |
| `date` | `date` | string | да | да | `YYYY-MM-DD` |
| `time` | `time` | string | не | не | `HH:MM:SS.mmm`; default `00:00:00.000` |
| `ticker` | `ticker` | string | да | да | |
| `type` | `type` | string | да | да | Една от: `buy`, `sell`, `dividend`, `split`, `funding`, `withdrawal` |
| `quantity` | `quantity` | number | да | да | |
| `price` | `price` | number | да | да | |
| `currency` | `currency` | string | да | да | ISO 4217 |
| `fee` | `fee` | number | не | не | |
| `notes` | `notes` | string | да | да | Може да е празен |
| `seqNo` | `seqNo` | number | не | не | Tie-breaker в conflict group (§2.1) |

**Технически бележки**

- Target файл: `src/app/models/transaction.ts` (или equivalent) — canonical TypeScript от §2.1
- Примерен CSV **с** `id` (re-import / merge): [`docs/sample-transactions.csv`](docs/sample-transactions.csv)
- Примерен CSV **без** колона `id` (първи import): [`docs/sample-transactions-no-id.csv`](docs/sample-transactions-no-id.csv)
- И двата: UTF-8 без BOM; покриват `TransactionType`, optional `time`/`fee`/`seqNo`, quoted `notes`, кирилица
- Import parser валидира `type` enum и ISO формати за `date` / `currency`
- Import parser: delimiter `,`, decimal `.`; numbers не използват thousands separator в MVP
- Import parser: strip UTF-8 BOM от началото на файла, ако присъства (толерантен import)
- Export: UTF-8 **без** BOM — файлът не започва с `EF BB BF`

**Зависимости**

- REQ-020, REQ-023

**Отворени въпроси**

- _Решено:_ delimiter `,`, decimal `.`, UTF-8 encoding (MVP)
- _Решено:_ auto-increment `id` per portfolio при import без `id`
- _Решено:_ MVP export **без** BOM; import strip-ва BOM, ако е подаден
- _TBD — платена версия: опция export с BOM за Excel compatibility?_

---

### REQ-022: Бъдещо — импорт от брокерски формати

| Поле | Стойност |
|------|----------|
| ID | REQ-022 |
| Статус | `чернова` |
| Приоритет | `бъдещо` |
| Обхват | `платена` |

**Описание**

Архитектурата на import layer позволява добавяне на parsers за общоприети формати от брокерски приложения. Всеки parser нормализира към `Transaction` (§2.1).

**Критерии за приемане**

- [ ] Нов формат = нов parser adapter, без промяна в domain model (`Transaction`)
- [ ] _TBD — списък целеви брокери/формати_

**Технически бележки**

- `TransactionImportAdapter`: parse(raw) → `NewTransaction[]` или `Transaction[]`
- Output map-ва broker-specific полета към `TransactionType`, `ticker`, `date`, `time`, `quantity`, `price`, `currency`, `fee`, `notes`

**Зависимости**

- REQ-020, REQ-023

**Отворени въпроси**

- _TBD_

---

### REQ-023: Import merge — UI и потвърждение

| Поле | Стойност |
|------|----------|
| ID | REQ-023 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Портфейлът може вече да съдържа транзакции в IndexedDB (вкл. за дадена **ценна книжа**), докато потребителят прави **нов import** от файл. В такъв случай приложението **не** записва автоматично върху локалните данни — показва **специален merge UI**, в който потребителят преглежда разликите и изрично потвърждава какво да остане, да се обнови или да се добави.

Merge flow е задължителен при всеки import в портфейл с вече съществуващи транзакции, независимо от формата (Janus CSV — REQ-021, бъдещи брокерски — REQ-022).

**Критерии за приемане**

- [ ] След parse/validate/normalize системата сравнява import batch с текущите транзакции в избрания портфейл (`portfolioId`) и изгражда **merge plan**
- [ ] Merge plan класифицира всеки запис: **нов**, **идентичен** (без промяна), **конфликт** (същ primary/secondary key, различни полета), **само локален** (липсва в import файла)
- [ ] UI показва merge preview — обобщение (брой нови / обновени / конфликти / непроменени) и детайлен списък, групиран по `ticker`
- [ ] При **конфликт** потребителят избира за всеки запис: запази локалната версия, приеми import версията, или _TBD — ръчна редакция_
- [ ] Потребителят може да **отмени** merge — IndexedDB остава непроменена
- [ ] Потребителят **потвърждава** merge изрично („Приложи“ / „Merge“); без потвърждение няма запис
- [ ] След потвърждение merge се commit-ва **атомарно** (IndexedDB transaction); при грешка — rollback, без частичен запис
- [ ] След успешен merge се обновява `import_provenance` за портфейла
- [ ] Merge/import UI показва опция **„Replace all“** (изчисти транзакциите на портфейла и import-ни наново) — видима във всички версии
- [ ] **Безплатна версия (REQ-031):** „Replace all“ **не се изпълнява** — при опит за ползване се показва съобщение, че функцията е в **платената пълна версия** (upsell)
- [ ] **Платена версия:** „Replace all“ работи — изтрива `transactions` за `portfolioId`, след което import-ва batch без merge

**Технически бележки**

- Merge логика живее в service (`ImportMergeService` или част от `FileIOService`); UI компонентът е тънък (REQ-006)
- Отделен standalone компонент за merge wizard / dialog (REQ-005, REQ-008)
- **Primary match key:** `Transaction.id` — import ред със същ `id` както локален запис се match-ва директно; идентичност = всички полета от §2.1 съвпадат
- **Secondary match key** (import без `id`): conflict group `(date, time, ticker, seqNo?)` — §2.1; `seqNo` различава множество записи в една група
- Import ред без `id` и без secondary match → **нов**; с secondary match, различни полета → **конфликт**; persist → auto-increment `id` (REQ-021)
- Import поток с merge: `parse → validate → normalize → buildMergePlan → MergeUI → applyMerge → update import_provenance`
- Import поток **replace all** (платена): `parse → validate → normalize → confirmReplaceAll → deleteAllTransactions(portfolioId) → insert batch → update import_provenance`
- „Само локален“ запис не се изтрива при **merge**; при **replace all** (платена) всички локални транзакции на портфейла се заменят
- Upsell copy за free — _TBD текст EN/BG (REQ-004)_

**Зависимости**

- REQ-001, REQ-005, REQ-006, REQ-020, REQ-021, REQ-030, REQ-031

**Отворени въпроси**

- _Решено:_ Primary match key = `id`; secondary = `(date, time, ticker, seqNo?)` (§2.1)
- _Решено:_ „Replace all“ — видимо навсякъде; free = upsell; paid = функционално
- Как се показват conflict groups с много транзакции за един `ticker` (pagination, expand/collapse)?
- Дали merge UI е modal, full-screen wizard или отделен route?
- При конфликт в secondary group без `id`: merge присвоява нов `id` или изисква потребител да map-не към съществуващ?
- _TBD — upsell текст и UX (dialog vs inline banner)_

---

## 7. Функционални изисквания — портфейли

### REQ-030: Модел „множество портфейли“ (архитектура)

| Поле | Стойност |
|------|----------|
| ID | REQ-030 |
| Статус | `чернова` |
| Приоритет | `задължително` (архитектура) |
| Обхват | `всички` |

**Описание**

Всяко портфейло има собствена колекция от входни данни. Приложението поддържа CRUD на портфейли и import/export на ниво портфейл и на ниво транзакции.

**Критерии за приемане**

- [ ] Добавяне, премахване, редактиране на портфейл
- [ ] Import на входни данни от файл **в избран** портфейл (при съществуващи данни — merge flow REQ-023)
- [ ] Export на входни данни от портфейл **във файл**
- [ ] Export на **избрани транзакции** от портфейл в CSV
- [ ] Export на **целия** портфейл във файл
- [ ] _TBD — метаданни на портфейл (име, валута, данъчен режим?)_

**Технически бележки**

- Всеки портфейл = workspace (`portfolioId`) в обща IndexedDB база `janus` (REQ-001); аналог на worksheet в Excel workbook
- CRUD на портфейл не изтрива `shared_library`
- Данните на портфейл (`transactions`, `quotes`, `import_provenance`) се филтрират по `portfolioId`

**Зависимости**

- REQ-001, REQ-020, REQ-023, REQ-031

**Отворени въпроси**

- Връзка портфейл ↔ данъчен режим: 1:1 или N:M?

---

### REQ-031: Безплатна версия — един портфейл

| Поле | Стойност |
|------|----------|
| ID | REQ-031 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `безплатна` |

**Описание**

Безплатната версия работи с **един** портфейл. Архитектурата и UX трябва да позволяват бъдещо множество портфейли.

**Критерии за приемане**

- [ ] Free build ограничава броя активни портфейли до 1
- [ ] Domain model не hard-code-ва single portfolio
- [ ] Import „Replace all“ е **видим**, но **заключен** — upsell към платена версия (REQ-023)

**Технически бележки**

- Feature gate / license layer проверява paid capability преди `replaceAll` import (REQ-023)

**Зависимости**

- REQ-030

**Отворени въпроси**

- **UX:** как потребителят превключва между портфейли в платената версия? (табове, sidebar, dropdown — _дискусия_) 

---

## 8. Функционални изисквания — изход и отчети

### REQ-040: Състояние на портфейла и P&L

| Поле | Стойност |
|------|----------|
| ID | REQ-040 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Приложението изчислява **състояние на портфейла** към избран момент/период въз основа на входните транзакции:

- обща печалба/загуба на портфейла;
- печалба/загуба **по всяка** ценна книга.

**Критерии за приемане**

- [ ] UI показва aggregate P&L и breakdown по инструмент
- [ ] _TBD — метод на оценка (FIFO, average cost, …)_
- [ ] _TBD — период vs as-of date_

**Технически бележки**

- Изчислението се стартира чрез `TaxWorkflowService.run({ kind: 'portfolio-state', ... })` (REQ-010); конкретният алгоритъм (FIFO, average cost, …) е в job worker / BPMN branch

**Зависимости**

- REQ-020, REQ-010

**Отворени въпроси**

- _TBD_

---

### REQ-041: Данъчен отчет

| Поле | Стойност |
|------|----------|
| ID | REQ-041 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

Генерира се **отчет за изчислени данъци**. Съдържание:

- текстови обяснения;
- изчисления и таблици.

Генерацията използва структурирания резултат от `TaxWorkflowService` / BPMN process (job worker `janus.build-report-model`), не hard-coded regime logic в UI.

**Критерии за приемане**

- [ ] Отчетът отразява резултата от BPMN tax workflow за избран период
- [ ] _TBD — preview в UI vs export only_

**Технически бележки**

_TBD_

**Зависимости**

- REQ-010, REQ-042

**Отворени въпроси**

- _TBD_

---

### REQ-042: Безплатна версия — Markdown отчет

| Поле | Стойност |
|------|----------|
| ID | REQ-042 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `безплатна` |

**Описание**

В безплатната версия данъчният отчет се export-ва в **Markdown** (.md).

**Критерии за приемане**

- [ ] Генерираният MD е валиден Markdown с таблици
- [ ] Файлът може да се отвори в стандартен MD viewer
- [ ] _TBD — шаблон на отчета_

**Технически бележки**

_TBD — template engine_

**Зависимости**

- REQ-041

**Отворени въпроси**

- _TBD_

---

### REQ-043: Бъдещо — други формати на отчети

| Поле | Стойност |
|------|----------|
| ID | REQ-043 |
| Статус | `чернова` |
| Приоритет | `бъдещо` |
| Обхват | `платена` |

**Описание**

Архитектурата на report generation позволява export към PDF, Word, Excel и др.

**Критерии за приемане**

- [ ] Нов формат = нов renderer adapter
- [ ] _TBD — приоритет на форматите_

**Технически бележки**

_TBD_

**Зависимости**

- REQ-041

**Отворени въпроси**

- _TBD_

---

## 9. Функционални изисквания — валутни котировки

### REQ-050: Котировки за превалутиране

| Поле | Стойност |
|------|----------|
| ID | REQ-050 |
| Статус | `чернова` |
| Приоритет | `задължително` |
| Обхват | `всички` |

**Описание**

При изчисления се използва **текуща котировка** на валутата, дефинирана от съответния данъчен режим. Котировките могат да идват от два източника:

1. **Интернет** — автоматично зареждане (с REQ-002 consent flow);
2. **Файл** — ръчно поддържан от потребителя (fallback offline).

**Критерии за приемане**

- [ ] Tax regime дефинира кои валути и източници са нужни
- [ ] Зареждане от интернет минава през network gate (REQ-002)
- [ ] Import/export на котировки от/към файл
- [ ] Котировки се пазят per portfolio в IndexedDB `quotes`; опционално и в глобална `shared_library` (REQ-001)
- [ ] UI за копиране на котировки: от библиотеката или от друг портфейл → в целевия портфейл (deep copy; портфейлите остават независими след копиране)
- [ ] _TBD — исторически курсове vs само „днешен“ курс_
- [ ] _TBD — API provider, cache TTL_

**Технически бележки**

- Модел „библиотека + копие“: котировки от import/internet попадат в `quotes` на текущия портфейл или в `shared_library` (ако потребителят маркира „запази в библиотеката“)
- Копиране между портфейли е изрично потребителско действие; промяна в един портфейл не променя други портфейли или библиотеката
- Internet cache TTL е отделен от storage стратегията (REQ-001)

**Зависимости**

- REQ-002, REQ-010

**Отворени въпроси**

- Кой е официалният източник на курсове за MVP?
- Как се държи изчислението при липсваща котировка?

---

## 10. Матрица: безплатна vs платена версия

| Възможност | Безплатна | Платена | Свързано изискване |
|------------|-----------|---------|-------------------|
| Данъчни режими | 1 | Множество | REQ-013, REQ-012 |
| Портфейли | 1 | Множество | REQ-031, REQ-030 |
| Import формат | Janus CSV | + брокерски | REQ-021, REQ-022 |
| Import merge UI | Да | Да | REQ-023 |
| Import „Replace all“ | Видимо, заключено (upsell) | Да | REQ-023, REQ-031 |
| Export транзакции | CSV | _TBD_ | REQ-030 |
| Данъчен отчет | Markdown | + PDF/Word/Excel | REQ-042, REQ-043 |
| Мрежа / offline | Всички | Всички | REQ-001–003 |
| i18n EN/BG | Всички | Всички | REQ-004 |

---

## 11. Backlog за детайли (TBD)

Списък с теми, които **не са** покрити в първоначалните бележки и трябва да се добавят като нови REQ-XXX записи:

| # | Тема | Бележки |
|---|------|---------|
| 1 | Автентикация / акаунти | _TBD — нужни ли са?_ |
| 2 | Backup и restore | _TBD_ |
| 3 | Версиониране на данни / migration | IndexedDB schema versioning и migration при промяна на object stores (REQ-001) |
| 4 | Accessibility (a11y) | _TBD_ |
| 5 | Тестова стратегия | _TBD_ |
| 6 | Лицензиране / activation на платена версия | _TBD_ |
| 7 | Onboarding / първо стартиране | _TBD_ |
| 8 | ~~Примерен CSV файл~~ | [`docs/sample-transactions.csv`](docs/sample-transactions.csv), [`docs/sample-transactions-no-id.csv`](docs/sample-transactions-no-id.csv) |
| 9 | Конкретни данъчни режими (BG, EU, …) | REQ-010 |
| 10 | UI mockups / information architecture | REQ-030 (portfolio switch) |

---

## 12. Индекс на изискванията

| ID | Заглавие | Приоритет | Обхват |
|----|----------|-----------|--------|
| REQ-001 | Offline-first работа и поверителност | задължително | всички |
| REQ-002 | Изрично съгласие преди мрежов достъп | задължително | всички |
| REQ-003 | Настройки за мрежов достъп | задължително | всички |
| REQ-004 | Динамична смяна на език | задължително | всички |
| REQ-005 | Модулен UI — независими компоненти | задължително | всички |
| REQ-006 | Тънки компоненти, логика в services | задължително | всички |
| REQ-007 | CSS по BEM | задължително | всички |
| REQ-008 | Standalone components и SRP файлове | задължително | всички |
| REQ-009 | Shared services на общо ниво | задължително | всички |
| REQ-010 | Workflow Service + `@bpmnkit/engine` | задължително | всички |
| REQ-011 | BPMN regimes и job workers | задължително | всички |
| REQ-012 | Регистър на regimes (workflow manifest) | задължително | всички |
| REQ-013 | Free — един данъчен режим | задължително | безплатна |
| REQ-020 | Import/export абстракция | задължително | всички |
| REQ-021 | Free — Janus CSV | задължително | безплатна |
| REQ-022 | Брокерски import формати | бъдещо | платена |
| REQ-023 | Import merge — UI и потвърждение | задължително | всички |
| REQ-030 | Модел множество портфейли | задължително | всички |
| REQ-031 | Free — един портфейл | задължително | безплатна |
| REQ-040 | P&L и състояние на портфейл | задължително | всички |
| REQ-041 | Данъчен отчет | задължително | всички |
| REQ-042 | Free — Markdown отчет | задължително | безплатна |
| REQ-043 | PDF/Word/Excel отчети | бъдещо | платена |
| REQ-050 | Валутни котировки | задължително | всички |

---

## История на документа

| Версия | Дата | Промяна |
|--------|------|---------|
| 0.1 | 2026-06-14 | Първоначални бележки структурирани по шаблон; добавени индекс, матрица и backlog |
| 0.2 | 2026-06-15 | REQ-023: Import merge UI; актуализирани REQ-020, REQ-021, REQ-022, REQ-030, терминология, матрица |
| 0.3 | 2026-06-15 | §2.1 Domain model `Transaction`; CSV колони (REQ-021); merge match keys (REQ-023) |
| 0.4 | 2026-06-15 | Auto-increment id; MVP CSV format; Replace all freemium upsell (REQ-021, REQ-023, REQ-031) |
| 0.5 | 2026-06-15 | MVP export без UTF-8 BOM (REQ-021) |
| 0.6 | 2026-06-15 | Добавен `docs/sample-transactions.csv` (REQ-021) |
| 0.7 | 2026-06-15 | Колона `id` optional при import; `sample-transactions-no-id.csv` (REQ-021) |
| 0.8 | 2026-06-15 | REQ-010–012: `@bpmnkit/engine`, BPMN assets, job workers; §2.2 workflow model |
