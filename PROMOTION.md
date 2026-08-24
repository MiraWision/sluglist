# sluglist — промо-план запуска (v2, обновлён под 1.15 / агентный цикл)

Позиционирование изменилось — и это меняет весь питч. Больше не «feedback-виджет + скилл», а
**автономный QA-цикл**: агент генерирует чеклист из ветки → QA-агент проходит его в реальном
браузере и записывает вердикты **с доказательствами** (no fail without a screenshot, no pass
without performing the check) → fix-агент отвечает в `fixes.yaml` → `npx sluglist status` решает,
стоит ли гонять ещё раунд → цикл заканчивается на зелёном или честно останавливается на стопоре.
Виджет и «click a bug → Claude fixes it» — теперь входная дверь, а не вся история.

**Почему это сильнее для промо:** «open-source feedback widget» — категория с конкурентами;
«агентный QA-цикл с анти-театральным правилом доказательств» — категории нет ни у кого. Правило
«агенту нельзя поставить pass, не выполнив проверку» — это готовый хук: болячка, которую все, кто
работал с агентами, знают лично (агенты «рапортуют» о зелёных тестах, не запуская их).

Готовность: npm 1.15.0 опубликован ✓ · сайт live с loop-first подачей ✓ · /for/agent-loop/,
/for/ индекс, подсветка кода, per-page OG ✓ · GSC пересабмит sitemap — за вами.

## Ассеты до запуска (1–2 вечера, в порядке важности)

- [ ] **Терминальная запись цикла (60–90 сек):** `sluglist status` → QA-агент шагает по чеклисту →
      fail со скриншотом → fix → re-test → зелёный. Это ГЛАВНЫЙ ассет теперь (не GIF виджета).
      asciinema для терминала + короткий скринкаст браузера, склейка.
- [ ] **Публичный пример отчёта:** прогнать цикл на демо-приложении и выложить результат
      `npx sluglist report` (self-contained HTML) как страницу, например
      sluglist.dev/example-report.html. Одна ссылка показывает всё: вердикты, evidence-скриншоты,
      fixes.yaml. Для HN-треда это неубиваемый аргумент.
- [ ] Короткий GIF виджета (клик → артефакты) — вторичный ассет для PH/Reddit.
- [ ] GitHub topics дополнить: `ai-agents`, `agentic-qa`, `autonomous-testing`, `claude-code`.

## Волна 1 — большие площадки (по одной, не в один день)

### 1. Hacker News — Show HN (главная ставка)
- **Титул (вариант A):** `Show HN: Sluglist – an agent QA loop where "pass" requires evidence (MIT)`
- **Титул (вариант B):** `Show HN: Sluglist – QA agent tests your app, fix agent fixes it, loop ends on green`
- Ссылка на https://sluglist.dev. Первый комментарий — технический рассказ:
  - анти-театральное правило и зачем оно (агенты врут про тесты — вот механика, которая не даёт);
  - `sluglist status` как детерминированный судья цикла (агент не сам решает, что «готово»);
  - почему артефакты = файлы (markdown/YAML/PNG), а не дашборд;
  - инженерные решения: hand-rolled PNG/JPEG на node:zlib и YAML-ридер ради нулевых зависимостей
    в браузерной установке (HN такое обожает); формат только аддитивный, совместимость — тестом;
  - что намеренно НЕ построено (инбокс, video replay, phone-home — с тестом-доказательством).
  - ссылка на живой пример отчёта.
- **Когда:** вт–чт, 15:00–17:00 Киев. Отвечать на всё первые 3–4 часа.

### 2. Product Hunt
- Tagline: «The QA loop that ends on green — agents test, fix and re-test your app».
- Галерея: терминальная запись цикла, пример отчёта, виджет, чеклист.
- Maker-comment: история «я устал, что агент говорит „всё работает“, не проверив — теперь pass
  без доказательства невозможен технически».
- Не в один день с HN.

### 3. Reddit (растянуть, углы разные — не один и тот же пост)
- **r/ClaudeAI** — центральная площадка теперь: «I built a full QA loop for Claude Code: a QA
  skill that can't mark pass without evidence, a fix skill, and a CLI that loops until green».
  Показать фрагмент отчёта + .done. Это пост про скиллы и мультиагентность.
- **r/webdev** — угол client acceptance (чеклист + coverage map), без агентного жаргона.
- **r/ExperiencedDevs / r/programming** — только через статью-разбор (см. волну 2), не анонс.
- **r/SideProject, r/opensource** — свободный формат, история + запись цикла.

## Волна 2 — контент и каталоги

### 4. Статьи (dev.to + кросс-пост Hashnode; лучшие — сабмитить в r/programming и newsletters)
- **«How I stopped my coding agent from lying about test results»** — про анти-театральное
  правило и evidence-вердикты. Самый виральный заголовок из имеющихся.
- «An autonomous QA loop with Claude Code: checklist → verdicts → fixes.yaml → green» — туториал
  по `sluglist init` → `status`.
- «Client acceptance testing with a checklist widget» — второй сценарий, аудитория агентств.

### 5. Awesome-списки и каталоги
- awesome-claude-code (+ аналоги) — теперь легитимно и в списки про **агентные воркфлоу/QA**,
  не только tools: искать awesome-ai-agents, awesome-llm-apps (секции testing/QA).
- AlternativeTo: sluglist как alternative to Marker.io / Usersnap / BugHerd (наши /compare/ уже
  заточены под этот трафик).
- daily.dev (сабмит статей), Indie Hackers (пост-история).

### 6. Ньюслеттеры
- JavaScript Weekly / Frontend Focus (cooperpress-форма), Bytes.dev, TLDR Web Dev + **TLDR AI**
  (агентный угол теперь проходит и туда), Node Weekly (угол CLI: init/status/report).
- Шансы сильно выше со ссылкой на статью «lying about test results» или живой Show HN.

## Волна 3 — постоянка
- **Anthropic Discord** #showcase — прямая аудитория; акцент на 4 скиллах и лупе.
- X/LinkedIn: тред с записью цикла; LinkedIn — угол для агентств (acceptance + отчёт клиенту
  одной HTML-страницей — это им продаёт само себя).
- Ответы в живых тредах: «how to make AI agents actually test code», «agent keeps saying tests
  pass» — таких тредов много, Community Monitor во FluxioAI прогонять еженедельно по новым
  ключам (agent qa, agent testing, claude code qa).
- Shorts через пайплайн FluxioAI: 60-сек «агент не смог соврать» — показ fail с evidence.

## Метрики
GitHub stars, npm downloads/week, Umami (refererrs + событие compare-loop-*/compare-start-*),
GSC по /for/agent-loop/ и /compare/, LLM Visibility во FluxioAI — добавить промпты
«ai agent qa testing tool», «how to verify agent test results», «open source feedback widget».
