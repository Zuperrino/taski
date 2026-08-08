/* ============ Завод скиллов: вкладка админки ============
   Самодостаточный модуль: свои помощники DOM и свой доступ к сети, никаких
   зависимостей от остального кода админки, кроме токена из общих настроек.
   Наружу отдаёт объект SkillFactory с методами init(container) и render().

   Экран: слева каталог скиллов стенда и черновики, справа один и тот же скилл в
   четырёх видах — форма, сырой текст, чат с агентами и отчёт проверки.
   Источник истины — текст: форма его разбирает и собирает обратно.

   Работа агентов идёт долго (минуты), поэтому ход работы виден сразу. В ленте
   три уровня видимости: всегда на виду этап, карточка роли, шаги инструментов,
   сообщения, вопросы и отчёт; под раскрытием — размышления модели; под тумблером
   разработчика — сырой ответ модели. Любую работу можно прервать. */
"use strict";

const SkillFactory = {
  API: "/skill-factory/api/v1",

  DOMAIN_TITLES: {
    employee: "Сотрудники", position: "Должности", recruitment: "Подбор",
    talent_radar: "Talent Radar", agentic: "Агентная разработка",
    education: "Обучение", anagent: "Аналитика", general: "Общее",
  },

  STAGE_ICONS: {
    interview: "❓", reuse: "♻", scout: "🔎", author: "✎", check: "✓", fix: "🔧",
    judge: "🎯", council: "👥", council_summary: "🧾", gate: "🛂",
  },

  state: {
    catalog: [], drafts: [], tab: "catalog", filter: "",
    mode: "form", kind: "recipe",
    path: null, draftId: null, filename: "", text: "", previous: "",
    fields: { recipe: null, reference: null },
    /* report — последний отчёт проверки, reportFresh — относится ли он к тому
       тексту, который сейчас в редакторе. Публикация смотрит на оба.
       gap — рубеж публикации словами от сервера: он же и отказывает в записи на
       стенд, поэтому его слово главнее своего расчёта. null означает, что сервер
       о рубеже ещё не говорил. */
    report: null, reportFresh: false, gap: null,
    models: [], model: "", defaultModel: "", chain: [],
    /* Что известно про модели без единого запроса к шлюзу: квота (сколько
       одновременных запросов он держит) и остаток карантина. Приезжает полем
       model_limits ответа /state — опрашивать ради этого сами модели нельзя:
       самая медленная отвечает секунд по пятнадцать и занимает ту же квоту,
       за которую потом будут спорить участники совета. */
    limits: {},
    /* Оценка готового скилла: какой вид выбран в поповере и кто отмечен в совет. */
    evalMode: "judge", council: [], councilSize: 4,
    /* Разбор судьи и мнения совета последнего прогона. Держим отдельно от отчёта
       проверки: они приходят и внутри него, и рядом с ним полями черновика. */
    judgement: null, councilReport: null,
    /* Отпечаток текста, по которому получен отчёт, и признак «оценка вынесена по
       другой версии текста» по каждой оценке. */
    reportMark: "", stale: { judge: false, council: false },
    stub: true, llmOk: true, clientKind: "",
    dirty: false, busy: false, showRaw: false,
    /* detail — подробность текущего этапа (имя модели или инструмента). Живёт в
       состоянии, а не в аргументе отрисовки: полоса прогресса перерисовывается
       раз в секунду по таймеру, и без этого подробность гасла бы сразу. */
    stage: "", stageStartedAt: 0, detail: "", aiFlow: false,
    formGeneration: 0,
  },
  els: {},
  _built: false,
  _abort: null,
  _timer: null,
  _saveTimer: null,

  /* Карточки ролей по role_key. Три критика идут параллельно, их события
     перемешаны в одном потоке, поэтому «текущей роли» не существует: каждое
     событие адресовано своей карточке и закрывает только её. */
  _roles: new Map(),
  /* События роли, чья карточка ещё не создана: придерживаем до role_start,
     чтобы они не вываливались сырьём в общую ленту. */
  _stash: new Map(),
  /* Последние показанные сообщения: страховка от дубля одного и того же текста. */
  _recent: [],
  _stopped: false,
  /* Отложенные до конца прогона действия: сохранить текст, сохранить сценарий
     черновика, вернуть фокус в поле ввода. Во время работы агентов всё это либо
     затирается сценарием, либо не выполняется вовсе. */
  _saveWanted: false,
  _flowWanted: false,
  _focusWanted: false,
  _bannerTimer: null,
  /* Трогал ли человек текст после запуска проверки. Отчёт приходит по тому
     тексту, который лежал в черновике на старте прогона: если редактор с тех пор
     правили, отчёт относится к другой версии и публикацию открывать нельзя. */
  _textTouched: false,
  /* Открыты ли ворота подтверждения находок разведки и какая карточка их
     показывает. Пока ворота открыты, слова человека это поправка к находкам, а
     не согласие: обычная отправка реплики уходит вторым заходом разведки. */
  _gatePending: false,
  _gateMark: "",
  _gateBox: null,
  /* Общий блок совета в ленте: пока он есть, карточки и реплики участников идут
     в него, а не вразнобой в ленту. Заводится на каждый прогон свой. */
  _councilBox: null,
  /* Сводка критиков, уже сказанная в этом прогоне: отчёт пересобирается после
     каждой оценки и приносит её с собой снова. */
  _saidReview: "",
  /* Держать ли ленту у низа и какое значение прокрутки выставили сами
     (см. watchStick). Начинаем прилипшими: разговор читают с конца. */
  _stick: true,
  _autoTop: 0,

  /* Подсказка у кнопки публикации. Про Ctrl+S тут не сказано намеренно: клавиша
     сохраняет черновик, а запись в каталог стенда идёт только кнопкой. */
  PUBLISH_HINT: "Записать скилл в каталог стенда: его сразу видят все агенты канала",

  RAW_KEY: "heimdall.factory.raw",   // тумблер «показывать сырые ответы»
  THINK_LIMIT: 20000,                // сколько символов размышлений держим в DOM
  RAW_LIMIT: 200000,                 // потолок накопленного сырого ответа
  LIVE_TAIL: 1200,                   // сколько символов ответа видно на лету
  STASH_LIMIT: 400,                  // потолок придержанных событий одной роли
  RECENT_LIMIT: 8,                   // глубина памяти на повтор сообщения
  BANNER_MS: 9000,                   // сколько баннер держится на экране
  /* Кем помечена строка разбора находок. Значение приходит с сервера словом:
     всё, что не «человек», считается проверенным кодом. */
  GATE_BY_HUMAN: "человек",

  /* ---------- помощники ---------- */
  el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  },

  /* Токен берём из общих настроек админки: там его задаёт диалог «Настройки».
     На dev авторизация выключена и токена может не быть — тогда просто не шлём. */
  token() {
    try {
      const raw = localStorage.getItem("heimdall.settings");
      return raw ? String(JSON.parse(raw).token || "") : "";
    } catch (_) { return ""; }
  },

  headers(json) {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    const t = this.token();
    if (t) h["Authorization"] = `Bearer ${t}`;
    return h;
  },

  async api(path, options) {
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign(this.headers(false), opts.headers || {});
    const response = await fetch(this.API + path, opts);
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = { detail: raw }; }
    if (!response.ok) throw this.failure(body, response.status);
    return body;
  },

  /* Отказ в едином виде: сообщение, машинный код и номер ответа. Тело приходит
     объектом {code, detail}; у отказов, поднятых зависимостью (например закрытая
     авторизация), тот же объект лежит внутри detail. */
  failure(body, status) {
    const info = (body && body.detail && typeof body.detail === "object") ? body.detail : body;
    const error = new Error((info && (info.detail || info.code)) || ("HTTP " + status));
    error.code = info && info.code;
    error.status = status;
    return error;
  },

  /* Запуск потока может закончиться обычным отказом: закрытая Завод, чужой или
     удалённый черновик. Тело у него такое же, как у остальных ручек, поэтому
     читаем его и называем причину словами, а не номером ответа. */
  async refusal(response) {
    let body = null;
    try {
      const raw = await response.text();
      body = raw ? JSON.parse(raw) : { detail: raw };
    } catch (_) { body = null; }
    const error = this.failure(body, response.status);
    error.refused = true;
    return error;
  },

  post(path, payload) {
    return this.api(path, { method: "POST", headers: this.headers(true), body: JSON.stringify(payload || {}) });
  },

  put(path, payload) {
    return this.api(path, { method: "PUT", headers: this.headers(true), body: JSON.stringify(payload || {}) });
  },

  suffix() { return this.state.kind === "reference" ? ".md" : ".yaml"; },

  /* ---------- сборка экрана ---------- */
  init(container) {
    const page = container || document.getElementById("page-skills");
    if (!page || this._built) return;
    this._built = true;
    page.innerHTML = "";
    // Корень вкладки держит ширины колонок: список — сосед рабочей области, а не
    // её потомок, и переменная, объявленная внутри, до него бы не дошла.
    this.els.page = page;
    page.append(this.buildSide(), this.buildSideResizer(), this.buildMain());
    this.bindShortcuts();
    this.loadShowRaw();
    this.loadState();
    this.reloadList();
  },

  buildSide() {
    const search = this.el("input", {
      placeholder: "Фильтр по названию…", autocomplete: "off",
      oninput: (e) => { this.state.filter = e.target.value; this.renderList(); },
    });
    const tabs = this.el("div", { class: "sf-seg" },
      this.el("button", { class: "on", text: "Каталог стенда", onclick: () => this.switchList("catalog") }),
      this.el("button", { text: "Черновики", onclick: () => this.switchList("drafts") }),
    );
    const list = this.el("div", { class: "sf-list" });
    const side = this.el("div", { class: "sf-side" },
      this.el("div", { class: "sf-side-head" }, search,
        this.el("button", {
          class: "iconbtn", title: "Перечитать каталог стенда и черновики",
          "aria-label": "Обновить список", text: "⟳", onclick: () => this.reloadList(),
        })),
      this.el("div", { class: "sf-newrow" },
        this.el("button", { class: "primary", text: "✨ Создать (AI)", title: "Описать задачу словами — агенты соберут скилл",
                            onclick: () => this.newAiDraft() })),
      this.el("div", { class: "sf-newrow" },
        this.el("button", { text: "+ Рецепт", onclick: () => this.newDraft("recipe") }),
        this.el("button", { text: "+ Приём", onclick: () => this.newDraft("reference") })),
      tabs, list,
    );
    Object.assign(this.els, { search, listTabs: tabs, list, side });
    return side;
  },

  /* Ползунок ширины списка. Отдельным узлом между списком и рабочей областью:
     список тоже приходится подгонять — в одних каталогах имена короткие, в
     других не помещаются вовсе. */
  buildSideResizer() {
    const node = this.el("div", {
      class: "sf-resizer sf-resizer-side", title: "Потянуть — ширина списка скиллов",
    });
    this.els.sideResizer = node;
    return node;
  },

  buildMain() {
    const filename = this.el("input", {
      class: "sf-filename", placeholder: "имя_скилла.yaml", spellcheck: "false",
      oninput: (e) => { this.state.filename = e.target.value; this.markDirty(); },
    });
    const modelSelect = this.el("select", {
      class: "sf-model",
      title: "Какой моделью работают агенты. Меняйте, если модель отказывает "
             + "по нагрузке или отвечает не тем, что просили",
      "aria-label": "Модель для агентов",
      onchange: (e) => { this.state.model = e.target.value; },
    });
    /* Тумблер разработчика: сырой ответ модели это служебный JSON, обычному
       пользователю он не нужен, а разработчику нужен целиком. */
    const rawCheck = this.el("input", {
      type: "checkbox", onchange: (e) => this.setShowRaw(e.target.checked),
    });
    const rawToggle = this.el("label", {
      class: "sf-rawtoggle",
      title: "Показывать в карточках ролей кнопку «сырой ответ». Нужно при "
             + "разборе того, почему роль ответила именно так",
    }, rawCheck, this.el("span", { text: "Сырые ответы" }));
    const banner = this.el("div", { class: "sf-banner" });

    const btn = (label, opts) => this.el("button", Object.assign({ text: label }, opts || {}));
    /* Кнопка публикации гаснет, пока скилл не проверен на данных, а причина
       написана рядом: в каталог стенда скилл читают все агенты канала. Публикуют
       только этой кнопкой — горячей клавиши у неё нет намеренно. */
    const publishBtn = btn("Опубликовать", {
      class: "primary sf-act", title: this.PUBLISH_HINT, onclick: () => this.publish(),
    });
    const gate = this.el("span", { class: "sf-gate" });
    const saved = this.el("span", { class: "sf-saved", title: "Время последней записи черновика" });

    /* Всё, что можно сделать со скиллом, стоит на самой панели: пряталось под
       «⋯» именно то, что ищут глазами, а лишний клик за выгрузкой или сменой
       модели ничего не экономил. Подсказка у каждой кнопки говорит, что она
       делает и когда её звать. */
    const toolbar = this.el("div", { class: "sf-toolbar" },
      this.el("span", { class: "sf-dot", title: "Есть несохранённые правки", text: "●" }), filename, saved,
      btn("Проверить", {
        class: "sf-act",
        title: "Полная проверка: статика, прогон запросов на данных и три критика. "
               + "Это она открывает публикацию",
        onclick: () => this.check(true),
      }),
      btn("Быстро", {
        class: "sf-act",
        title: "Статика и прогон на данных без критиков. Когда правите по мелочи "
               + "и ждать модель не хочется",
        onclick: () => this.check(false),
      }),
      this.buildEvalPop(),
      this.el("span", { class: "sf-spacer" }),
      modelSelect, rawToggle,
      btn("Скачать", {
        class: "sf-act",
        title: "Сохранить файл скилла на диск. Когда нужно унести его руками "
               + "или положить в репозиторий",
        onclick: () => this.download(false),
      }),
      btn("Архив", {
        class: "sf-act",
        title: "Скилл, отчёт проверки и весь разговор одним архивом. Когда "
               + "нужно показать кому-то, как получился этот результат",
        onclick: () => this.download(true),
      }),
      btn("Удалить", {
        class: "sf-del sf-act",
        title: "Убрать черновик. Опубликованный скилл каталога это не трогает",
        onclick: () => this.remove(),
      }),
      publishBtn, gate,
    );

    const progress = this.el("div", { class: "sf-progress" });
    const modes = this.el("div", { class: "sf-modes" },
      ...[["form", "Форма"], ["text", "Текст"], ["report", "Отчёт"], ["diff", "Дифф"]]
        .map(([id, label]) => this.el("button", {
          class: id === "form" ? "on" : "", "data-mode": id, text: label,
          onclick: () => this.switchMode(id),
        })),
      this.el("span", { class: "sf-spacer" }),
      this.el("button", {
        class: "sf-edit-toggle", title: "Свернуть редактор в корешок и отдать место разговору",
        text: "Свернуть", onclick: () => this.toggleEditor(),
      }));

    const form = this.el("div", { class: "sf-pane on" }, this.el("div", { class: "sf-form" }));
    const editor = this.el("textarea", {
      class: "sf-editor", spellcheck: "false",
      placeholder: "Выберите скилл слева или нажмите «Создать (AI)».",
      oninput: (e) => { this.state.text = e.target.value; this.markDirty(); },
    });
    const text = this.el("div", { class: "sf-pane" }, editor);
    const report = this.el("div", { class: "sf-pane" }, this.el("div", { class: "sf-report" }));
    const diff = this.el("div", { class: "sf-pane" }, this.buildDiff());

    /* Разговор с агентами стоит в середине и занимает больше всех места: в нём
       проходит почти вся работа, а карточки ролей и мнения совета широкие.
       Редактор скилла ушёл вбок постоянной колонкой заданной ширины — к сырому
       тексту, форме, отчёту и диффу обращаются наездами. Обёртки sf-pane у
       разговора нет намеренно: она прячется, пока ей не включат режим, а
       разговор виден всегда.

       Вкладки представлений переехали внутрь колонки редактора: они относятся
       только к ней, а над разговором висели бы ни к чему. */
    const resizer = this.el("div", {
      class: "sf-resizer sf-resizer-edit", title: "Потянуть; двойной клик — свернуть редактор",
    });
    const chatCol = this.el("div", { class: "sf-chat-col" }, this.buildChat());
    const body = this.el("div", { class: "sf-body" },
      modes, this.el("div", { class: "sf-panes" }, form, text, report, diff));
    const split = this.el("div", { class: "sf-split" }, chatCol, resizer, body);

    Object.assign(this.els, {
      filename, saved, modelSelect, rawCheck, banner, toolbar, modes, progress, publishBtn, gate,
      form: form.firstChild, editor, report: report.firstChild, split, chatCol, resizer, body,
      panes: { form, text, report, diff },
      main: this.el("div", { class: "sf-main" }, toolbar, banner, progress, split),
    });
    this.initSplit();
    return this.els.main;
  },

  /* ---------- ширины колонок ----------
     Разговор в середине забирает всё, что не заняли соседи, поэтому тянутся
     именно они: список слева и редактор справа. Обе ширины переживают
     перезагрузку — человек подгоняет их под свой монитор один раз.

     Пределы широкие намеренно. Раньше у колонки разговора стоял потолок в
     560 пикселей, и ползунок на большом мониторе почти не двигался: место было,
     а взять его было нельзя. */
  SIDE_MIN: 170,
  SIDE_MAX: 560,
  EDIT_MIN: 320,
  EDIT_MAX: 1100,
  CHAT_MIN: 380,
  LAYOUT_KEY: "heimdall.factory.layout",
  OLD_LAYOUT_KEY: "heimdall.factory.chat",

  clamp(value, min, max) { return Math.min(max, Math.max(min, value)); },

  initSplit() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.LAYOUT_KEY) || "{}"); } catch (_) { saved = {}; }
    /* Старый ключ хранил ширину разговора и его свёрнутость. Смысл у обоих
       полей теперь другой, перенести их нельзя — поэтому просто убираем, чтобы
       не лежал мусор. */
    try { localStorage.removeItem(this.OLD_LAYOUT_KEY); } catch (_) { /* приватный режим */ }

    // Ширины клэмпим при чтении: сохранённые с широкого монитора значения на
    // узком раздавили бы разговор до нечитаемого.
    this.setWidth("--sf-side-w", this.clamp(Number(saved.side) || 290, this.SIDE_MIN, this.SIDE_MAX));
    this.setWidth("--sf-edit-w", this.clamp(Number(saved.edit) || 520, this.EDIT_MIN, this.EDIT_MAX));
    if (saved.editCollapsed) this.els.split.classList.add("edit-collapsed");

    this.dragWidth(this.els.sideResizer, "--sf-side-w", () => this.els.side, 1,
                   this.SIDE_MIN, this.SIDE_MAX);
    this.dragWidth(this.els.resizer, "--sf-edit-w", () => this.els.body, -1,
                   this.EDIT_MIN, this.EDIT_MAX, () => this.editorHidden());

    this.els.resizer.addEventListener("dblclick", () => this.toggleEditor());
    this.els.body.addEventListener("click", (e) => {
      // По корешку клик разворачивает: свёрнутая колонка сама себе кнопка.
      if (this.editorHidden() && !e.target.closest("button")) this.openEditor();
    });
  },

  setWidth(name, px) { this.els.page.style.setProperty(name, px + "px"); },

  /* Один обработчик на оба ползунка. Знак говорит, в какую сторону мышь
     расширяет колонку: список растёт вправо, редактор — влево. */
  dragWidth(handle, name, target, sign, min, max, blocked) {
    if (!handle) return;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (blocked && blocked()) return;
      handle.classList.add("dragging");
      const startX = e.clientX;
      const startW = target().getBoundingClientRect().width;
      const move = (ev) => {
        this.setWidth(name, this.clamp(startW + sign * (ev.clientX - startX), min, max));
      };
      const up = () => {
        handle.classList.remove("dragging");
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        this.saveSplit();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
  },

  editorHidden() { return this.els.split.classList.contains("edit-collapsed"); },

  toggleEditor() {
    this.els.split.classList.toggle("edit-collapsed");
    this.saveSplit();
  },

  openEditor() {
    if (!this.editorHidden()) return;
    this.els.split.classList.remove("edit-collapsed");
    this.saveSplit();
  },

  /* Имя осталось прежним: его зовут отовсюду, где работа возвращает внимание к
     разговору. Смысл теперь один — прилипнуть к концу ленты и показать его.
     Прятать разговор больше нечем: он в середине и виден всегда. */
  openChat() {
    this.setStick(true);
    this.scroll();
  },

  saveSplit() {
    const style = this.els.page.style;
    const value = {
      side: parseInt(style.getPropertyValue("--sf-side-w"), 10) || 290,
      edit: parseInt(style.getPropertyValue("--sf-edit-w"), 10) || 520,
      editCollapsed: this.editorHidden(),
    };
    try { localStorage.setItem(this.LAYOUT_KEY, JSON.stringify(value)); } catch (_) { /* приватный режим */ }
  },

  buildChat() {
    /* Шапка разговора отвечает на главный вопрос вкладки — чему верить: точка
       состояния скилла и, пока роли работают, сколько их и сколько это длится. */
    const trustDot = this.el("span", { class: "sf-trust-dot" });
    const trustText = this.el("span", { class: "sf-trust-text" });
    const busy = this.el("span", { class: "sf-chat-busy" });
    const head = this.el("div", { class: "sf-chat-head" }, trustDot, trustText,
      this.el("span", { class: "sf-spacer" }), busy);
    // Путь сценария стоит под шапкой: он появляется только на время работы и не
    // отнимает места, когда агенты молчат.
    const planBox = this.el("div", { class: "sf-plan" });
    Object.assign(this.els, { trustDot, trustText, chatBusy: busy, planBox });
    try { this._planOpen = localStorage.getItem("heimdall.factory.plan") === "1"; } catch (_) { this._planOpen = false; }
    /* Лента живёт под aria-live: реплики агентов приходят потоком, и без этого
       читающая программа не проговаривает ничего до конца работы. */
    const log = this.el("div", { class: "sf-log", "aria-live": "polite", "aria-relevant": "additions" });
    this.watchStick(log);
    const jump = this.el("button", {
      class: "sf-jump", text: "↓ к последним", title: "Вернуться к концу разговора",
      onclick: () => { this._stick = true; this.scroll(); },
    });
    Object.assign(this.els, { jump });
    const input = this.el("textarea", {
      placeholder: "Опишите задачу или скажите, что улучшить. Enter — отправить, Shift+Enter — перенос строки.",
      onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); } },
    });
    const send = this.el("button", { class: "primary", text: "Отправить", onclick: () => this.send() });
    const stop = this.el("button", { class: "sf-stop", text: "■ Стоп", title: "Прервать работу агентов",
                                     onclick: () => this.stop() });
    /* Режим виден и переключается руками, а выбор уезжает в черновик: к
       незаконченному диалогу с интервьюером человек возвращается с той же
       вкладки не всегда. */
    const flow = this.el("select", {
      class: "sf-flow", title: "Что делают агенты с этим черновиком",
      onchange: (e) => this.setFlow(e.target.value === "create"),
    },
      this.el("option", { value: "create", text: "Сборка с нуля" }),
      this.el("option", { value: "improve", text: "Улучшение" }));
    Object.assign(this.els, { log, input, send, stop, flow });
    return this.el("div", { class: "sf-chat" }, head, planBox,
      this.el("div", { class: "sf-log-wrap" }, log, this.els.jump),
      this.el("div", { class: "sf-composer" }, input,
        this.el("div", { class: "sf-composer-btns" }, flow, send, stop)));
  },

  /* ---------- путь сценария ----------
     Человек видел только текущий этап и не знал ни что будет дальше, ни сколько
     кругов правок ему обещано. Путь режима приходит вместе со стартом, поэтому
     схему можно нарисовать наперёд, а не собирать из пройденного.

     Честно показываем позицию и круг; проценты и оставшееся время не обещаем —
     длительность задаёт модель, и любая оценка была бы выдумкой. */
  planStart(event) {
    this.state.plan = Array.isArray(event.plan) ? event.plan : [];
    this.state.planDone = [];
    this.state.round = 0;
    this.state.roundsMax = event.rounds_max || 0;
    this.renderPlan();
  },

  planStage(event) {
    if (event.round) this.state.round = event.round;
    if (event.rounds_max) this.state.roundsMax = event.rounds_max;
    if (!this.state.planDone) this.state.planDone = [];
    if (!this.state.planDone.includes(event.name)) this.state.planDone.push(event.name);
    this.renderPlan();
  },

  /* Свёрнуто — одна строка: где мы и какой круг. Развёрнуто — список этапов с
     пометкой пройденного, текущего и необязательного. */
  renderPlan() {
    const host = this.els.planBox;
    if (!host) return;
    const plan = this.state.plan || [];
    if (!plan.length || !this.state.busy) { host.className = "sf-plan"; host.innerHTML = ""; return; }

    const done = this.state.planDone || [];
    const current = this.state.stage;
    const index = plan.findIndex((step) => step.name === current);
    const round = this.state.round && this.state.roundsMax
      ? ` · круг ${this.state.round} из ${this.state.roundsMax}` : "";
    const head = this.el("div", {
      class: "sf-plan-head",
      onclick: () => { host.classList.toggle("open"); this.savePlanOpen(); },
    },
      this.el("span", { class: "caret", text: host.classList.contains("open") ? "▾" : "▸" }),
      this.el("span", {
        text: index >= 0 ? `шаг ${index + 1} из ${plan.length}${round}` : "путь сценария",
      }));

    const list = this.el("div", { class: "sf-plan-list" });
    for (const step of plan) {
      const state = step.name === current ? "now" : (done.includes(step.name) ? "done" : "wait");
      const mark = { now: "▶", done: "✓", wait: "○" }[state];
      list.append(this.el("div", { class: "sf-plan-step " + state + (step.optional ? " optional" : "") },
        this.el("span", { class: "mk", text: mark }),
        this.el("span", { text: this.STAGE_TITLES[step.name] || step.name }),
        step.optional ? this.el("span", { class: "sf-plan-note", text: "не всегда" }) : null,
        step.repeats && this.state.roundsMax
          ? this.el("span", { class: "sf-plan-note", text: `до ${this.state.roundsMax} кругов` })
          : null));
    }
    host.className = "sf-plan show" + (this._planOpen ? " open" : "");
    host.innerHTML = "";
    host.append(head, list);
  },

  savePlanOpen() {
    this._planOpen = this.els.planBox.classList.contains("open");
    try { localStorage.setItem("heimdall.factory.plan", this._planOpen ? "1" : "0"); } catch (_) { /* приватный режим */ }
  },

  STAGE_TITLES: {
    interview: "Допрос по постановке", reuse: "Поиск готового решения",
    scout: "Разведка каталога", gate: "Подтверждение находок", author: "Сборка скилла",
    judge: "Сверка с постановкой", council: "Совет моделей", council_summary: "Свод мнений",
    check: "Проверка", fix: "Исправление замечаний",
  },

  /* Точка состояния в шапке разговора. Обновляется там же, где кнопка
     публикации: у них один источник правды. */
  renderTrust() {
    if (!this.els.trustDot) return;
    const trust = this.trust();
    this.els.trustDot.className = "sf-trust-dot " + trust.key;
    this.els.trustText.textContent = trust.label;
    this.els.trustText.title = trust.why;
  },

  /* Пока роли работают, в шапке видно, сколько их: карточки могут уехать вверх
     по ленте, а знать, что работа идёт, нужно всегда. */
  renderChatBusy() {
    if (!this.els.chatBusy) return;
    const count = this._roles.size;
    this.els.chatBusy.textContent = count ? `работают: ${count}` : "";
    this.els.chatBusy.classList.toggle("on", count > 0);
  },

  buildDiff() {
    const body = this.el("div", { class: "sf-diff" });
    const count = this.el("span", { class: "sf-diff-count", text: "" });
    const all = this.el("label", { class: "sf-diff-all", title: "Показать файл целиком, а не только правки" },
      this.el("input", {
        type: "checkbox",
        onchange: (e) => { this.state.diffAll = e.target.checked; this.renderDiff(); },
      }),
      this.el("span", { text: "весь файл" }));
    this.els.diff = body;
    this.els.diffCount = count;
    return this.el("div", { class: "sf-fill" },
      this.el("div", { class: "sf-diffbar" },
        this.el("span", { text: "Правка агента: красным убрано, зелёным добавлено." }),
        count,
        this.el("span", { class: "sf-spacer" }),
        all,
        this.el("button", { text: "Откатить правку", onclick: () => this.revert() })),
      body);
  },

  bindShortcuts() {
    document.addEventListener("keydown", (e) => {
      /* Слушаем документ, поэтому сначала убеждаемся, что открыта именно вкладка
         Завода: Escape из любой другой вкладки Heimdall прерывал агентов. */
      if (!this.els.main || !this.els.main.closest(".ws-page.active")) return;
      if (e.key === "Escape" && this.state.busy) { this.stop(); return; }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      /* Привычное «сохранить» сохраняет черновик. Публикация остаётся кнопкой:
         записанный на стенд скилл читают все агенты канала, и такое действие
         человек делает осознанно, а не сочетанием клавиш. */
      this.saveNow();
    });
    window.addEventListener("beforeunload", (e) => {
      if (this.state.dirty || this.state.busy) { e.preventDefault(); e.returnValue = ""; }
    });
  },

  render() { if (!this.state.catalog.length && !this.state.drafts.length) this.reloadList(); },

  /* ---------- состояние Завода ---------- */
  async loadState() {
    try {
      const s = await this.api("/state");
      Object.assign(this.state, {
        stub: s.stub, llmOk: s.llm_ok !== false, clientKind: s.client || "",
        models: s.models || [], defaultModel: s.default_model || "", chain: s.fallback_chain || [],
        limits: this.modelLimits(s),
      });
      this.fillModels(s);
      this.fillCouncil(s);
      this.renderEvalPop();
      const notes = [];
      if (s.auth_mode === "unavailable") {
        notes.push(["err", "Проверка прав на стенде не поднялась: " + (s.auth_reason || "причина неизвестна")
          + ". Ручки Завода отвечают отказом, пока рубеж не собран."]);
      } else if (s.auth_mode === "disabled") {
        notes.push(["info", "Стенд dev: ручки Завода работают без проверки токена. "
          + "Публикация сразу видна всем агентам канала."]);
      }
      if (s.stub) {
        notes.push(["warn", "Завод работает на заглушке модели. Проверка, прогон и публикация настоящие."]);
      } else if (s.llm_probe === "timeout") {
        notes.push(["warn", "Шлюз модели не ответил за отведённое время: список моделей взят из настроек. "
          + "Работает ли генерация — сейчас неизвестно."]);
      } else if (s.llm_ok === false) {
        notes.push(["err", "Модель настроена, но шлюз не ответил на запрос списка моделей. "
          + "Генерация, скорее всего, работать не будет — проверьте доступность шлюза."]);
      }
      /* Адрес называем прямо: каталог уезжает на диск чаще всего потому, что
         сервис слушает не на том порту, от которого считается адрес по умолчанию,
         и без адреса в тексте это ищут наугад. */
      const where = s.catalog_url ? ` Адрес самовызова: ${s.catalog_url}.` : "";
      if (!s.catalog_source) {
        notes.push(["warn", "Источник каталога моделей неизвестен: сервис не ответил за отведённое время. "
          + "Агенты возьмут то, что окажется доступно, — это видно будет в ленте." + where]);
      } else if (s.catalog_source === "disk") {
        notes.push(["warn", "Каталог моделей читается с диска: живой сервис не ответил. "
          + "Часть моделей может не совпадать с тем, что реально доступно." + where]);
      }
      this.showNotes(notes);
    } catch (err) {
      // Закрытая или недоступная Завод — это состояние стенда, а не разовое
      // сообщение: такой баннер висит, пока вкладку не перезагрузят.
      if (err.status === 503 || err.code === "auth-unavailable") {
        this.banner("err", "Завод закрыта: " + err.message, true);
      } else {
        this.banner("err", (err.status === 401 || err.status === 403)
          ? "Нет доступа к Заводу. Укажите токен в настройках админки (шестерёнка в шапке)."
          : "Завод недоступна: " + err.message, true);
      }
    }
  },

  /* Баннер один, а сказать при загрузке бывает нечего или сразу о нескольких
     вещах: показываем самое важное. */
  BANNER_RANK: { err: 3, warn: 2, info: 1, ok: 0 },

  /* Свойства стенда (закрытая авторизация, заглушка модели, каталог с диска)
     верны всё время работы вкладки, поэтому такой баннер сам не гаснет. */
  showNotes(notes) {
    if (!notes.length) return;
    notes.sort((a, b) => (this.BANNER_RANK[b[0]] || 0) - (this.BANNER_RANK[a[0]] || 0));
    this.banner(notes[0][0], notes[0][1], true);
  },

  fillModels(s) {
    const sel = this.els.modelSelect;
    sel.innerHTML = "";
    /* Первый пункт — пусто: тогда каждая роль берёт свою модель из настроек
       (у автора и критика они намеренно разные). Явный выбор перекрывает это. */
    const chainText = (s.fallback_chain || []).join(" → ") || "по настройкам";
    sel.append(this.el("option", { value: "", text: `Авто: ${chainText}` }));
    for (const name of this.state.models) sel.append(this.el("option", { value: name, text: name }));
    sel.value = "";
    this.state.model = "";
  },

  /* Баннер это уведомление, а не состояние экрана: сказанное один раз он через
     несколько секунд убирает сам. Остаются висеть только строки про сам стенд —
     их присылает showNotes с признаком sticky. */
  banner(kind, text, sticky) {
    clearTimeout(this._bannerTimer);
    this._bannerTimer = null;
    this.els.banner.className = "sf-banner show " + kind;
    this.els.banner.textContent = text;
    if (!sticky) this._bannerTimer = setTimeout(() => this.clearBanner(), this.BANNER_MS);
  },

  /* Дописывает уточнение к уже показанной строке. Причину отказа называет тот,
     кто её увидел, а что делать дальше — знает вызывающий; заменять одно другим
     нельзя, человеку нужно и то и другое. */
  bannerMore(text) {
    const node = this.els.banner;
    if (!node || !node.classList.contains("show")) { this.banner("warn", text); return; }
    node.textContent = node.textContent + " " + text;
  },

  clearBanner() {
    clearTimeout(this._bannerTimer);
    this._bannerTimer = null;
    this.els.banner.className = "sf-banner";
    this.els.banner.textContent = "";
  },

  /* Раньше то же сообщение дублировалось баннером, когда разговор был свёрнут.
     Теперь разговор стоит в середине и виден всегда, поэтому дубля нет: один
     сбой — одна строка в ленте. Вызовы оставлены на месте, чтобы точки, где
     сообщение считается важным, не потерялись. */
  bannerAside(_kind, _text) {},

  /* ---------- список слева ---------- */
  switchList(tab) {
    this.state.tab = tab;
    [...this.els.listTabs.children].forEach((b, i) => b.classList.toggle("on", (i === 0) === (tab === "catalog")));
    this.renderList();
  },

  async reloadList() {
    try {
      const [catalog, drafts] = await Promise.all([this.api("/skills"), this.api("/drafts")]);
      this.state.catalog = catalog || [];
      this.state.drafts = drafts || [];
      this.renderList();
    } catch (err) {
      this.banner("err", "Список не загрузился: " + err.message);
    }
  },

  renderList() {
    const list = this.els.list;
    list.innerHTML = "";
    const needle = this.state.filter.trim().toLowerCase();

    if (this.state.tab === "drafts") {
      const shown = this.state.drafts.filter((d) => !needle || (d.title + d.filename).toLowerCase().includes(needle));
      if (!shown.length) list.append(this.el("div", { class: "sf-empty", text: "Черновиков нет." }));
      for (const draft of shown) {
        list.append(this.el("div", {
          class: "sf-item" + (draft.id === this.state.draftId ? " on" : ""),
          onclick: () => this.openDraft(draft.id),
        },
          this.el("span", { class: "sf-item-title", text: draft.title || draft.filename || draft.id }),
          draft.published_path ? this.el("span", { class: "sf-badge pub", title: draft.published_path, text: "на стенде" }) : null,
          draft.issues ? this.el("span", { class: "sf-badge err", text: draft.issues + " ✕" }) : null,
          this.el("span", { class: "sf-badge draft", text: draft.kind === "reference" ? "приём" : "рецепт" }),
        ));
      }
      return;
    }

    const groups = {};
    for (const item of this.state.catalog) {
      if (needle && !(item.name + item.title).toLowerCase().includes(needle)) continue;
      (groups[item.domain] = groups[item.domain] || []).push(item);
    }
    const domains = Object.keys(groups).sort();
    if (!domains.length) list.append(this.el("div", { class: "sf-empty", text: "Ничего не найдено." }));
    for (const domain of domains) {
      list.append(this.el("div", { class: "sf-group", text: this.DOMAIN_TITLES[domain] || domain }));
      for (const item of groups[domain]) {
        list.append(this.el("div", {
          class: "sf-item" + (item.ok ? "" : " broken") + (item.path === this.state.path ? " on" : ""),
          title: item.reason || item.path,
          onclick: () => this.openCatalog(item),
        },
          this.el("span", { class: "sf-item-title", text: item.title || item.name }),
          item.ok ? null : this.el("span", { class: "sf-badge err", text: "!" }),
          this.el("span", { class: "sf-badge " + item.kind, text: item.kind === "recipe" ? "рецепт" : "приём" }),
        ));
      }
    }
  },

  /* ---------- открытие ----------
     Открытие отвечает вызывающему, переключился экран или нет. Отказ бывает
     двух видов: человек не отдал экран (идёт работа агентов, есть несохранённые
     правки) и файл не прочитался. Ответ обязателен, потому что после отказа в
     состоянии остаётся ПРЕЖНИЙ черновик: продолжив работу вслепую, следующая
     реплика ушла бы в него и переписала не тот скилл.

     Параметр ``asked`` означает, что вопросы о работе агентов и о потере правок
     вызывающий уже задал: второй раз человека не спрашиваем. */
  askedToTakeOver(options) {
    if (options && options.asked) return true;
    return this.guardBusy() && this.confirmDiscard();
  },

  async openCatalog(item, options) {
    if (!this.askedToTakeOver(options)) return false;
    try {
      const data = await this.api("/skills/raw?path=" + encodeURIComponent(item.path));
      Object.assign(this.state, {
        path: data.path, draftId: null, aiFlow: false,
        kind: data.suffix === ".md" ? "reference" : "recipe",
        filename: data.path.split("/").pop(), report: null, reportFresh: false,
        reportMark: "", stale: { judge: false, council: false },
        judgement: null, councilReport: null,
      });
      this.setText(data.text, "");
      this.renderPublishGate();
      this.clearBanner();
      this.renderList();
      this.renderChatLog([]);
      this.syncFlow();
      this.switchMode("form");
      return true;
    } catch (err) {
      this.banner("err", "Скилл не открылся: " + err.message);
      return false;
    }
  },

  async openDraft(id, options) {
    if (!this.askedToTakeOver(options)) return false;
    try {
      const draft = await this.api("/drafts/" + id);
      Object.assign(this.state, {
        draftId: draft.id, path: draft.source_path || null, kind: draft.kind,
        filename: draft.filename || (draft.kind === "reference" ? "new_reference.md" : "new_recipe.yaml"),
        report: draft.report || null, reportFresh: !!draft.report_fresh,
        reportMark: draft.report_mark || "", stale: { judge: false, council: false },
        judgement: null, councilReport: null,
        aiFlow: draft.flow === "create",
      });
      /* Вердикты судьи и совета лежат в черновике: и внутри отчёта проверки, и
         рядом с ним. Читаем оба места — иначе после переоткрытия человек видел
         бы отчёт без единого следа того, что скилл вообще оценивали. */
      this.takeVerdicts(draft.report);
      this.takeVerdicts(draft);
      this.setText(draft.text || "", "");
      this.renderPublishGate();
      this.renderReport();
      this.renderChatLog(draft.chat || []);
      this.showVerdicts();
      this.restoreScoutGate(draft);
      this.syncFlow();
      this.renderList();
      this.switchMode("form");
      if (!draft.text) this.openChat();
      return true;
    } catch (err) {
      this.banner("err", "Черновик не открылся: " + err.message);
      return false;
    }
  },

  syncFlow() {
    if (this.els.flow) this.els.flow.value = this.state.aiFlow ? "create" : "improve";
  },

  /* Сценарий черновика меняется в трёх местах: человек выбрал его сам, «Создать
     (AI)» завёл черновик под сборку с нуля, сборка дошла до готового скилла.
     Везде он сохраняется в черновик, иначе после переоткрытия вкладки диалог с
     интервьюером продолжить нельзя. */
  setFlow(create) {
    this.state.aiFlow = !!create;
    this.syncFlow();
    this.saveFlow();
  },

  saveFlow() {
    if (!this.state.draftId) return;
    /* Пока агенты работают, черновик держит сценарий: он запишет его целиком и
       затрёт нашу правку. Откладываем до конца прогона. */
    if (this.state.busy) { this._flowWanted = true; return; }
    this.put("/drafts/" + this.state.draftId, { flow: this.state.aiFlow ? "create" : "improve" })
      .catch(() => {});
  },

  /* Заводит черновик и открывает его. Отдаёт черновик, только если он
     действительно открыт: вызывающий работает с тем, что на экране. */
  async newDraft(kind, flow) {
    if (!this.guardBusy() || !this.confirmDiscard()) return null;
    let draft;
    try {
      draft = await this.post("/drafts", {
        kind, flow: flow || "improve",
        title: kind === "reference" ? "Новый приём" : "Новый рецепт",
      });
      await this.reloadList();
      this.switchList("drafts");
    } catch (err) {
      this.banner("err", "Черновик не создался: " + err.message);
      return null;
    }
    // Про работу агентов и потерю правок спросили выше, повторно не спрашиваем.
    if (!await this.openDraft(draft.id, { asked: true })) {
      this.bannerMore("Сам черновик заведён и ждёт в списке «Черновики».");
      return null;
    }
    return draft;
  },

  async newAiDraft() {
    /* Сценарий пишется в сам черновик при создании. По тексту его не определить:
       новый черновик уже содержит заготовку, и первое же сообщение уходило бы
       улучшением — роль интервьюера оказывалась недостижимой. */
    const draft = await this.newDraft("recipe", "create");
    if (!draft) return;
    this.openChat();
    this.resetChat();
    this.pushMsg("sys", "Опишите задачу словами: какой вопрос должен закрывать скилл. "
      + "Агент допросит по недостающему и ничего не додумает.");
    this.focusInput();
  },

  /* ---------- текст и форма ---------- */
  setText(text, previous) {
    this.state.text = text;
    this.state.previous = previous || "";
    /* Текст сменился — прежний ответ сервера о рубеже относился к другому файлу. */
    this.state.gap = null;
    this.els.editor.value = text;
    this.els.filename.value = this.state.filename;
    this.state.dirty = false;
    this._textTouched = false;
    this.els.main.classList.remove("dirty");
    this.renderForm();
    this.renderDiff();
  },

  markDirty() {
    this.state.dirty = true;
    this._textTouched = true;
    this.els.main.classList.add("dirty");
    /* Правка делает отчёт прошлым: он относится к прежнему тексту. Вместе с ним
       устаревает и рубеж, о котором сказал сервер, — он считал по тому же тексту. */
    this.state.reportFresh = false;
    this.state.gap = null;
    this.renderPublishGate();
    this.autosave();
  },

  /* Сохранение по Ctrl+S: черновик записывается сразу, без ожидания автосохранения.
     Возвращает признак «записано», чтобы вызывающий не считал сохранённым то,
     что на сервер не ушло.

     Скилл каталога сохранять некуда: черновика у него нет, а запись в каталог
     стенда это публикация — отдельное осознанное действие. */
  async saveNow() {
    if (!this.state.draftId) {
      this.banner("warn", "Сохранять некуда: открыт скилл каталога, черновика у него нет. "
        + "«Проверить» заведёт черновик, а записать на стенд можно кнопкой «Опубликовать».");
      return false;
    }
    if (this.state.busy) {
      this._saveWanted = true;
      this.banner("info", "Агенты сейчас правят черновик. Сохраню, как только они закончат.");
      return false;
    }
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    // Запись одна на оба пути: разница только в том, что по Ctrl+S человек ждёт
    // ответа вслух, а автосохранение говорит лишь при отказе.
    const saved = await this.saveQuietly();
    if (saved) this.banner("ok", "Черновик сохранён.");
    return saved;
  },

  autosave() {
    if (!this.state.draftId) return;
    /* Пока агенты работают, автосохранение молчит: оно отправляло на сервер
       текст из редактора и затирало то, что в этот же момент писал агент.
       Отложенное сохранение выполняется, когда прогон закончился. */
    if (this.state.busy) { this._saveWanted = true; return; }
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveQuietly(), 700);
  },

  /* Тихое сохранение: снимает признак несохранённого только по факту записи и
     говорит вслух, если запись не удалась. Молчаливый отказ был опаснее самой
     потери: человек видел «сохранено» и закрывал вкладку.

     Номер записи защищает от гонки: пока летел один запрос, человек мог
     напечатать ещё, и ответ старого запроса не должен гасить признак правки. */
  async saveQuietly() {
    const seq = (this._saveSeq = (this._saveSeq || 0) + 1);
    const sent = { text: this.state.text, filename: this.state.filename };
    try {
      await this.put("/drafts/" + this.state.draftId, sent);
    } catch (err) {
      this.banner("err", "Черновик не сохранился: " + (err.message || "сервис не ответил")
        + ". Правки остались только в окне — не закрывайте вкладку.");
      return false;
    }
    if (seq !== this._saveSeq || this.state.text !== sent.text) return true;
    this.state.dirty = false;
    this.els.main.classList.remove("dirty");
    this.markSaved();
    return true;
  },

  /* Время последней записи в тулбаре. Тихая строка без анимации: индикатор,
     которому верят, — это индикатор, который не мигает. */
  markSaved() {
    if (!this.els.saved) return;
    const now = new Date();
    const two = (value) => String(value).padStart(2, "0");
    this.els.saved.textContent =
      `сохранено ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
  },

  confirmDiscard() {
    return !this.state.dirty || confirm("Есть несохранённые правки. Открыть другой скилл и потерять их?");
  },

  guardBusy() {
    if (!this.state.busy) return true;
    return confirm("Агенты сейчас работают. Прервать и переключиться?") ? (this.stop(), true) : false;
  },

  switchMode(mode) {
    /* Черновики, сохранённые до того, как разговор стал колонкой, помнят режим
       «чат». Показывать в этом случае нечего — открываем форму: разговор и так
       на экране. */
    if (!this.els.panes[mode]) {
      this.openChat();
      mode = "form";
    }
    // Переключение представления бессмысленно при свёрнутом редакторе: кнопки
    // «Открыть отчёт» и переходы к месту замечания ведут именно сюда.
    this.openEditor();
    this.state.mode = mode;
    [...this.els.modes.children].forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    for (const [id, pane] of Object.entries(this.els.panes)) pane.classList.toggle("on", id === mode);
    if (mode === "form") this.renderForm();
    if (mode === "report") this.renderReport();
    if (mode === "diff") this.renderDiff();
  },

  async fields() {
    const kind = this.state.kind;
    if (!this.state.fields[kind]) {
      this.state.fields[kind] = (await this.api("/form/fields?kind=" + kind)).fields;
    }
    return this.state.fields[kind];
  },

  async renderForm() {
    /* Отрисовка асинхронная и зовётся из нескольких мест. Без маркера поколения
       две копии дописывали поля в один контейнер и затирали правки друг друга. */
    const generation = ++this.state.formGeneration;
    const host = this.els.form;
    host.innerHTML = "";
    if (!this.state.text) {
      host.append(this.el("div", { class: "sf-empty", text: "Выберите скилл слева или нажмите «Создать (AI)»." }));
      return;
    }
    let data;
    try {
      data = (await this.post("/form/parse", { text: this.state.text, kind: this.state.kind })).data;
    } catch (err) {
      if (generation !== this.state.formGeneration) return;
      host.innerHTML = "";
      host.append(this.el("div", { class: "sf-empty" },
        "Текст пока не разбирается формой: " + err.message,
        this.el("div", { class: "sf-help", text: "Поправьте его в режиме «Текст» — форма подхватит." })));
      return;
    }
    const fields = await this.fields();
    if (generation !== this.state.formGeneration) return;
    host.innerHTML = "";
    const draft = Object.assign({}, data);
    const sync = () => {
      this.post("/form/render", { data: draft, kind: this.state.kind })
        .then((res) => { this.state.text = res.text; this.els.editor.value = res.text; this.markDirty(); })
        .catch(() => {});
    };
    for (const field of fields) host.append(this.renderField(field, draft, sync));
  },

  renderField(field, draft, sync) {
    const label = this.el("label", {}, field.label, field.required ? this.el("span", { class: "req", text: "*" }) : null);
    const help = field.help ? this.el("div", { class: "sf-help", text: field.help }) : null;
    let control;

    if (field.type === "textarea" || field.type === "markdown") {
      control = this.el("textarea", { oninput: (e) => { draft[field.name] = e.target.value; sync(); } });
      control.value = draft[field.name] || "";
      if (field.type === "markdown") control.classList.add("json");
    } else if (field.type === "select") {
      control = this.el("select", { onchange: (e) => { draft[field.name] = e.target.value; sync(); } });
      for (const option of field.options || []) {
        control.append(this.el("option", { value: option, text: option, selected: draft[field.name] === option }));
      }
    } else if (field.type === "object") {
      control = this.el("textarea", {
        class: "json",
        oninput: (e) => {
          try { draft[field.name] = JSON.parse(e.target.value); e.target.classList.remove("bad"); sync(); }
          catch (_) { e.target.classList.add("bad"); }
        },
      });
      control.value = JSON.stringify(draft[field.name] || {}, null, 2);
    } else if (field.type === "tags") {
      control = this.renderTags(field, draft, sync);
    } else if (field.type === "list") {
      control = this.renderRows(field, draft, sync);
    } else {
      control = this.el("input", { oninput: (e) => { draft[field.name] = e.target.value; sync(); } });
      control.value = draft[field.name] === undefined ? "" : draft[field.name];
    }
    // Имя поля в разметке: по нему замечание отчёта находит своё место в форме.
    return this.el("div", { class: "sf-field", "data-field": field.name }, label, help, control);
  },

  renderTags(field, draft, sync) {
    const values = Array.isArray(draft[field.name]) ? draft[field.name] : [];
    const control = this.el("input", {
      placeholder: "через запятую",
      oninput: (e) => {
        draft[field.name] = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
        sync();
      },
    });
    control.value = values.join(", ");
    return control;
  },

  renderRows(field, draft, sync) {
    const host = this.el("div", { class: "sf-rows" });
    const rows = Array.isArray(draft[field.name]) ? draft[field.name] : [];
    const redraw = () => {
      host.innerHTML = "";
      rows.forEach((row, index) => {
        const line = this.el("div", { class: "sf-row" });
        for (const key of field.fields) {
          // Тело запроса — это несколько строк JSON: в однострочном поле его не
          // прочитать и не поправить, приходилось уходить в текст файла.
          const json = key === "query";
          const input = this.el(json ? "textarea" : "input", {
            placeholder: key,
            class: json ? "json" : "",
            rows: json ? 4 : undefined,
            oninput: (e) => {
              row[key] = json ? SkillFactory.tryJson(e.target.value) : e.target.value;
              draft[field.name] = rows; sync();
            },
          });
          const current = row[key];
          input.value = current === undefined || current === null
            ? "" : (typeof current === "object" ? JSON.stringify(current) : current);
          line.append(input);
        }
        line.append(this.el("button", {
          class: "danger-ghost small", title: "Убрать строку", text: "✕",
          onclick: () => { rows.splice(index, 1); draft[field.name] = rows; redraw(); sync(); },
        }));
        host.append(line);
      });
      host.append(this.el("button", {
        class: "small", text: "+ строка",
        onclick: () => { rows.push({}); draft[field.name] = rows; redraw(); sync(); },
      }));
    };
    redraw();
    return host;
  },

  tryJson(value) { try { return JSON.parse(value); } catch (_) { return value; } },

  /* ---------- оценка готового скилла ----------
     Статика, прогон и критики смотрят на сам скилл. Две оценки здесь смотрят на
     другое: сверка с постановкой — отвечает ли скилл тому, о чём просил человек;
     совет моделей — что о нём независимо думают несколько сильных моделей.

     Обе живут в одном поповере: вид оценки и состав совета — это одно решение, и
     мастер из трёх экранов ради одного нажатия стоил бы дороже самой оценки.

     Ни одна из оценок публикацию не открывает и не закрывает: рубеж остаётся на
     воспроизводимом прогоне на данных. */
  EVAL_HINTS: {
    judge: "Судья получает постановку и скилл и сверяет их построчно: что выполнено, "
      + "что не выполнено, что искажено.",
    council: "Несколько моделей оценивают скилл независимо друг от друга, отдельная модель "
      + "сводит мнения. Общей переписки нет: прочитав чужое мнение первой, модель "
      + "прилипает к нему, и обсуждение сходится к общему, а не к верному.",
  },
  EVAL_NOTE: "Оценка публикацию не закрывает: рубеж остаётся на прогоне на данных. Невыполненное требование постановки судья отдаёт правщику — его чинят, как ошибку статики.",
  COUNCIL_MIN: 2,

  buildEvalPop() {
    const modes = this.el("div", { class: "sf-seg sf-eval-modes" },
      this.el("button", { "data-eval": "judge", text: "Сверить с постановкой",
                          onclick: () => this.setEvalMode("judge") }),
      this.el("button", { "data-eval": "council", text: "Совет моделей",
                          onclick: () => this.setEvalMode("council") }));
    const hint = this.el("div", { class: "sf-eval-hint" });
    const roster = this.el("div", { class: "sf-eval-roster" });
    const picked = this.el("div", { class: "sf-eval-picked" });
    const go = this.el("button", { class: "primary sf-eval-go", text: "Запустить",
                                   onclick: () => this.startEval() });
    const pop = this.el("div", { class: "sf-eval" },
      this.el("div", { class: "sf-eval-head", text: "Оценка готового скилла" }),
      modes, hint, roster, picked,
      this.el("div", { class: "sf-eval-note", text: this.EVAL_NOTE }),
      this.el("div", { class: "act" }, go));
    const button = this.el("button", {
      class: "sf-act sf-eval-btn", text: "Оценить ▾",
      title: "Сверить скилл с постановкой или спросить совет моделей",
      onclick: (e) => { e.stopPropagation(); this.toggleEvalPop(); },
    });
    const wrap = this.el("div", { class: "sf-eval-wrap" }, button, pop);
    document.addEventListener("click", (e) => {
      if (pop.classList.contains("on") && !wrap.contains(e.target)) this.closeEvalPop();
    });
    Object.assign(this.els, { evalPop: pop, evalBtn: button, evalModes: modes, evalHint: hint,
                              evalRoster: roster, evalPicked: picked, evalGo: go });
    return wrap;
  },

  toggleEvalPop() {
    const open = !this.els.evalPop.classList.contains("on");
    this.els.evalPop.classList.toggle("on", open);
    if (open) this.renderEvalPop();
  },

  closeEvalPop() { this.els.evalPop.classList.remove("on"); },

  setEvalMode(mode) {
    this.state.evalMode = mode === "council" ? "council" : "judge";
    this.renderEvalPop();
  },

  /* Квота и карантин по имени модели: ответ /state отдаёт их списком записей, а
     искать их в интерфейсе нужно по имени. */
  modelLimits(s) {
    const out = {};
    for (const item of (s && s.model_limits) || []) {
      if (!item || !item.name) continue;
      out[String(item.name)] = {
        quota: Number(item.quota || 0),
        quarantine: Math.round(Number(item.quarantine_seconds || 0)),
      };
    }
    return out;
  },

  jailed(name) { return Number((this.state.limits[name] || {}).quarantine || 0) > 0; },

  /* Состав совета по умолчанию. Настройки могут назвать его прямо; если нет,
     берём первые модели цепочки отката, пропуская сидящих в карантине: у совета
     из одного участника нет смысла, а звать модель, которую шлюз всё равно
     отклонит, — терять круг впустую. */
  fillCouncil(s) {
    this.state.councilSize = Number((s && s.council_size) || 0) || this.state.councilSize;
    const known = new Set(this.state.models);
    const named = ((s && s.council_models) || []).filter((name) => known.has(name));
    if (named.length) { this.state.council = named.slice(0, this.state.councilSize); return; }
    const order = [];
    for (const name of (this.state.chain || []).concat(this.state.models)) {
      if (!known.has(name) || order.includes(name) || this.jailed(name)) continue;
      order.push(name);
    }
    this.state.council = order.slice(0, this.state.councilSize);
  },

  pickCouncil(name, on) {
    const chosen = this.state.council.filter((item) => item !== name);
    if (on) chosen.push(name);
    this.state.council = chosen;
    this.renderEvalPop();
  },

  plural(count, one, few, many) {
    const n = Math.abs(count) % 100;
    const tail = n % 10;
    if (n > 10 && n < 20) return many;
    if (tail > 1 && tail < 5) return few;
    return tail === 1 ? one : many;
  },

  quotaNote(quota) { return quota + " " + this.plural(quota, "поток", "потока", "потоков"); },

  leftNote(seconds) {
    if (seconds < 90) return seconds + " с";
    const minutes = Math.round(seconds / 60);
    return minutes + " " + this.plural(minutes, "минута", "минуты", "минут");
  },

  renderEvalPop() {
    const council = this.state.evalMode === "council";
    for (const button of this.els.evalModes.children) {
      button.classList.toggle("on", button.getAttribute("data-eval") === this.state.evalMode);
    }
    this.els.evalHint.textContent = this.EVAL_HINTS[this.state.evalMode];
    this.els.evalPop.classList.toggle("council", council);
    this.renderCouncilRoster();
    const chosen = this.state.council.filter((name) => !this.jailed(name));
    const enough = chosen.length >= this.COUNCIL_MIN;
    this.els.evalPicked.className = "sf-eval-picked" + (enough ? "" : " warn");
    this.els.evalPicked.textContent = enough
      ? `отмечено ${chosen.length}: каждый смотрит на скилл сам, свод собирается после`
      : `отмечено ${chosen.length}: совет — это как минимум двое, мнение одной модели `
        + "ничем не отличается от ещё одного критика";
    this.els.evalGo.disabled = council && !enough;
    this.els.evalGo.title = council && !enough
      ? "Отметьте хотя бы двух участников" : "";
  },

  /* Список участников: только то, что процессу уже известно без единого запроса.
     Квота шлюза и остаток карантина лежат в ответе /state; модель в карантине
     показываем серой и отметить не даём — звать её сейчас незачем. */
  renderCouncilRoster() {
    const host = this.els.evalRoster;
    host.innerHTML = "";
    if (this.state.evalMode !== "council") return;
    const names = this.state.models || [];
    if (!names.length) {
      host.append(this.el("div", { class: "sf-eval-empty",
        text: "Список моделей не пришёл: шлюз не ответил. Собирать совет не из кого." }));
      return;
    }
    for (const name of names) {
      const limit = this.state.limits[name] || {};
      const jailed = this.jailed(name);
      const box = this.el("input", {
        type: "checkbox", onchange: (e) => this.pickCouncil(name, e.target.checked),
      });
      box.checked = !jailed && this.state.council.includes(name);
      box.disabled = jailed;
      host.append(this.el("label", {
        class: "sf-eval-model" + (jailed ? " off" : ""),
        title: jailed ? "Модель в карантине: шлюз отказывал ей подряд, участвовать она сейчас не может" : "",
      },
        box,
        this.el("span", { class: "sf-eval-name", text: name }),
        limit.quota ? this.el("span", { class: "sf-eval-quota", title: "Сколько запросов к этой модели шлюз держит одновременно",
                                        text: this.quotaNote(limit.quota) }) : null,
        jailed ? this.el("span", { class: "sf-eval-jail", text: "карантин ещё " + this.leftNote(limit.quarantine) }) : null));
    }
  },

  async startEval() {
    if (this.state.busy) return;
    if (!this.state.text.trim()) { this.banner("warn", "Оценивать нечего: текст пуст."); return; }
    const council = this.state.evalMode === "council";
    const picked = council ? this.state.council.filter((name) => !this.jailed(name)) : [];
    if (council && picked.length < this.COUNCIL_MIN) {
      this.banner("warn", "Отметьте хотя бы двух участников: мнение одной модели — это не совет.");
      return;
    }
    if (!await this.ensureDraft(council ? "Совет моделей" : "Сверка с постановкой")) return;
    this.closeEvalPop();
    this.openChat();
    this.pushStep(council
      ? `Совет моделей: ${picked.length} независимых мнений, затем свод`
      : "Сверка с постановкой: что просили и что получилось");
    await this.stream(council
      ? { mode: "council", model: this.state.model, council_models: picked }
      : { mode: "judge", model: this.state.model });
  },

  /* Черновик под прогон: поток идёт по нему, а у скилла каталога черновика нет.
     Если по этому же файлу черновик уже заводили, берём его — иначе каждое
     открытие скилла плодило бы ещё один. Отвечает, есть ли теперь черновик:
     без него запускать поток некуда. */
  async ensureDraft(title) {
    if (!this.state.draftId && this.state.path) {
      const known = (this.state.drafts || []).find((d) => d.source_path === this.state.path);
      if (known) this.state.draftId = known.id;
    }
    if (this.state.draftId) {
      await this.put("/drafts/" + this.state.draftId, { text: this.state.text }).catch(() => {});
      return true;
    }
    const draft = await this.post("/drafts", {
      kind: this.state.kind, title: this.state.filename || title,
      source_path: this.state.path || "", text: this.state.text,
    }).catch((err) => { this.banner("err", "Не удалось завести черновик: " + err.message); return null; });
    if (!draft) return false;
    this.state.draftId = draft.id;
    await this.reloadList();
    return true;
  },

  /* ---------- проверка ---------- */
  async check(withReview) {
    /* Второй поток поверх работающего ломал отмену и таймер: у обоих один
       this._abort. Кнопки во время прогона гасит класс на корне, но проверка
       нужна и здесь — кнопку можно нажать с клавиатуры. */
    if (this.state.busy) return;
    if (!this.state.text.trim()) { this.banner("warn", "Нечего проверять: текст пуст."); return; }
    if (!await this.ensureDraft("Проверка")) return;
    this.openChat();
    this.pushStep(withReview ? "Проверка: статика, прогон и ревью критиков" : "Быстрая проверка: статика и прогон");
    await this.stream({ mode: "check", model: this.state.model, with_review: !!withReview });
  },

  renderReport() {
    const host = this.els.report;
    host.innerHTML = "";
    const report = this.state.report;
    /* Оценка готового скилла живёт своей жизнью: судью или совет можно спросить
       и до проверки. Тогда отчёта нет, а показать их всё равно надо. */
    const judge = this.state.judgement || (report && report.judge) || null;
    const council = this.state.councilReport || (report && report.council) || null;
    if (!report) {
      host.append(this.el("div", { class: "sf-empty", text: judge || council
        ? "Проверки ещё не было: ниже только оценка готового скилла. Публикацию открывает прогон на данных."
        : "Отчёта ещё нет. Нажмите «Проверить»." }));
      this.paintVerdicts(host, judge, council);
      return;
    }
    /* Счётчики читаем через запасное значение: отчёт приходит и от прошлых
       версий Завода, и из черновика, который лежал на диске, а недостающее поле
       не должно оставлять человека с пустой вкладкой. */
    const counts = report.counts || {};
    host.append(this.el("div", { class: "sf-counts" },
      this.el("span", { class: "sf-count error", text: "ошибок: " + (counts.error || 0) }),
      this.el("span", { class: "sf-count warning", text: "предупреждений: " + (counts.warning || 0) }),
      this.el("span", { class: "sf-count advice", text: "советов: " + (counts.advice || 0) }),
    ));

    /* Главный вопрос вкладки — можно ли публиковать. Пишем ответ первой строкой
       и, если нельзя, называем причину теми же словами, что и у кнопки. */
    const gap = this.publishGap();
    host.append(this.el("div", { class: "sf-verdict " + (gap ? "bad" : "ok") },
      gap ? "Публикация закрыта: " + gap
          : "Скилл проверен на данных: публиковать можно."));

    const run = report.run || {};
    const stateNote = String(report.run_state_note || "");
    /* Пояснение показываем всегда: без него невыполненный прогон и честный ноль
       строк выглядят одинаково — и там и там запросов не видно. */
    if (stateNote || run.note || (run.queries || []).length) {
      host.append(this.el("div", { class: "sf-group", text: "Прогон на данных" }));
      if (stateNote) host.append(this.el("div", { class: "sf-run-note", text: stateNote }));
      if (run.note) host.append(this.el("div", { class: "sf-run-note", text: run.note }));
    }
    if (!run.skipped && (run.queries || []).length) {
      const box = this.el("div", { class: "sf-runs" });
      for (const item of run.queries) {
        box.append(this.el("div", { class: "sf-run" },
          this.el("span", { class: item.ok ? "ok" : "bad", text: item.ok ? "✓" : "✕" }),
          this.el("span", { text: item.label }),
          this.el("span", { text: "строк: " + item.rows }),
          this.el("span", { text: item.elapsed_ms + " мс" }),
        ));
      }
      if (run.dropped) {
        box.append(this.el("div", { class: "sf-run" },
          this.el("span", { text: `не прогнано ещё ${run.dropped} запросов: сработал потолок` })));
      }
      host.append(box);
    }

    this.paintVerdicts(host, judge, council);

    /* Кто смотрел скилл и на какой модели. Панель работает тремя линзами и у
       каждой своя модель: без этого списка вердикт остаётся безымянным, а
       понять, чьё это мнение, негде. */
    const views = (report.review && report.review.views) || [];
    if (views.length) {
      host.append(this.el("div", { class: "sf-group", text: "Критики" }));
      const box = this.el("div", { class: "sf-runs" });
      for (const view of views) {
        box.append(this.el("div", { class: "sf-run" },
          this.el("span", { text: view.title || "Критик" }),
          this.el("span", { class: "sf-say-model", text: view.model || "модель не названа" }),
          this.el("span", { text: view.summary || "" })));
      }
      host.append(box);
    }

    const issues = report.issues || [];
    if (!issues.length) {
      host.append(this.el("div", { class: "sf-empty", text: "Замечаний нет." }));
      return;
    }
    host.append(this.el("div", { class: "sf-group", text: "Замечания" }));
    /* Разом чинить можно и отсюда: список в отчёте полный, а по одному его
       разбирать — столько же прогонов, сколько замечаний. */
    host.append(this.el("div", { class: "sf-report-act" },
      this.el("button", {
        class: "small primary sf-act", text: `Починить эти находки (${issues.length})`,
        title: "Отметить, что именно чинить, и запустить правку с перепроверкой",
        onclick: () => this.openFixPicker(issues, "Что чинить из отчёта проверки"),
      })));
    const titles = { error: "Ошибка", warning: "Предупреждение", advice: "Совет" };
    for (const issue of issues) {
      /* Замечание называет место (поле формы, имя колонки, «прогон»), но найти
         его в файле человек должен был сам. Чип ведёт туда, куда можно попасть:
         в поле формы или в строку текста. */
      const where = String(issue.where || "").trim();
      host.append(this.el("div", { class: "sf-issue " + issue.severity },
        this.el("div", { class: "head" },
          this.el("b", { text: titles[issue.severity] || issue.severity }),
          this.el("span", { class: "code", text: issue.code }),
          where ? this.el("span", {
            class: "where" + (this.canGoto(where) ? " go" : ""), text: where,
            title: this.canGoto(where) ? "Показать это место" : "Место, к которому относится замечание",
            onclick: this.canGoto(where) ? () => this.gotoIssue(where) : null,
          }) : null,
          this.sourceChip(issue.source)),
        this.el("div", { text: issue.message }),
        issue.fix_hint ? this.el("div", { class: "hint", text: issue.fix_hint }) : null,
        this.el("div", { class: "act" },
          this.el("button", { class: "small sf-act", text: "Исправить это", onclick: () => this.fixOne(issue) })),
      ));
    }
  },

  /* ---------- откуда пришло замечание ----------
     На скилл смотрят четверо: статика и прогон проверяемы кодом и повторяемы,
     критики, судья и совет — мнение модели. Человеку нужно понимать, чему
     верить, поэтому источник назван словом и покрашен по этому признаку. */
  SOURCE_TITLES: {
    "статическая проверка": "статика", "статика": "статика", "прогон": "прогон",
    "критик": "критики", "судья": "судья", "совет": "совет",
    static: "статика", run: "прогон", critic: "критики", judge: "судья", council: "совет",
  },
  SOURCE_KINDS: {
    "статика": "code", "прогон": "code", "критики": "model", "судья": "model", "совет": "model",
  },

  sourceChip(source) {
    const raw = String(source || "").trim();
    if (!raw) return null;
    /* Источник называет и того, кто смотрел, и кем именно он был: «совет:
       MiniMax-M3», «критик:по данным». Голова говорит, чему верить, хвост — чьё
       это мнение; теряя хвост, отчёт выдал бы голос одного участника за общий. */
    const cut = raw.indexOf(":");
    const head = (cut > 0 ? raw.slice(0, cut) : raw).trim();
    const tail = cut > 0 ? raw.slice(cut + 1).trim() : "";
    const title = this.SOURCE_TITLES[head.toLowerCase()] || head;
    const kind = this.SOURCE_KINDS[title] || "";
    return this.el("span", {
      class: "src" + (kind ? " " + kind : ""),
      title: kind === "model" ? "Мнение модели: проверять его человеку"
        : kind === "code" ? "Проверено кодом и повторяемо" : "",
      text: tail ? title + " · " + tail : title,
    });
  },

  /* ---------- вердикты судьи и совета ----------
     Оценка живёт в черновике, поэтому её видно и после переоткрытия вкладки.
     В отчёте сверка с постановкой стоит выше критиков: критики говорят про сам
     скилл, а здесь ответ на вопрос, ради которого его писали. */
  paintVerdicts(host, judge, council) {
    if (judge) {
      host.append(this.el("div", { class: "sf-group", text: "Сверка с постановкой" }));
      host.append(this.judgeBlock(judge));
    }
    if (council) {
      host.append(this.el("div", { class: "sf-group", text: "Совет моделей" }));
      host.append(this.councilBlock(council));
    }
  },

  /* Вердикты из черновика: они лежат его полями, а могут прийти и внутри отчёта.
     Где именно — для показа неважно, а потерять вердикт нельзя. */
  takeVerdicts(source) {
    const data = source || {};
    const judge = data.judge || data.judgement || null;
    const council = data.council || null;
    if (judge && typeof judge === "object") this.state.judgement = judge;
    if (council && typeof council === "object") this.state.councilReport = council;
  },

  /* Вердикт оценки: кладём в состояние, показываем в отчёте и карточкой в
     ленте. Свод совета встаёт в своё место общего блока — тогда он стоит
     последним, под всеми участниками. */
  showVerdict(assessment, data) {
    if (!data || typeof data !== "object") return;
    const kind = assessment || String(data.kind || "");
    if (kind === "judge") {
      this.state.judgement = data;
      this.state.stale = { ...this.state.stale, judge: false };
      this.renderReport();
      this.els.log.append(this.judgeCard(data));
    } else if (kind === "council") {
      this.state.councilReport = data;
      this.state.stale = { ...this.state.stale, council: false };
      this.renderReport();
      this.sayCouncil(data);
      (this._councilBox ? this._councilBox.digest : this.els.log).append(this.councilCard(data));
    } else {
      return;
    }
    this.scroll();
  },

  /* Относится ли вердикт к нынешнему тексту. Слово сценария главнее: событие
     `done` приносит признак по каждой оценке. Свой расчёт нужен переоткрытому
     черновику: вердикт и отчёт помечены отпечатком текста, и разные отпечатки
     означают, что оценивали другую версию файла. */
  verdictStale(data) {
    if (!data || typeof data !== "object") return false;
    const kind = String(data.kind || "");
    if (this.state.stale[kind]) return true;
    if (this._textTouched || this.state.dirty) return true;
    const mark = String(data.mark || "");
    const reportMark = String(this.state.reportMark || "");
    return !!(mark && reportMark && this.state.reportFresh && mark !== reportMark);
  },

  /* Вердикт виден и после переоткрытия черновика: карточки возвращаются в ленту,
     а разбор целиком остаётся в отчёте. */
  showVerdicts() {
    if (this.state.judgement) this.els.log.append(this.judgeCard(this.state.judgement));
    if (this.state.councilReport) {
      /* Совет возвращаем целиком, а не одной карточкой свода: мнения участников
         лежат в вердикте, и без них от совета оставался только итог, под
         которым непонятно, кто и что сказал. */
      const box = this.councilBox();
      this.councilLineup(this.state.councilReport.models);
      this.sayCouncil(this.state.councilReport);
      box.digest.append(this.councilCard(this.state.councilReport));
      this._councilBox = null;
    }
    this.scroll();
  },

  /* ---------- сверка с постановкой ----------
     Вердикт приходит в том виде, в каком его записал сценарий: построчная сверка
     в `checks`, пометка строки в `status`, а само требование — словами из
     постановки, а не пересказом роли. */
  JUDGE_STATUS_TITLES: {
    done: "выполнено", missed: "не выполнено", twisted: "искажено", unclear: "не сказано",
  },
  JUDGE_VERDICT_WORDS: {
    matches: "скилл отвечает постановке",
    partial: "скилл отвечает постановке частично",
    mismatch: "скилл постановке не отвечает",
    unclear: "судить не по чему",
  },
  JUDGE_ORIGINS: {
    interview: "Постановка собрана допросом: ей можно верить.",
    words: "Постановка восстановлена из реплик человека: она обрывочна, и расхождение "
      + "с ней не обязательно вина скилла.",
    none: "Постановки нет: черновик заведён из готового скилла, сверять не с чем.",
  },
  STALE_NOTE: "Вердикт вынесен по другой версии текста: скилл с тех пор правили.",

  judgeLines(data) {
    const rows = (data && data.checks) || [];
    return rows.filter((row) => row && typeof row === "object").map((row) => {
      const status = String(row.status || "unclear");
      return {
        status: this.JUDGE_STATUS_TITLES[status] ? status : "unclear",
        title: String(row.title || row.slot || "требование"),
        text: String(row.requirement || ""),
        detail: String(row.detail || ""),
        /* Утверждение о тексте скилла роль обязана подтвердить цитатой, и цитату
           сверяет код. Неподтверждённое остаётся в таблице, но с оговоркой:
           иначе пересказ читается как доказательство. */
        note: row.verified === false ? String(row.quote_note || "без подтверждённой цитаты") : "",
      };
    });
  },

  /* Фразу счёта складывает сервер и кладёт в вердикт полем headline: раньше её
     собирали и здесь, и там, и два счёта об одном и том же расходились
     формулировкой. Свой расчёт остаётся запасным — вердикт мог прийти от старой
     сборки, лежащей в черновике. */
  judgeCounts(lines, data) {
    const ready = String((data && data.headline) || "");
    if (ready) return ready.replace(/^Сверка с постановкой: /, "");
    const counts = { done: 0, missed: 0, twisted: 0, unclear: 0 };
    for (const line of lines) counts[line.status] += 1;
    return `выполнено ${counts.done} · искажено ${counts.twisted} · не выполнено ${counts.missed}`;
  },

  /* Сверка это таблица «требование → исход», а не абзац: пересказом такое
     читается как общее впечатление, и потерянное требование в нём незаметно. */
  judgeTable(lines) {
    const table = this.el("table", { class: "sf-judge-table" });
    table.append(this.el("thead", {}, this.el("tr", {},
      this.el("th", { text: "Требование" }),
      this.el("th", { text: "Исход" }),
      this.el("th", { text: "Что не так" }))));
    const body = this.el("tbody", {});
    for (const line of lines) {
      body.append(this.el("tr", { class: "v-" + line.status },
        this.el("td", {},
          this.el("div", { class: "sf-judge-title", text: line.title }),
          line.text ? this.el("div", { class: "sf-judge-text", text: line.text }) : null),
        this.el("td", {}, this.el("span", { class: "sf-judge-mark " + line.status,
                                            text: this.JUDGE_STATUS_TITLES[line.status] })),
        this.el("td", { class: "sf-judge-detail" },
          line.detail ? this.el("div", { text: line.detail }) : null,
          line.note ? this.el("div", { class: "sf-judge-unverified", text: line.note }) : null)));
    }
    table.append(body);
    return table;
  },

  judgeBlock(data) {
    const lines = this.judgeLines(data);
    const origin = String((data && data.origin) || "");
    const verdict = String((data && data.verdict) || "");
    const box = this.el("div", { class: "sf-judge" });
    box.append(this.el("div", { class: "sf-judge-head" },
      this.el("span", { class: "sf-judge-counts",
                        text: lines.length ? this.judgeCounts(lines, data) : "сверять было нечего" }),
      this.JUDGE_VERDICT_WORDS[verdict]
        ? this.el("span", { class: "sf-council-verdict", text: this.JUDGE_VERDICT_WORDS[verdict] }) : null,
      data && data.llm_model ? this.el("span", { class: "sf-say-model", text: data.llm_model }) : null));
    if (this.verdictStale(data)) {
      box.append(this.el("div", { class: "sf-judge-origin weak", text: this.STALE_NOTE }));
    }
    if (this.JUDGE_ORIGINS[origin]) {
      box.append(this.el("div", { class: "sf-judge-origin" + (origin === "interview" ? "" : " weak"),
                                  text: this.JUDGE_ORIGINS[origin] }));
    }
    if (lines.length) box.append(this.judgeTable(lines));
    const summary = String((data && data.summary) || "");
    if (summary) box.append(this.el("div", { class: "sf-judge-summary", text: summary }));
    for (const note of (data && data.notes) || []) {
      box.append(this.el("div", { class: "sf-judge-origin weak", text: String(note) }));
    }
    box.append(this.el("div", { class: "sf-eval-note", text: this.EVAL_NOTE }));
    return box;
  },

  /* Та же сверка карточкой в ленте: колонка разговора узкая, поэтому здесь
     только то, что не сошлось, а таблица целиком остаётся в отчёте. */
  judgeCard(data) {
    const lines = this.judgeLines(data);
    const bad = lines.filter((line) => line.status !== "done");
    const mine = this.evalIssues(data, "судья");
    const act = this.el("div", { class: "sf-evalcard-act" });
    if (mine.length) {
      act.append(this.el("button", {
        class: "small primary sf-act", text: `Починить эти находки (${mine.length})`,
        title: "Отметить, что именно чинить, и запустить правку с перепроверкой",
        onclick: () => this.openFixPicker(mine, "Что чинить из сверки с постановкой"),
      }));
    }
    // В отчёт зовём, только если там таблица целиком: когда всё выполнено или
    // всё уже показано здесь, идти туда незачем.
    if (lines.length > bad.length) {
      act.append(this.el("button", {
        class: "small sf-evalcard-go", text: "Вся таблица сверки в отчёте",
        onclick: () => this.switchMode("report"),
      }));
    }
    return this.el("div", { class: "sf-evalcard judge" },
      this.el("div", { class: "sf-evalcard-head" },
        this.el("span", { text: "🎯 Сверка с постановкой" }),
        data && data.llm_model ? this.el("span", { class: "sf-say-model", text: data.llm_model }) : null),
      this.el("div", { class: "sf-evalcard-line",
                       text: lines.length ? this.judgeCounts(lines, data) : "сверять было не с чем" }),
      bad.length ? this.judgeTable(bad) : null,
      act.children.length ? act : null);
  },

  /* ---------- совет моделей ----------
     Мнения участников и свод сводчика — разные вещи: свод единственный видел
     чужие мнения, и путать его голос с голосом участника нельзя. */
  COUNCIL_VERDICT_WORDS: {
    ok: "годится", needs_work: "нужна доработка", reject: "не годится", unclear: "мнения нет",
  },

  councilViews(data) {
    /* Список мнений приходит от сценария, но разбор кадра прячет исключения:
       поле чужого вида уносило бы и отчёт, и реплики без всякого следа. */
    const rows = Array.isArray(data && data.opinions) ? data.opinions : [];
    return rows.filter((row) => row && typeof row === "object").map((row) => ({
      model: String(row.model || row.llm_model || "модель не названа"),
      verdict: this.COUNCIL_VERDICT_WORDS[String(row.verdict || "")] || String(row.verdict || ""),
      summary: String(row.summary || ""),
      first: String(row.first_change || ""),
      /* Молчание участника не обесценивает остальных, но и выдавать его за
         мнение нельзя. */
      silent: row.answered === false,
      note: String(row.note || ""),
    }));
  },

  councilDigest(data) {
    if (!data) return null;
    const text = String(data.summary || "");
    const verdict = String(data.verdict || "");
    if (!text && !verdict) return null;
    return {
      model: String(data.judge_model || ""),
      verdict: this.COUNCIL_VERDICT_WORDS[verdict] || verdict,
      text,
      actions: (data.actions || []).map((item) => String(item)),
    };
  },

  /* Сколько мнений собралось. Кворум важен сам по себе: свод по двум ответившим
     из пяти — это не мнение совета, и молчать об этом нельзя. */
  councilQuorum(data, views) {
    const short = data ? data.quorum_met === false : false;
    const ready = String((data && data.headline) || "");
    if (ready) {
      // Признак неполного кворума уже вписан в готовую фразу, второй раз его
      // дописывать нельзя.
      return { text: ready.replace(/^Совет моделей: /, ""), short, full: true };
    }
    const answered = Number((data && data.answered) || 0);
    const asked = ((data && data.models) || []).length || views.length;
    const quorum = Number((data && data.quorum) || 0);
    const parts = [`ответили ${answered} из ${asked}`];
    if (quorum) parts.push(`кворум ${quorum}`);
    return { text: parts.join(", "), short, full: false };
  },

  councilBlock(data) {
    const views = this.councilViews(data);
    const digest = this.councilDigest(data);
    const quorum = this.councilQuorum(data, views);
    const box = this.el("div", { class: "sf-council-block" });
    if (this.verdictStale(data)) {
      box.append(this.el("div", { class: "sf-council-quorum warn", text: this.STALE_NOTE }));
    }
    /* В отчёте свод стоит первым: это вывод, за которым сюда и приходят. В ленте
       наоборот — он последний, потому что и приходит последним. */
    if (digest) {
      box.append(this.el("div", { class: "sf-council-sum" },
        this.el("div", { class: "sf-council-sum-head" },
          this.el("span", { text: "Свод мнений" }),
          digest.verdict ? this.el("span", { class: "sf-council-verdict", text: digest.verdict }) : null,
          digest.model ? this.el("span", { class: "sf-say-model", text: digest.model }) : null),
        digest.text ? this.el("div", { class: "sf-council-sum-text", text: digest.text }) : null,
        ...digest.actions.map((item) => this.el("div", { class: "sf-council-action", text: "— " + item }))));
    }
    box.append(this.el("div", { class: "sf-council-quorum" + (quorum.short ? " warn" : ""),
      text: quorum.short && !quorum.full
        ? quorum.text + ": кворум не набран, свод неполон" : quorum.text }));
    for (const view of views) {
      box.append(this.el("div", { class: "sf-council-op" + (view.silent ? " silent" : "") },
        this.el("div", { class: "sf-council-op-head" },
          this.el("span", { class: "sf-say-model", text: view.model }),
          view.silent
            ? this.el("span", { class: "sf-council-verdict", text: "не ответил" })
            : this.el("span", { class: "sf-council-verdict", text: view.verdict })),
        view.summary ? this.el("div", { class: "sf-council-op-text", text: view.summary }) : null,
        view.first ? this.el("div", { class: "sf-council-op-text", text: "Первым делом: " + view.first }) : null,
        view.silent && view.note ? this.el("div", { class: "sf-council-op-text", text: view.note }) : null));
    }
    for (const note of (data && data.notes) || []) {
      box.append(this.el("div", { class: "sf-council-quorum", text: String(note) }));
    }
    box.append(this.el("div", { class: "sf-eval-note", text: this.EVAL_NOTE }));
    return box;
  },

  /* Итог совета в ленте. Он тут единственный: раньше рядом стояли и эта
     карточка, и та же мысль репликой агента, и третий раз всё это лежало в
     отчёте. Теперь карточка — вывод, а отчёт открывается, только когда в нём
     правда есть что смотреть сверх сказанного.

     Подписи разведены: «Совет моделей» — это этап, внутри которого высказались
     участники, а «Свод мнений» — то, что сделал из их мнений сводчик. Одно имя
     на двоих читалось как повтор одного и того же. */
  councilCard(data) {
    const views = this.councilViews(data);
    const digest = this.councilDigest(data);
    const silent = views.filter((view) => view.silent).length;
    const mine = this.evalIssues(data, "совет");
    const act = this.el("div", { class: "sf-evalcard-act" });
    if (mine.length) {
      act.append(this.el("button", {
        class: "small primary sf-act", text: `Починить эти находки (${mine.length})`,
        title: "Отметить, что именно чинить, и запустить правку с перепроверкой",
        onclick: () => this.openFixPicker(mine, "Что чинить из замечаний совета"),
      }));
    }
    // Кнопка в отчёт нужна, только когда там есть непоказанное: мнения
    // участников уже стоят в ленте выше.
    if (silent || !digest) {
      act.append(this.el("button", {
        class: "small sf-evalcard-go", text: "Разбор в отчёте",
        onclick: () => this.switchMode("report"),
      }));
    }
    return this.el("div", { class: "sf-evalcard council" },
      this.el("div", { class: "sf-evalcard-head" },
        this.el("span", { text: "🧾 Свод мнений" }),
        digest && digest.verdict
          ? this.el("span", { class: "sf-council-verdict", text: digest.verdict }) : null,
        digest && digest.model ? this.el("span", { class: "sf-say-model", text: digest.model }) : null),
      this.el("div", { class: "sf-evalcard-line", text: this.councilQuorum(data, views).text }),
      digest && digest.text ? this.el("div", { class: "sf-council-sum-text", text: digest.text }) : null,
      ...digest ? digest.actions.map(
        (item) => this.el("div", { class: "sf-council-action", text: "— " + item })) : [],
      act.children.length ? act : null);
  },

  /* Места, к которым замечание относится, но показать их негде: прогон и файл
     целиком. Их чип остаётся подписью без клика — кликабельный элемент, который
     никуда не ведёт, хуже отсутствия ссылки. */
  NO_GOTO: ["прогон", "файл", "проверка", "каталог"],

  canGoto(where) {
    return !!where && !this.NO_GOTO.includes(where.toLowerCase());
  },

  /* Ищем место тремя способами по очереди: поле формы с таким именем, затем
     строка текста, где оно упоминается. Не нашли — говорим об этом, а не молчим. */
  gotoIssue(where) {
    const field = this.els.form && this.els.form.querySelector(`[data-field="${CSS.escape(where)}"]`);
    if (field) {
      this.switchMode("form");
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      this.flash(field);
      const input = field.querySelector("input, textarea, select");
      if (input) input.focus({ preventScroll: true });
      return;
    }
    const line = this.state.text.split("\n").findIndex((text) => text.includes(where));
    if (line < 0) {
      this.banner("info", `Место «${where}» в тексте не нашлось: возможно, замечание про файл целиком.`);
      return;
    }
    this.switchMode("text");
    this.gotoLine(line);
  },

  /* Ставим курсор на строку и показываем её: textarea сама прокрутится к
     выделению, если снять и вернуть фокус. */
  gotoLine(index) {
    const editor = this.els.editor;
    if (!editor) return;
    const lines = this.state.text.split("\n");
    const start = lines.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, start + lines[index].length);
    this.flash(editor);
  },

  /* Короткая подсветка того, куда человека привели: без неё переход выглядит
     как ничего не произошло. */
  flash(node) {
    node.classList.add("sf-flash");
    setTimeout(() => node.classList.remove("sf-flash"), 1600);
  },

  /* ---------- чат с агентами ----------
     Лента показывает работу, а не поток символов. Всегда видно: полосу этапа,
     карточку роли (кто, на какой модели, сколько работает, чем занят), шаги
     инструментов, сообщения, вопросы и отчёт. Размышления модели живут под
     раскрытием, сырой ответ — под тумблером разработчика. */
  resetChat() {
    for (const card of this._roles.values()) {
      clearInterval(card.tick);
      if (card.raf) cancelAnimationFrame(card.raf);
    }
    this._roles.clear();
    this._stash.clear();
    this.renderChatBusy();
    this._recent.length = 0;
    /* Карточка ворот жила в очищенной ленте: её признак надо снять здесь, иначе
       следующая реплика уехала бы поправкой к находкам чужого черновика. */
    this._gatePending = false;
    this._gateBox = null;
    this._councilBox = null;
    this._saidReview = "";
    this.els.log.innerHTML = "";
  },

  /* Переоткрытый черновик показывает разговор целиком: и реплики, и замечания
     проверки, если они сохранены в записи истории полем issues. Без них человек
     видел бы обрывок — сообщение «нужна ваша правка» без самой правки. */
  renderChatLog(messages) {
    this.resetChat();
    for (const message of messages || []) {
      this.pushMsg(message.role === "user" ? "user" : "bot", message.content || "");
      const issues = (message && message.issues) || [];
      if (issues.length) this.sayIssues({ issues, counts: this.historyCounts(message, issues) });
      /* Правка файла хранится в записи истории тем же соглашением, что и
         замечания: своим полем рядом с текстом реплики. */
      const edit = (message && message.edit) || null;
      const card = edit ? this.editCard(edit.previous || "", edit.text || "") : null;
      if (card) {
        this.els.log.append(card);
        this.scroll();
      }
    }
  },

  /* Текст без учёта пробелов и регистра: по нему ловим повтор одного и того же
     содержимого. Роль отдаёт свой текст в поле preface вопроса, и если он
     придёт ещё раз отдельным сообщением, второй раз показывать его незачем. */
  norm(text) { return String(text || "").replace(/\s+/g, " ").trim().toLowerCase(); },

  seen(text) {
    const key = this.norm(text);
    if (!key) return true;
    if (this._recent.includes(key)) return true;
    this._recent.push(key);
    if (this._recent.length > this.RECENT_LIMIT) this._recent.shift();
    return false;
  },

  num(value) { return Number(value || 0).toLocaleString("ru-RU"); },

  pushMsg(kind, text, once) {
    if (once && this.seen(text)) return null;
    const node = this.el("div", { class: "sf-msg " + kind, text });
    this.els.log.append(node);
    this.scroll();
    return node;
  },

  /* ---------- совет моделей ----------
     Роли отвечают служебным объектом JSON, но человеческое поле есть у каждой:
     разведчик пишет notes, автор — comment, критики — summary своей линзы. Раньше
     всё это оставалось в отчёте и до чата не доходило, и работа выглядела как
     череда служебных строк. Теперь это реплики: видно, кто что сказал. */
  SAY_TITLES: {
    scout: "Разведчик каталога", author: "Автор", fixer: "Автор",
    critic: "Критик", interviewer: "Интервьюер", judge: "Судья",
    council: "Участник совета", councilor: "Участник совета", council_member: "Участник совета",
    council_judge: "Свод мнений", council_summary: "Свод мнений", summarizer: "Свод мнений",
  },

  /* extra — узел, который встаёт в реплику под текстом: так роль, переписавшая
     файл, приносит с собой карточку правки. Реплика без текста, но с таким
     узлом показывается: показать нечего только когда нет ни того, ни другого. */
  pushSay(role, title, text, model, extra) {
    const body = String(text || "").trim();
    if (!body && !extra) return null;
    /* Реплика роли — как сообщение участника разговора: свой кружок с иконкой,
       своё имя и своя краска. Пока роли говорили одинаковым серым текстом,
       обсуждение читалось как один сплошной журнал. */
    const seat = this.isCouncilRole(role) ? this.councilSeat(model || title) : "";
    const node = this.el("div", { class: "sf-say role-" + role + seat },
      this.el("span", { class: "sf-say-icon", "aria-hidden": "true",
                        text: this.ROLE_ICONS[role] || "•" }),
      this.el("div", { class: "sf-say-body" },
        this.el("div", { class: "sf-say-who" },
          this.el("span", { text: title || this.SAY_TITLES[role] || role }),
          model ? this.el("span", { class: "sf-say-model", text: model }) : null),
        body ? this.el("div", { class: "sf-say-text", text: body }) : null,
        extra || null));
    this.councilHost(role).append(node);
    this.scroll();
    return node;
  },

  /* ---------- правка файла карточкой в реплике ----------
     Роль, переписавшая скилл, говорит об этом словами, а что именно изменилось
     видно тут же: строка «+N −M строк», по щелчку — тот же построчный дифф, что
     и на вкладке «Дифф». Свёрнута по умолчанию: развёрнутый файл разносит ленту
     разговора. Свёрнутая карточка тело не прячет, а очищает: так лента остаётся
     ровной независимо от оформления. */
  editCard(before, after) {
    const rows = this.diffLines(String(before || "").split("\n"), String(after || "").split("\n"));
    const counts = this.diffCounts(rows);
    if (!counts.add && !counts.del) return null;
    const body = this.el("div", { class: "sf-diff sf-edit-body" });
    const head = this.el("button", { class: "small sf-edit-head" });
    let open = false;
    const paint = () => {
      head.textContent = `${open ? "▾" : "▸"} правка файла: +${counts.add} −${counts.del} строк`;
      body.innerHTML = "";
      if (open) this.paintDiff(body, this.foldDiff(rows));
    };
    head.addEventListener("click", () => { open = !open; paint(); this.scroll(); });
    paint();
    return this.el("div", { class: "sf-edit" }, head, body);
  },

  /* ---------- замечания прямо в разговоре ----------
     Раньше проверка заканчивалась строкой «нужна ваша правка», а что именно не
     так, лежало во вкладке «Отчёт» — туда надо было догадаться перейти. Читать
     человек должен разговор: здесь и что сломано, и чем это чинить. Полный
     список остаётся в отчёте, когда хочется увидеть всё сразу. */
  ISSUES_IN_CHAT: 3,

  /* Сколько замечаний какой строгости. Отчёт приносит готовый счёт, а история
     черновика хранит только сам список — тогда считаем по нему. */
  issueCounts(issues) {
    const counts = { error: 0, warning: 0, advice: 0 };
    for (const issue of issues) {
      const key = String((issue && issue.severity) || "");
      if (key in counts) counts[key] += 1;
    }
    return counts;
  },

  /* Сколько ошибок называет сама реплика: «Осталось ошибок: 10». В историю чата
     кладутся только первые карточки, и счёт по ним занижен — плашка писала
     «ошибок 3» под репликой, где сказано «ошибок 10». */
  ERRORS_SAID: /ошибок:\s*(\d+)/i,

  saidErrors(text) {
    const found = this.ERRORS_SAID.exec(String(text || ""));
    return found ? Number(found[1]) : null;
  },

  /* Счёт для сохранённой реплики. Полное число приходит с сервера полем
     issues_total; разбор текста реплики остаётся запасным путём для записей,
     сохранённых до его появления. */
  historyCounts(message, issues) {
    const counts = this.issueCounts(issues);
    const total = Number((message && message.issues_total) || 0);
    if (total > counts.error) return { ...counts, error: total };
    const said = this.saidErrors(message && message.content);
    if (said !== null && said > counts.error) counts.error = said;
    return counts;
  },

  sayIssues(report) {
    const issues = (report && report.issues) || [];
    if (!issues.length) return;
    const titles = { error: "Ошибка", warning: "Предупреждение", advice: "Совет" };
    const box = this.el("div", { class: "sf-found" });
    const counts = (report && report.counts) || this.issueCounts(issues);
    box.append(this.el("div", { class: "sf-found-head" },
      this.el("span", { text: "Проверка нашла:" }),
      this.el("span", { class: "sf-found-count error", text: "ошибок " + (counts.error || 0) }),
      this.el("span", { class: "sf-found-count warning", text: "предупреждений " + (counts.warning || 0) }),
      this.el("span", { class: "sf-found-count advice", text: "советов " + (counts.advice || 0) })));

    for (const issue of issues.slice(0, this.ISSUES_IN_CHAT)) {
      const where = String(issue.where || "").trim();
      box.append(this.el("div", { class: "sf-found-item " + issue.severity },
        this.el("div", { class: "line" },
          this.el("b", { text: titles[issue.severity] || issue.severity }),
          where ? this.el("span", {
            class: "where" + (this.canGoto(where) ? " go" : ""), text: where,
            onclick: this.canGoto(where) ? () => this.gotoIssue(where) : null,
          }) : null,
          this.sourceChip(issue.source)),
        this.el("div", { class: "text", text: issue.message }),
        this.el("div", { class: "act" },
          this.el("button", { class: "small sf-act", text: "Исправить это", onclick: () => this.fixOne(issue) }))));
    }
    /* Сколько замечаний всего. Карточек может быть меньше: в историю чата
       попадают только первые, а счёт остаётся полным. */
    const total = Math.max(
      issues.length,
      (counts.error || 0) + (counts.warning || 0) + (counts.advice || 0),
    );
    if (total > this.ISSUES_IN_CHAT) {
      box.append(this.el("button", {
        class: "small sf-found-all",
        text: `Все замечания (${total}) в отчёте`,
        onclick: () => this.switchMode("report"),
      }));
    }
    this.els.log.append(box);
    this.scroll();
  },

  /* Сводка каждой линзы отдельной репликой: три критика смотрят на разное, и
     склеенная строка читается как одна чужая мысль. Подпись и модель берём из
     готового поля отчёта: собранный человеческий текст пишется для чтения, и
     разбирать его обратно на части — гадание по знакам препинания. */
  sayReview(review) {
    if (!review) return;
    /* Отчёт пересобирается после каждой оценки и приносит с собой прежнюю
       сводку критиков. Второй раз её не проговариваем: те же реплики посреди
       результатов совета читаются как новый круг критиков. */
    const said = JSON.stringify([review.llm_model || "", review.summary || "",
      (review.views || []).map((v) => [v.title || "", v.model || "", v.summary || ""])]);
    if (this._saidReview === said) return;
    this._saidReview = said;
    const views = Array.isArray(review.views) ? review.views : [];
    if (views.length) {
      for (const view of views) {
        this.pushSay("critic", view.title || "Критик", view.summary || "", view.model || "");
      }
      return;
    }
    /* Отчёт мог прийти от прошлой версии проверки или пролежать в черновике:
       списка линз в нём нет, и сводка показывается целиком одной репликой. */
    this.pushSay("critic", "Критик", review.summary || "", review.llm_model || "");
  },

  /* Мнение каждого участника совета — отдельной репликой на его месте в блоке:
     ради нескольких независимых взглядов совет и собирают, а видеть их только в
     отчёте значит не видеть их в разговоре вовсе. Молчавших пропускаем: у них
     нет текста, а о самом молчании говорит их карточка и строка кворума. */
  sayCouncil(data) {
    if (!this._councilBox) return;
    for (const view of this.councilViews(data)) {
      if (view.silent) continue;
      const text = [view.summary, view.first ? "Первым делом: " + view.first : ""]
        .filter(Boolean).join("\n");
      this.pushSay("council", "Участник совета", text, view.model);
    }
  },

  /* Шаг пишем в карточку роли, если она известна, иначе прямо в ленту: шаги
     статики и прогона к ролям не относятся. */
  pushStep(text, extraClass, card) {
    const node = this.el("div", { class: "sf-step " + (extraClass || "") },
      this.el("span", { class: "mark", text: "▸" }), this.el("span", { text }));
    (card ? card.steps : this.els.log).append(node);
    this.scroll();
    return node;
  },

  /* Предупреждение конвейера: человек должен видеть, что агент работает вслепую
     (например, живой каталог моделей недоступен). Предупреждение, пришедшее от
     роли, встаёт в её карточку — в общей ленте оно уезжало от своего участника
     и читалось как замечание обо всём прогоне. */
  pushNotice(event, card) {
    const warn = event.level !== "info";
    const text = String(event.text || "");
    (card ? card.steps : this.els.log).append(this.el("div", {
      class: "sf-notice " + (warn ? "warn" : "info"), title: event.code || "",
    },
      this.el("span", { class: "sf-notice-icon", text: warn ? "⚠" : "ℹ" }),
      this.el("span", { text })));
    this.scroll();
    this.bannerAside(warn ? "warn" : "info", text);
  },

  /* ---------- прилипание ленты к низу ----------
     Пока роль думает, лента дописывается десятками раз в секунду, и на каждый
     кадр звалась прокрутка. Решение «прокручивать, если человек и так у низа»
     считалось заново каждый раз, а один щелчок колеса меньше порога — поэтому
     лента возвращалась к низу быстрее, чем человек успевал отпустить колесо, и
     читать размышления было невозможно.

     Теперь намерение запоминается. Свою же прокрутку узнаём по значению,
     которое сами и выставили: рост содержимого события прокрутки не создаёт,
     поэтому всё, что не совпало, сделал человек. */
  watchStick(box) {
    box.addEventListener("scroll", () => {
      if (box.scrollTop === this._autoTop) return;
      const gap = box.scrollHeight - box.scrollTop - box.clientHeight;
      this.setStick(gap < 24);
    });
  },

  setStick(on) {
    if (this._stick === on) return;
    this._stick = on;
    if (this.els.jump) this.els.jump.classList.toggle("show", !on);
  },

  /* То же для собственного блока роли: он скроллится сам и своей памятью. */
  watchBlockStick(block) {
    block.body.addEventListener("scroll", () => {
      if (block.body.scrollTop === block.autoTop) return;
      const gap = block.body.scrollHeight - block.body.scrollTop - block.body.clientHeight;
      block.stick = gap < 24;
    });
  },

  scroll() {
    const log = this.els.log;
    if (!log || !this._stick) return;
    log.scrollTop = log.scrollHeight;
    this._autoTop = log.scrollTop;
  },

  /* ---------- карточка роли ----------
     Каждый экземпляр роли (Интервьюер, Разведчик, Автор, три Критика) получает
     свою карточку по role_key: кто работает, на какой модели, сколько думает,
     чем занят сейчас и что в итоге сделал. Ключ обязателен, потому что критики
     идут параллельно и их события перемешаны в одном потоке. */
  ROLE_ICONS: {
    interviewer: "❓", scout: "🔎", author: "✎", fixer: "🔧", critic: "⚖", judge: "🎯",
    council: "👤", councilor: "👤", council_member: "👤",
    council_judge: "🧾", council_summary: "🧾", summarizer: "🧾",
  },

  /* ---------- совет моделей в ленте ----------
     Четыре-пять моделей пишут одновременно, и вперемешку их реплики читаются
     кашей. Поэтому участники живут в общем блоке: карточки и реплики каждого
     собраны в одном месте, у каждого своя краска, а свод сводчика стоит
     последним и выделен — он единственный, кто видел чужие мнения. */
  COUNCIL_ROLES: ["council", "councilor", "council_member"],
  COUNCIL_SUM_ROLES: ["council_judge", "council_summary", "summarizer"],
  COUNCIL_SEATS: 6,

  isCouncilRole(role) { return this.COUNCIL_ROLES.includes(String(role || "")); },
  isCouncilSum(role) { return this.COUNCIL_SUM_ROLES.includes(String(role || "")); },

  councilBox() {
    if (this._councilBox) return this._councilBox;
    const list = this.el("div", { class: "sf-council-list" });
    /* Место свода готовим заранее: участники и сводчик работают в одном потоке
       событий, и без готового места свод встал бы там, где успел прийти. */
    const digest = this.el("div", { class: "sf-council-slot" });
    const names = this.el("div", { class: "sf-council-names" });
    const box = this.el("div", { class: "sf-council" },
      this.el("div", { class: "sf-council-head" },
        this.el("span", { text: "👥 Совет моделей" }),
        this.el("span", { class: "sf-council-note", text: "мнения независимы: участники друг друга не видят" })),
      names, list, digest);
    this.els.log.append(box);
    this._councilBox = { box, list, digest, names, seats: new Map() };
    this.scroll();
    return this._councilBox;
  },

  /* Состав объявляется в начале этапа: кого именно спросили, видно до первого
     ответа, а не по числу карточек в конце. */
  councilLineup(models) {
    const names = (models || []).map((name) => String(name)).filter(Boolean);
    if (!names.length) return;
    this.councilBox().names.textContent = "спрошены: " + names.join(", ");
  },

  /* Куда встаёт карточка или реплика: свод — в своё место, участник — в общий
     список, всё остальное — прямо в ленту. */
  councilHost(role) {
    if (this.isCouncilSum(role)) return this.councilBox().digest;
    if (this.isCouncilRole(role)) return this.councilBox().list;
    return this.els.log;
  },

  /* Краска участника по месту в совете: при пяти одновременно пишущих моделях
     взгляд должен различать их, не читая имён. Ключ — имя модели: карточка
     работы и реплика одного участника обязаны совпасть по цвету. */
  councilSeat(key) {
    const seats = this.councilBox().seats;
    const name = String(key || "");
    if (!seats.has(name)) seats.set(name, (seats.size % this.COUNCIL_SEATS) + 1);
    return " seat-" + seats.get(name);
  },

  /* Устойчивый ключ экземпляра роли. Бэкенд шлёт role_key; если его вдруг нет,
     склеиваем свой из роли и названия — тогда события хотя бы не разъедутся по
     разным карточкам. */
  roleKey(event) {
    return String(event.role_key || `${event.role || "role"}:${event.role_title || ""}`);
  },

  roleFor(event) { return this._roles.get(this.roleKey(event)) || null; },

  /* Событие пришло раньше своей карточки: придерживаем до role_start. */
  stash(event) {
    const key = this.roleKey(event);
    const queue = this._stash.get(key) || [];
    if (queue.length < this.STASH_LIMIT) queue.push(event);
    this._stash.set(key, queue);
  },

  roleCard(event) {
    const key = this.roleKey(event);
    const known = this._roles.get(key);
    if (known) return known;

    const icon = this.ROLE_ICONS[event.role] || "•";  // украшение: подпись роли рядом словами
    const model = this.el("span", { class: "sf-role-model", text: event.model || "модель по умолчанию" });
    const timer = this.el("span", { class: "sf-role-time", text: "0 с" });
    const status = this.el("span", { class: "sf-role-status", text: "работает" });
    const live = this.el("span", { class: "sf-role-live" });
    const head = this.el("div", { class: "sf-role-head" },
      this.el("span", { class: "sf-role-icon", "aria-hidden": "true", text: icon }),
      this.el("span", { class: "sf-role-title", text: event.role_title || event.role }),
      model, live, this.el("span", { class: "sf-spacer" }), timer, status);
    const steps = this.el("div", { class: "sf-role-steps" });
    const foot = this.el("div", { class: "sf-role-foot" });
    const council = this.isCouncilRole(event.role) || this.isCouncilSum(event.role);
    const seat = this.isCouncilRole(event.role) ? this.councilSeat(event.model || key) : "";
    // Краска участника: карточка работы и его же реплики читаются как одно лицо.
    const box = this.el("div", { class: "sf-role working role-" + (event.role || "") + seat },
      head, steps, foot);
    this.councilHost(event.role).append(box);

    const card = {
      key, box, head, steps, foot, model, timer, status, live,
      started: Date.now(), think: null, raw: "", rawChars: 0, raf: 0, tick: 0,
      /* Участник совета работает не один: его размышления открытыми не
         показываем, иначе пять потоков мысли разом заливают ленту. */
      quiet: council,
    };
    card.tick = setInterval(() => {
      card.timer.textContent = Math.round((Date.now() - card.started) / 1000) + " с";
      if (card.think && !card.think.done) card.think.count.textContent = this.thinkNote(card.think);
    }, 1000);
    this._roles.set(key, card);
    this.renderChatBusy();
    this.scroll();

    const queued = this._stash.get(key) || [];
    this._stash.delete(key);
    for (const held of queued) this.onEvent(held);
    return card;
  },

  /* Карточку закрывает только её собственное role_done (или конец потока). */
  finishRole(key, event) {
    const card = this._roles.get(key);
    if (!card) return;
    this._roles.delete(key);
    this._stash.delete(key);
    this.renderChatBusy();
    clearInterval(card.tick);
    if (card.raf) { cancelAnimationFrame(card.raf); card.raf = 0; }
    if (card.think) this.paintThink(card.think, true);
    if (card.stream) { card.stream.box.remove(); card.stream = null; }
    card.live.textContent = "";
    card.live.classList.remove("on");
    card.box.classList.remove("working");
    if (this._stopped) {
      card.box.classList.add("stopped");
      card.status.textContent = "прервано";
    } else if (event && event.failed) {
      /* Отказ роли — не завершение: зелёная карточка с пометкой «не ответил»
         читается как успех тем, кто цвет видит раньше текста. */
      card.box.classList.add("failed");
      card.status.textContent = event.note || "не ответил";
    } else {
      card.box.classList.add("done");
      card.status.textContent = (event && event.note) ? event.note : "готово";
    }
    if (event && event.model) card.model.textContent = event.model;
    this.rawFooter(card);
  },

  finishAllRoles() {
    for (const key of [...this._roles.keys()]) this.finishRole(key, null);
    this._stash.clear();
  },

  /* ---------- размышления модели ----------
     Копим в строке и обновляем один текстовый узел пачками через кадр отрисовки:
     размышления приходят сотнями кусков, и узел на каждый кусок укладывал
     вкладку. В DOM держим только хвост THINK_LIMIT символов. */
  thinkBlock(card) {
    if (card.think) return card.think;
    const node = document.createTextNode("");
    const body = this.el("div", { class: "sf-think-body" });
    body.append(node);
    const caret = this.el("span", { class: "caret", text: "▸" });
    const label = this.el("span", { class: "sf-think-label", text: "думает" });
    const count = this.el("span", { class: "sf-think-count", text: "0 с" });
    const head = this.el("div", { class: "sf-think-head" }, caret, label, count);
    /* Пока роль работает одна, размышления видны сразу: смысл живого показа в
       том, чтобы человек видел ход мысли, а не ждал конца и лез в свёрнутый
       блок. Закрывается блок сам, когда роль договорила (paintThink).
       У совета наоборот: четыре-пять моделей думают одновременно, и открытые
       потоки мысли превращают ленту в лавину — там блок свёрнут сразу. */
    const open = !card.quiet;
    const box = this.el("div", { class: "sf-think" + (open ? " open" : "") }, head, body);
    caret.textContent = open ? "▾" : "▸";
    head.addEventListener("click", () => {
      const open = box.classList.toggle("open");
      caret.textContent = open ? "▾" : "▸";
      // Раскрыли блок — снова показываем его конец: интересен свежий кусок.
      if (open && card.think) { card.think.stick = true; this.tail(card.think); }
    });
    card.steps.append(box);
    card.think = {
      box, head, body, node, label, count, stick: true, autoTop: 0,
      text: "", chars: 0, started: Date.now(), stopped: 0, done: false,
    };
    this.watchBlockStick(card.think);
    return card.think;
  },

  appendThink(card, text) {
    if (!card || !text) return;
    const think = this.thinkBlock(card);
    think.text = (think.text + text).slice(-this.THINK_LIMIT);
    think.chars += text.length;
    this.setStatus(card, "размышляет");
    this.paintSoon(card);
  },

  /* Кусков приходят сотни, поэтому в DOM не пишем то, что там уже написано. */
  setStatus(card, text) {
    if (card.status.textContent !== text) card.status.textContent = text;
  },

  thinkNote(think) {
    const end = think.stopped || Date.now();
    return `${Math.round((end - think.started) / 1000)} с · ${this.num(think.chars)} симв.`;
  },

  paintThink(think, final) {
    if (final && !think.done) {
      think.done = true;
      think.stopped = Date.now();
      think.box.classList.add("closed");
      think.box.classList.remove("open");
      think.label.textContent = "размышления";
    }
    const shown = (think.chars > think.text.length ? "…\n" : "") + think.text;
    if (think.node.nodeValue !== shown) {
      think.node.nodeValue = shown;
      this.tail(think);
    }
    think.count.textContent = this.thinkNote(think);
  },

  /* ---------- сырой ответ ----------
     Роли отвечают одним служебным объектом JSON. Раньше он почанково писался в
     ленту, и то же содержимое пользователь видел ещё раз готовым сообщением.
     Теперь поток копится в строке, а в шапке карточки виден только счётчик. */
  appendRaw(card, text) {
    if (!card || !text) return;
    card.raw = (card.raw + text).slice(-this.RAW_LIMIT);
    card.rawChars += text.length;
    this.setStatus(card, "пишет ответ");
    this.paintSoon(card);
  },

  /* Хвост ответа, который роль пишет прямо сейчас. Ответ служебный (объект JSON),
     читать его целиком человеку незачем — но видеть, что строки идут, а не
     «модель молчит третью минуту», нужно. Блок живёт только пока роль работает:
     в подвале завершённой карточки его место занимает кнопка сырого ответа. */
  liveBlock(card) {
    if (card.stream) return card.stream;
    const node = document.createTextNode("");
    const body = this.el("div", { class: "sf-think-body" });
    body.append(node);
    const head = this.el("div", { class: "sf-think-head" },
      this.el("span", { class: "caret", text: "▾" }),
      this.el("span", { class: "sf-think-label", text: "пишет ответ" }));
    const box = this.el("div", { class: "sf-think open" }, head, body);
    card.steps.append(box);
    card.stream = { box, body, node, stick: true, autoTop: 0 };
    this.watchBlockStick(card.stream);
    return card.stream;
  },

  paintLive(card) {
    const live = this.liveBlock(card);
    const shown = card.raw.slice(-this.LIVE_TAIL);
    if (live.node.nodeValue === shown) return;
    live.node.nodeValue = (card.rawChars > shown.length ? "…" : "") + shown;
    this.tail(live);
  },

  /* Держит собственный блок (размышления, живой ответ) у конца текста, пока
     человек не отлистал его сам. Память та же, что у ленты: без неё блок
     возвращался к низу на каждом куске потока. */
  tail(block) {
    if (!block.stick) return;
    block.body.scrollTop = block.body.scrollHeight;
    block.autoTop = block.body.scrollTop;
  },

  /* Кнопка сырого ответа всегда в подвале завершённой карточки, а показывает её
     тумблер: правило видимости в CSS, поэтому оно действует и на карточки,
     созданные после переключения. */
  rawFooter(card) {
    if (!card.raw) return;
    const body = this.el("pre", { class: "sf-raw-body", text: card.raw });
    const button = this.el("button", {
      class: "small sf-raw-btn", title: "Служебный ответ модели целиком",
      text: `сырой ответ · ${this.num(card.rawChars)} симв.`,
      onclick: () => body.classList.toggle("open"),
    });
    card.foot.append(button, body);
  },

  paintSoon(card) {
    if (card.raf) return;
    card.raf = requestAnimationFrame(() => {
      card.raf = 0;
      if (card.think && !card.think.done) this.paintThink(card.think, false);
      if (card.rawChars) {
        card.live.textContent = `пишет ответ… ${this.num(card.rawChars)} симв.`;
        card.live.classList.add("on");
        this.paintLive(card);
      }
      this.scroll();
    });
  },

  setShowRaw(on) {
    this.state.showRaw = !!on;
    this.els.main.classList.toggle("show-raw", this.state.showRaw);
    if (this.els.rawCheck) this.els.rawCheck.checked = this.state.showRaw;
    try { localStorage.setItem(this.RAW_KEY, this.state.showRaw ? "1" : "0"); } catch (_) { /* приватный режим */ }
  },

  loadShowRaw() {
    let saved = false;
    try { saved = localStorage.getItem(this.RAW_KEY) === "1"; } catch (_) { saved = false; }
    this.setShowRaw(saved);
  },

  /* Поле ввода на время прогона заблокировано, и фокус в него не встаёт. Просьбу
     о фокусе (вопрос роли, взятый в работу скилл) запоминаем и выполняем, когда
     агенты закончили: иначе человеку приходится щёлкать в поле руками. */
  focusInput() {
    if (this.state.busy) { this._focusWanted = true; return; }
    this.els.input.focus();
  },

  busy(on) {
    this.state.busy = on;
    this.els.send.disabled = on;
    this.els.input.disabled = on;
    this.els.stop.classList.toggle("show", on);
    /* Действия гасим классом на корне, а не разовым обходом кнопок: кнопка
       «Исправить это» рисуется в отчёте уже во время прогона и при обходе
       оставалась живой — второй поток ломал отмену и таймер. */
    this.els.main.classList.toggle("running", on);
    for (const node of this.els.main.querySelectorAll(".sf-act")) node.disabled = on;
    if (on) {
      this.state.stageStartedAt = Date.now();
      this.state.detail = "";
      this._timer = setInterval(() => this.renderProgress(), 1000);
    } else {
      clearInterval(this._timer);
      this._timer = null;
      this.state.stage = "";
      this.state.detail = "";
      this.renderProgress();
      // Путь показывается, только пока идёт работа: иначе строка «шаг 5 из 6» и
      // стрелка у этапа висят до следующего запуска и врут о происходящем.
      this.renderPlan();
      this.finishAllRoles();
      if (this._saveWanted) { this._saveWanted = false; if (this.state.dirty) this.autosave(); }
      if (this._flowWanted) { this._flowWanted = false; this.saveFlow(); }
      if (this._focusWanted) { this._focusWanted = false; this.els.input.focus(); }
    }
  },

  /* Подробность (имя модели, имя инструмента) запоминается: полоса
     перерисовывается ещё и раз в секунду по таймеру, и без памяти следующий же
     тик стирал бы её. Пустая строка гасит подробность намеренно. */
  renderProgress(extra) {
    if (extra !== undefined) this.state.detail = extra;
    const p = this.els.progress;
    if (!this.state.busy) { p.className = "sf-progress"; p.innerHTML = ""; return; }
    p.className = "sf-progress show";
    const seconds = Math.round((Date.now() - this.state.stageStartedAt) / 1000);
    const parallel = this._roles.size > 1 ? `ролей в работе: ${this._roles.size}` : "";
    const detail = this.state.detail;
    p.innerHTML = "";
    p.append(
      this.el("span", { class: "sf-spin" }),
      this.el("span", { class: "sf-stage-name" },
        this.el("span", { "aria-hidden": "true", text: (this.STAGE_ICONS[this.state.stage] || "•") + " " }),
        this.el("span", { text: this._stageTitle || "работаю" })),
      this.el("span", { class: "sf-elapsed", text: seconds + " с" }),
      detail ? this.el("span", { class: "sf-detail", text: detail }) : null,
      parallel ? this.el("span", { class: "sf-detail", text: parallel }) : null,
    );
  },

  async send() {
    const message = this.els.input.value.trim();
    if (!message || this.state.busy) return;
    if (!this.state.draftId) {
      this.banner("warn", "Чат работает с черновиком. Нажмите «Создать (AI)» или откройте черновик.");
      return;
    }
    this.els.input.value = "";
    this.pushMsg("user", message);
    /* Пока открыты ворота подтверждения находок, режим жёстко «сборка с нуля»:
       ворота есть только в ней, и тумблер вкладки увёл бы поправку туда, где их
       нет, — она молча стала бы обычной правкой текста. */
    const mode = this._gatePending || this.state.aiFlow ? "create" : "improve";
    /* Открыта развилка «взять готовое или писать новое», а человек ответил
       словами вместо кнопки: считаем это выбором в пользу нового скилла,
       иначе следующий ход снова упрётся в тот же вопрос. */
    const payload = { mode, message, model: this.state.model };
    if (this._reusePending) { payload.reuse = "new"; this.closeReuse(); }
    /* Слова на воротах это поправка к находкам, а не согласие с ними: разведка
       идёт вторым заходом. Согласие приходит только кнопкой. */
    if (this._gatePending) { payload.gate = "rescout"; this.closeScoutGate(); }
    await this.stream(payload);
  },

  async fixOne(issue) {
    if (this.state.busy) return;
    if (!this.fixReady()) return;
    this.openChat();
    this.pushMsg("user", "Исправить: " + issue.message);
    await this.stream({ mode: "fix", issues: [issue], model: this.state.model });
  },

  /* ---------- форма «что чинить» ----------
     Замечаний после совета набирается с десяток, и чинить их по одному — это
     десять прогонов. Форма даёт отметить нужные разом и словами уточнить, как
     именно чинить: одним прогоном автор правит отмеченное, а следом идёт
     проверка, поэтому итог виден сразу.

     Замечания шлём объектами как есть: своего опознавателя у них нет, а
     нумеровать их нельзя — отчёт пересобирается после каждой оценки, и номер
     показал бы на другое замечание. */
  fixReady() {
    if (!this.state.draftId) {
      this.banner("warn", "Исправление работает с черновиком. Заведите черновик из этого скилла.");
      return false;
    }
    return true;
  },

  /* Замечания оценки. Берём их из самого вердикта, а не из отчёта: отчёт
     вбирает их следующим событием, и на момент отрисовки карточки его там ещё
     нет. Отчёт остаётся запасным — вердикт, пролежавший в черновике от старой
     сборки, своего списка не несёт. */
  evalIssues(data, head) {
    const own = Array.isArray(data && data.issues) ? data.issues : [];
    if (own.length) return own;
    const report = this.state.report || {};
    const all = Array.isArray(report.issues) ? report.issues : [];
    if (!head) return all;
    return all.filter((issue) => String(issue.source || "").toLowerCase().startsWith(head));
  },

  openFixPicker(issues, title) {
    if (this.state.busy || !this.fixReady()) return;
    const rows = (issues || []).filter((item) => item && typeof item === "object");
    if (!rows.length) {
      this.banner("info", "Чинить нечего: замечаний с этим источником в отчёте нет.");
      return;
    }
    // Форма живёт в единственном числе: две открытые карточки спорили бы за то,
    // какой набор поедет на сервер.
    if (this._fixBox) this._fixBox.remove();

    const boxes = [];
    const wish = this.el("textarea", {
      class: "sf-fixpick-wish", rows: "2",
      placeholder: "Пожелание к правке, необязательно: как именно чинить, чего не трогать",
    });
    const go = this.el("button", { class: "small primary sf-act", text: "", onclick: () => this.fixPicked() });
    const count = () => {
      const picked = boxes.filter((item) => item.input.checked).length;
      go.textContent = `Починить и перепроверить (${picked})`;
      go.disabled = picked === 0;
    };

    const list = this.el("div", { class: "sf-fixpick-list" });
    for (const issue of rows) {
      const input = this.el("input", { type: "checkbox", checked: "checked", onchange: () => count() });
      input.checked = true;
      boxes.push({ input, issue });
      list.append(this.el("label", { class: "sf-fixpick-row sev-" + String(issue.severity || "advice") },
        input,
        this.el("span", { class: "sf-fixpick-body" },
          this.el("span", { class: "sf-fixpick-msg", text: String(issue.message || issue.code || "") }),
          this.el("span", { class: "sf-fixpick-meta" },
            issue.where ? this.el("span", { class: "sf-issue-where", text: String(issue.where) }) : null,
            this.sourceChip(issue.source)))));
    }

    const box = this.el("div", { class: "sf-fixpick" },
      this.el("div", { class: "sf-fixpick-head", text: title || "Что чинить" }),
      list,
      wish,
      this.el("div", { class: "act" }, go,
        this.el("button", {
          class: "small sf-act", text: "Отмена", onclick: () => this.closeFixPicker(),
        })));
    this._fixBox = box;
    this._fixPick = { boxes, wish };
    count();
    this.els.log.append(box);
    this.openChat();
  },

  closeFixPicker() {
    if (this._fixBox) this._fixBox.remove();
    this._fixBox = null;
    this._fixPick = null;
  },

  async fixPicked() {
    if (this.state.busy || !this._fixPick) return;
    const picked = this._fixPick.boxes.filter((item) => item.input.checked).map((item) => item.issue);
    if (!picked.length) return;
    const wish = this._fixPick.wish.value.trim();
    this.closeFixPicker();
    this.openChat();
    this.pushMsg("user", `Починить отмеченное (${picked.length})` + (wish ? `\nПожелание: ${wish}` : ""));
    await this.stream({ mode: "fix", issues: picked, wish, model: this.state.model });
  },

  stop() {
    if (!this._abort) return;
    /* Признак прерывания держим отдельно: карточки, которые ещё в работе, надо
       пометить «прервано», а не «готово». */
    this._stopped = true;
    this._abort.abort();
    this._abort = null;
    this.pushStep("остановлено по вашей команде", "stopped");
    this.finishAllRoles();
  },

  async stream(payload) {
    if (this.state.busy) return;
    this._stopped = false;
    /* Память показанных реплик живёт в пределах одного прогона: она нужна, чтобы
       текст роли не встал дважды (в preface вопроса и сообщением). Между ходами
       её надо чистить — иначе законный повтор той же фразы будет проглочен. */
    this._recent.length = 0;
    /* Отсчёт правок ведём от старта прогона: отчёт придёт по тому тексту, что
       сейчас у черновика на сервере. Рубеж прошлого прогона тоже забываем: новый
       придёт событием done вместе с новым отчётом. */
    this._textTouched = false;
    this.state.gap = null;
    /* Совет собирается заново каждым прогоном: карточки прошлого совета остаются
       в ленте историей, а новые мнения в них попасть не должны. Сводку критиков
       забываем по той же причине: новая проверка проговаривает свою. */
    this._councilBox = null;
    this._saidReview = "";
    this.busy(true);
    this.clearBanner();
    const controller = new AbortController();
    this._abort = controller;
    try {
      const response = await fetch(this.API + "/drafts/" + this.state.draftId + "/chat", {
        method: "POST", headers: this.headers(true), body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw await this.refusal(response);
      if (!response.body) throw new Error("ответ пришёл без потока событий");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Кадры SSE разделены пустой строкой; sse_starlette переносит строки
        // через \r\n, поэтому разделитель ищем в обоих написаниях.
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop();
        for (const part of parts) {
          // В кадре может быть несколько строк data: — по правилам SSE они
          // склеиваются переводом строки. Раньше бралась только первая, и
          // событие с переносом внутри текста терялось целиком.
          const data = part.split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).replace(/^ /, ""))
            .join("\n");
          if (!data.trim()) continue;
          try { this.onEvent(JSON.parse(data)); } catch (_) { /* служебные кадры и пинги пропускаем */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        this.banner("err", (err.refused ? "Агенты не взялись за работу: " : "Поток прервался: ")
          + err.message);
      }
    } finally {
      this._abort = null;
      this.busy(false);
      this.reloadList();
    }
  },

  onEvent(event) {
    /* События приходят по конкретному черновику. Пользователь мог за это время
       открыть другой скилл или скилл каталога — тогда чужое событие не наше
       целиком: ни правку текста, ни отметку о готовности применять нельзя, и в
       ленту открытого сейчас скилла оно тоже не относится. */
    if (event.draft_id && event.draft_id !== this.state.draftId) return;

    /* Событие роли адресуется её карточке по role_key. Если карточки ещё нет,
       событие придерживаем: в ленту такие раньше вываливались сырым текстом. */
    const card = event.role_key ? this.roleFor(event) : null;
    if (event.role_key && !card && event.type !== "role_start") { this.stash(event); return; }
    if (!card && (event.type === "reasoning" || event.type === "delta")) return;

    switch (event.type) {
      case "start":
        this.pushStep(event.stub ? "работает заглушка модели" : "модель подключена");
        this.planStart(event);
        break;
      case "stage":
        this.state.stage = event.name;
        this._stageTitle = event.title;
        this.state.stageStartedAt = Date.now();
        /* Полоса «Свод мнений» открывает свод, а он живёт внутри блока совета:
           в общей ленте она вставала ниже всего блока — под тем, что должна
           была объявить. */
        (this.isCouncilSum(event.name) && this._councilBox
          ? this._councilBox.digest : this.els.log)
          .append(this.el("div", { class: "sf-stagebar" },
            this.el("span", { text: (this.STAGE_ICONS[event.name] || "•") + " " + event.title })));
        this.scroll();
        // Новый этап — прежняя подробность к нему уже не относится.
        this.renderProgress("");
        this.planStage(event);
        if (event.name === "council") this.councilLineup(event.models);
        break;
      case "run":
        // Прогон запросов — самая долгая часть проверки: показываем, какой по
        // счёту запрос идёт, иначе этап выглядит зависшим.
        this.renderProgress(event.total
          ? `запрос ${event.done} из ${event.total}` + (event.label ? ": " + event.label : "")
          : "");
        break;
      case "tick":
        // Сколько идёт этап, и так написано рядом со спиннером.
        this.renderProgress();
        break;
      case "role_start":
        this.roleCard(event);
        this._stageTitle = event.role_title || this._stageTitle;
        this.renderProgress(event.model || "");
        break;
      case "role_done":
        this.finishRole(this.roleKey(event), event);
        this.renderProgress();
        break;
      case "reasoning":
        this.appendThink(card, event.text || "");
        break;
      case "delta":
        this.appendRaw(card, event.text || "");
        break;
      case "retry":
        if (card) card.status.textContent = `повтор ${event.attempt}`;
        this.pushStep(`${event.model} ответила сбоем, повторяю (попытка ${event.attempt})`, "switch", card);
        break;
      case "model_switch":
        if (card) card.model.textContent = event.to;
        this.pushStep(`модель ${event.from} не ответила → перехожу на ${event.to}`, "switch", card);
        this.bannerAside("warn", `Откат модели: ${event.from} → ${event.to}. `
          + `Контекст передан новой модели целиком.`);
        break;
      case "tool_start":
        if (card) card.status.textContent = event.name;
        this.pushStep(`${event.name}: работаю…`, "tool", card);
        this.renderProgress(event.name);
        break;
      case "tool":
        this.pushStep(`${event.name}: ${event.summary}`, "tool" + (event.ok ? " ok" : " bad"), card);
        break;
      case "notice":
        this.pushNotice(event, card);
        break;
      case "message":
        /* Страховка от дубля: тот же текст мог уже прийти как preface вопроса. */
        this.pushMsg("bot", event.text || "", true);
        break;
      case "question":
        this.askQuestion(event);
        break;
      case "similar":
        this.offerReuse(event.skills || []);
        break;
      case "gate":
        this.openScoutGate(event.findings || {}, event.review || [], event.mark || "");
        break;
      case "findings": {
        const f = event.findings || {};
        const m = f.model || {};
        const related = (f.related || []).length;
        this.pushStep(`выбрана модель ${m.schema || "?"}.${m.logic_model || "?"}, `
          + `колонок ${(f.columns || []).length}, уверенность ${f.confidence || "?"}`
          + (related ? `, связей: ${related}` : ""), "tool ok");
        /* Разведчик пишет в notes, что проверил прогоном и в чём не уверен. Это
           единственное место, где видно, на чём стоит будущий скилл. */
        this.pushSay("scout", "Разведчик каталога", (f.notes || []).join("\n"), event.llm_model);
        break;
      }
      case "draft": {
        /* Прежний текст запоминаем до записи нового: карточка правки в реплике и
           вкладка «Дифф» сравнивают одну и ту же пару. */
        const before = event.previous || this.state.text;
        /* Файл с нуля пишет Автор, по перечню замечаний — Автор (правка): второго
           узнаём по тому, что событие принесло прежний текст. */
        const fixing = !!event.previous;
        this.state.filename = event.filename || this.state.filename;
        this.setText(event.text, before);
        /* Текст переписал агент: прошлый отчёт к нему уже не относится. */
        this.state.reportFresh = false;
        this.renderPublishGate();
        this.pushStep("черновик обновлён", "ok");
        this.pushSay(
          fixing ? "fixer" : "author", fixing ? "Автор (правка)" : "Автор",
          event.comment || "", event.llm_model,
          this.editCard(before, event.text || ""),
        );
        break;
      }
      /* Оценка готового скилла: сверка с постановкой и совет моделей. Событие
         одно на обе, кто именно отчитался — сказано полем assessment. */
      case "verdict":
        this.showVerdict(String(event.assessment || ""), event.verdict);
        break;
      case "report":
        this.state.report = event.report;
        this.takeVerdicts(event.report);
        /* Отчёт получен по тексту черновика на сервере. Если человек правил
           редактор, пока шла проверка, отчёт относится к другой версии —
           публикацию такой отчёт не открывает. */
        this.state.reportFresh = !this._textTouched;
        this.renderPublishGate();
        this.renderReport();
        /* Отчёт, помеченный merged, пересобран после оценки — новой проверки за
           ним не стояло. Раньше его приход проговаривался как настоящая
           проверка, и после совета человек читал те же замечания и ту же сводку
           критиков по второму разу. Поля нет — значит сборка сервиса старая, и
           ведём себя как раньше. */
        if (!event.merged) {
          this.pushStep(`проверка: ошибок ${event.report.counts.error}, `
            + `предупреждений ${event.report.counts.warning}, советов ${event.report.counts.advice}`,
            event.report.ok ? "ok" : "bad");
          this.sayReview(event.report.review);
          this.sayIssues(event.report);
        }
        break;
      case "done": {
        /* Готовность считает сервер и присылает полем gap: пустая строка — можно
           публиковать, непустая — причина отказа его же словами. Свой расчёт
           остаётся только на случай, когда поля в событии нет. */
        const said = typeof event.gap === "string";
        const ready = said ? !event.gap : !!event.ready;
        if (said) {
          this.state.gap = event.gap;
          this.renderPublishGate();
        }
        /* Сборка с нуля дошла до готового скилла: дальше черновик дорабатывают.
           Признак уезжает в сам черновик, чтобы пережить переоткрытие вкладки. */
        if (this.state.aiFlow && ready) this.setFlow(false);
        /* Сценарий отчитался, к той ли версии текста относится каждая оценка.
           Его слово главнее своего расчёта: отпечаток считает он. */
        for (const item of event.assessments || []) {
          const kind = String((item && item.kind) || "");
          if (kind) this.state.stale = { ...this.state.stale, [kind]: !!item.stale };
        }
        if ((event.assessments || []).length) this.renderReport();
        /* Ход кончился ожиданием решения на воротах — это не то же самое, что
           «нужна ваша правка»: вторая формулировка отправляет человека искать,
           что же он должен исправить, хотя исправлять нечего. */
        const waiting = String(event.waiting || "");
        this.pushStep(
          ready ? "готово"
            : waiting === "scout-gate" ? "ждёт вашего решения" : "нужна ваша правка",
          ready ? "ok" : "");
        break;
      }
      case "error":
        this.pushMsg("sys", "Сбой: " + event.detail);
        this.bannerAside("err", event.detail);
        break;
    }
  },

  /* Вопрос — единственное место, где виден человеческий текст роли: он приходит
     полем preface этого же события, отдельным сообщением его не дублируют. */
  askQuestion(event) {
    const box = this.el("div", { class: "sf-ask" });
    const preface = String(event.preface || "").trim();
    if (preface) {
      box.append(this.el("div", { class: "sf-ask-preface", text: preface }));
      this.seen(preface);
    }
    box.append(this.el("div", { class: "sf-ask-text", text: event.text || "" }));
    if ((event.options || []).length) {
      const opts = this.el("div", { class: "opts" });
      for (const option of event.options) {
        opts.append(this.el("button", {
          class: "small", text: option,
          onclick: () => { this.els.input.value = option; this.focusInput(); this.send(); },
        }));
      }
      box.append(opts);
    }
    this.els.log.append(box);
    this.scroll();
    this.focusInput();
  },

  /* Похожие скиллы каталога: взять готовый на доработку или писать новый.
     Развилку проходит человек — конвейер сам чужой скилл не подменяет. */
  offerReuse(skills) {
    this._reusePending = true;
    const box = this.el("div", { class: "sf-reuse" },
      this.el("div", { class: "sf-reuse-head", text: "В каталоге уже есть похожее" }),
      this.el("div", { class: "sf-reuse-hint",
        text: "Доработать готовый скилл обычно дешевле, чем завести рядом второй такой же." }));
    for (const skill of skills) {
      const card = this.el("div", { class: "sf-reuse-item" },
        this.el("div", { class: "sf-reuse-title" },
          this.el("b", { text: skill.title || skill.name }),
          this.el("span", { class: "sf-reuse-name", text: skill.name }),
          skill.domain ? this.el("span", { class: "sf-reuse-domain", text: skill.domain }) : null),
        skill.description ? this.el("div", { class: "sf-reuse-desc", text: skill.description }) : null,
        this.el("div", { class: "act" },
          this.el("button", {
            class: "small", text: "Доработать этот",
            onclick: () => this.reuseSkill(skill),
          })));
      box.append(card);
    }
    box.append(this.el("div", { class: "act" },
      this.el("button", {
        class: "small primary", text: "Ничего не подошло, пишем новый",
        onclick: () => {
          this.closeReuse();
          this.stream({ mode: "create", model: this.state.model, reuse: "new" });
        },
      })));
    this._reuseBox = box;
    this.els.log.append(box);
    this.scroll();
  },

  /* ---------- ворота подтверждения находок разведки ----------
     Разведчик называет витрину, колонки и фильтры, а файл по ним пишется сразу.
     Ворота вставляют сюда решение человека: пока он не сказал «всё верно», сборка
     не начинается. Карточка показывает сами находки и разбор строками, а
     подтверждение уезжает отдельным полем запроса, а не словами в чате. */
  openScoutGate(findings, review, mark) {
    this._gatePending = true;
    /* Отпечаток находок возвращается вместе с подтверждением: сервер по нему
       видит, что человек подтверждает ровно то, что ему показали. Без него
       подтверждение не принимается. */
    this._gateMark = String(mark || "");
    const box = this.el("div", { class: "sf-scoutgate" },
      this.el("div", { class: "sf-scoutgate-head", text: "Разведка нашла данные — подтвердите до сборки" }),
      this.gateFacts(findings || {}),
      this.gateReview(review || []),
      this.el("div", { class: "sf-scoutgate-hint",
        text: "Что-то не так — скажите словами в чат: это поправка, разведка сходит ещё раз." }),
      this.el("div", { class: "act" },
        this.el("button", {
          class: "small primary sf-act sf-scoutgate-go", text: "Всё верно, пишем скилл",
          onclick: () => this.confirmScoutGate(),
        })));
    this._gateBox = box;
    this.els.log.append(box);
    this.scroll();
    this.focusInput();
  },

  /* Находки одним взглядом: витрина, колонки, метрики, фильтры. Списки режем —
     длинный перечень колонок читать никто не станет, а витрина и фильтры на
     экране должны быть целиком. */
  gateFacts(findings) {
    const model = findings.model || {};
    const table = [model.schema, model.logic_model].filter(Boolean).join(".");
    const filters = (findings.filters || []).filter((f) => f && typeof f === "object");
    const box = this.el("div", { class: "sf-scoutgate-facts" });
    const row = (key, value, extra) => {
      box.append(this.el("div", { class: "sf-scoutgate-key", text: key }));
      box.append(this.el("div", { class: "sf-scoutgate-val" + (extra ? " " + extra : ""), text: value }));
    };
    row("витрина", table || "не названа", table ? "mono" : "empty");
    row("колонки", this.gateList(findings.columns || []), "mono");
    if ((findings.metrics || []).length) row("метрики", this.gateList(findings.metrics), "mono");
    row("фильтры", filters.length
      ? filters.map((f) => [f.column || "?", f.operator || "=", f.value].filter(
        (part) => part !== undefined && part !== null && part !== "").join(" ")).join("; ")
      : "ни одного: скилл ответит по всем строкам витрины",
      filters.length ? "mono" : "empty");
    return box;
  },

  gateList(items, limit) {
    const cap = limit || 12;
    const names = (items || []).map((item) => String(item));
    if (!names.length) return "ни одной";
    if (names.length <= cap) return names.join(", ");
    return names.slice(0, cap).join(", ") + ` … и ещё ${names.length - cap}`;
  },

  /* Разбор находок строками. Проверенное кодом и наблюдение, которое решает
     человек, показываем по-разному: одинаковый вид дал бы ложное чувство
     проверенности — за половину строк на самом деле никто не ручается.
     Всё сошедшееся сворачиваем в одну строку итога, чтобы важное не утонуло. */
  gateReview(review) {
    const lines = (review || []).filter((line) => line && typeof line === "object");
    const box = this.el("div", { class: "sf-scoutgate-review" });
    const good = [];
    for (const line of lines) {
      const level = String(line.level || "info");
      if (level === "ok") { good.push(String(line.title || "")); continue; }
      const human = String(line.by || "") === this.GATE_BY_HUMAN;
      box.append(this.el("div", { class: "sf-scoutgate-line " + level + (human ? " human" : " code") },
        this.el("div", { class: "sf-scoutgate-line-head" },
          this.el("span", { class: "sf-scoutgate-mark", text: level === "warn" ? "▲" : "•" }),
          this.el("b", { text: String(line.title || "") }),
          this.el("span", { class: "sf-scoutgate-who",
            text: human ? "решает человек" : "проверено кодом" })),
        line.detail ? this.el("div", { class: "sf-scoutgate-detail", text: String(line.detail) }) : null));
    }
    if (good.length) {
      box.append(this.el("div", { class: "sf-scoutgate-line ok code" },
        this.el("div", { class: "sf-scoutgate-line-head" },
          this.el("span", { class: "sf-scoutgate-mark", text: "✓" }),
          this.el("b", { text: "Сошлось: " + good.filter(Boolean).join("; ") }),
          this.el("span", { class: "sf-scoutgate-who", text: "проверено кодом" }))));
    }
    return box;
  },

  /* Человек подтвердил находки. Режим берём жёстко: ворота живут только в сборке
     с нуля, и тумблер вкладки, тронутый на воротах, увёл бы ответ в режим, где
     ворот нет вовсе, — подтверждение потерялось бы молча. */
  async confirmScoutGate() {
    if (!this._gatePending || this.state.busy) return;
    /* Отпечаток забираем до закрытия карточки: закрытие его обнуляет. */
    const mark = this._gateMark;
    this.closeScoutGate();
    this.pushStep("находки подтверждены — пишем скилл", "ok");
    await this.stream({
      mode: "create", gate: "confirm", gate_mark: mark, model: this.state.model,
    });
  },

  /* Ворота пройдены: кнопку убираем, чтобы нажать её второй раз было нельзя. */
  closeScoutGate() {
    this._gatePending = false;
    this._gateMark = "";
    if (this._gateBox) {
      for (const button of this._gateBox.querySelectorAll("button")) button.remove();
      this._gateBox = null;
    }
  },

  /* Ворота живут минутами, и вкладку на них перезагружают. Состояние ворот и
     сами находки лежат в черновике, поэтому карточка возвращается на экран при
     открытии. Разбор заново не считаем: он был показан в разговоре, а решение
     принимается по находкам и без него. */
  restoreScoutGate(draft) {
    const state = (draft && draft.scout_gate) || {};
    if (!state.asked || state.confirmed) return;
    const findings = (draft && draft.findings) || {};
    const model = findings.model || {};
    if (!model.logic_model && !(findings.columns || []).length) return;
    this.openScoutGate(findings, [], state.mark || "");
  },

  /* Развилка пройдена: кнопки убираем, чтобы на них нельзя было нажать второй раз. */
  closeReuse() {
    this._reusePending = false;
    if (this._reuseBox) {
      for (const button of this._reuseBox.querySelectorAll("button")) button.remove();
      this._reuseBox = null;
    }
  },

  /* Переход на доработку готового скилла: заводим по нему черновик и дальше
     работаем в режиме улучшения. Черновик обязателен — чат живёт только с ним. */
  async reuseSkill(skill) {
    if (this.state.busy) return;
    const entry = (this.state.catalog || []).find((item) => item.name === skill.name);
    if (!entry || !entry.path) {
      this.banner("warn", `Скилл ${skill.name} не найден в каталоге стенда — придётся писать новый.`);
      return;
    }
    this.closeReuse();
    let created;
    try {
      const raw = await this.api("/skills/raw?path=" + encodeURIComponent(entry.path));
      created = await this.post("/drafts", {
        kind: raw.suffix === ".md" ? "reference" : "recipe",
        title: skill.title || skill.name,
        source_path: entry.path,
        text: raw.text,
      });
    } catch (err) {
      this.banner("err", "Не удалось взять скилл в работу: " + err.message);
      return;
    }
    /* Пока черновик не открыт, работать дальше нельзя: на экране остался прежний
       скилл, и следующая реплика ушла бы в него. */
    if (!await this.openDraft(created.id)) {
      this.bannerMore(`Черновик по скиллу ${skill.name} заведён и ждёт в списке «Черновики».`);
      return;
    }
    this.openChat();
    this.pushStep(`взят на доработку скилл ${skill.name}`, "ok");
    this.pushMsg("sys", "Опишите, что в нём поменять — дальше работаем с этим скиллом.");
    this.focusInput();
  },

  /* ---------- дифф ---------- */
  /* ---------- дифф ----------
     Сравниваем строки по порядку, а не множествами. Множества врали на YAML:
     строки вроде «type: condition» и «operator: =» встречаются в файле десятки
     раз, и удаление такой строки пропадало, если её двойник оставался где-то
     ещё. Удаления к тому же выводились кучей перед файлом, а не на своих местах.

     Основа — наибольшая общая подпоследовательность. Одинаковые начало и конец
     срезаются заранее: правка агента обычно трогает несколько строк, и без этого
     таблица размером «весь файл на весь файл» считалась бы впустую. */
  DIFF_CELLS: 4000000,        // потолок работы: дальше показываем целиком, без разбора
  DIFF_CONTEXT: 3,            // сколько неизменных строк оставляем вокруг правки
  DIFF_FOLD: 8,               // с какого числа подряд неизменных строк прячем середину

  diffLines(before, after) {
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;
    let tail = 0;
    while (
      tail < before.length - head && tail < after.length - head
      && before[before.length - 1 - tail] === after[after.length - 1 - tail]
    ) tail++;

    const a = before.slice(head, before.length - tail);
    const b = after.slice(head, after.length - tail);
    const rows = [];
    for (let i = 0; i < head; i++) rows.push({ kind: "same", text: before[i], old: i + 1, now: i + 1 });

    if (a.length * b.length > this.DIFF_CELLS) {
      // Файлы разошлись слишком сильно, чтобы считать таблицу: показываем как есть.
      a.forEach((text, i) => rows.push({ kind: "del", text, old: head + i + 1 }));
      b.forEach((text, i) => rows.push({ kind: "add", text, now: head + i + 1 }));
    } else {
      const table = [];
      for (let i = 0; i <= a.length; i++) table.push(new Uint32Array(b.length + 1));
      for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
          table[i][j] = a[i] === b[j]
            ? table[i + 1][j + 1] + 1
            : Math.max(table[i + 1][j], table[i][j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          rows.push({ kind: "same", text: a[i], old: head + i + 1, now: head + j + 1 });
          i++; j++;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
          rows.push({ kind: "del", text: a[i], old: head + i + 1 });
          i++;
        } else {
          rows.push({ kind: "add", text: b[j], now: head + j + 1 });
          j++;
        }
      }
      while (i < a.length) { rows.push({ kind: "del", text: a[i], old: head + i + 1 }); i++; }
      while (j < b.length) { rows.push({ kind: "add", text: b[j], now: head + j + 1 }); j++; }
    }

    for (let k = 0; k < tail; k++) {
      const oldNo = before.length - tail + k + 1;
      rows.push({ kind: "same", text: before[oldNo - 1], old: oldNo, now: after.length - tail + k + 1 });
    }
    return rows;
  },

  /* Сколько строк добавлено и убрано. Считается по тем же строкам диффа, что и
     рисуется, — и на вкладке, и в карточке правки внутри реплики. */
  diffCounts(rows) {
    return rows.reduce((acc, row) => {
      if (row.kind === "add") acc.add += 1;
      if (row.kind === "del") acc.del += 1;
      return acc;
    }, { add: 0, del: 0 });
  },

  renderDiff() {
    const host = this.els.diff;
    if (!host) return;
    host.innerHTML = "";
    if (!this.state.previous) {
      host.append(this.el("div", { class: "sf-empty", text: "Правок агента пока не было." }));
      return;
    }
    const rows = this.diffLines(this.state.previous.split("\n"), this.state.text.split("\n"));
    const counts = this.diffCounts(rows);
    if (this.els.diffCount) {
      this.els.diffCount.textContent = counts.add || counts.del
        ? `+${counts.add} −${counts.del}` : "правок нет";
    }
    if (!counts.add && !counts.del) {
      host.append(this.el("div", { class: "sf-empty", text: "Текст совпадает с прежним." }));
      return;
    }
    this.paintDiff(host, this.state.diffAll ? rows : this.foldDiff(rows));
  },

  /* Между правками остаются длинные неизменные куски: середину прячем и даём
     развернуть. Иначе одна исправленная строка тонет в файле на пятьсот строк. */
  foldDiff(rows) {
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length > this.DIFF_FOLD) {
        out.push(...run.slice(0, this.DIFF_CONTEXT));
        out.push({ kind: "fold", hidden: run.slice(this.DIFF_CONTEXT, run.length - this.DIFF_CONTEXT) });
        out.push(...run.slice(run.length - this.DIFF_CONTEXT));
      } else {
        out.push(...run);
      }
      run = [];
    };
    for (const row of rows) {
      if (row.kind === "same") { run.push(row); continue; }
      flush();
      out.push(row);
    }
    flush();
    return out;
  },

  paintDiff(host, rows) {
    const mark = { add: "+", del: "−", same: " " };
    for (const row of rows) {
      if (row.kind === "fold") {
        const button = this.el("button", {
          class: "sf-fold", text: `⋯ ещё ${row.hidden.length} строк без изменений`,
          onclick: () => {
            const shown = document.createDocumentFragment();
            const inner = this.el("div");
            this.paintDiff(inner, row.hidden);
            while (inner.firstChild) shown.append(inner.firstChild);
            button.replaceWith(shown);
          },
        });
        host.append(button);
        continue;
      }
      host.append(this.el("span", { class: "ln " + row.kind },
        this.el("span", { class: "no", text: String(row.old || "") }),
        this.el("span", { class: "no", text: String(row.now || "") }),
        this.el("span", { class: "mk", text: mark[row.kind] }),
        this.el("span", { class: "tx", text: row.text })));
    }
  },

  revert() {
    if (!this.state.previous) return;
    if (!confirm("Вернуть текст до правки агента?")) return;
    this.setText(this.state.previous, "");
    this.markDirty();
  },

  /* ---------- публикация ----------
     В каталог стенда идёт проверенное: опубликованный скилл читают все агенты
     канала, и невыполнимый запрос ломает работу им, а не автору. Пока свежего
     отчёта с подтверждённым прогоном нет, кнопка погашена, а причина написана
     рядом словами. Опубликовать всё равно можно — но только осознанно. */

  /* Где в отчёте искать итог прогона на данных. Отчёт называет его либо старым
     признаком «прогон подтверждён», либо состоянием прогона; поля перечислены
     от нового к старому, а внутри отчёта смотрим и в раздел прогона. */
  RUN_STATE_KEYS: ["data_state", "run_state", "data_status", "run_status",
                   "state", "status", "data_verified"],

  /* Состояние прогона человеческими словами: чего не хватает для публикации.
     Пустая строка означает «данные есть, публиковать можно».

     Слова те же, которыми отказывает ручка публикации: про одно и то же человек
     не должен читать двумя разными языками. Ниже дописаны общие синонимы —
     отчёт мог прийти от другой версии проверки и назвать состояние иначе. */
  RUN_STATE_GAPS: {
    "data-present": "",
    "no-rows": "прогон вернул ноль строк: запросы выполняются, но данных не отдают. "
               + "Проверьте значения в фильтрах",
    "query-failed": "запрос скилла не выполнился: прогон вернул ошибку ручки данных",
    "not-performed": "прогон на данных не выполнялся или выполнен не полностью",
    ok: "", data: "", rows: "", verified: "", success: "", passed: "", has_data: "",
    empty: "прогон вернул ноль строк: запросы выполняются, но данных не отдают",
    no_data: "прогон вернул ноль строк: запросы выполняются, но данных не отдают",
    error: "запрос скилла не выполнился: прогон вернул ошибку ручки данных",
    failed: "запрос скилла не выполнился: прогон вернул ошибку ручки данных",
    skipped: "прогон на данных не выполнялся",
    not_run: "прогон на данных не выполнялся",
    none: "прогон на данных не выполнялся",
    off: "прогон на данных не выполнялся: он был выключен",
  },

  // Состояние «прогона не было» и причина «прогонять нечего» из отчёта прогона.
  RUN_NOT_PERFORMED: "not-performed",
  SKIP_NOTHING: "nothing-to-run",

  /* Значение состояния прогона как оно лежит в отчёте: строка, признак или
     ничего. Сначала смотрим сам отчёт, потом его раздел про прогон. */
  runStateValue(report) {
    for (const place of [report, report.run || {}]) {
      for (const key of this.RUN_STATE_KEYS) {
        const value = place[key];
        if (typeof value === "boolean") return value;
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
    return null;
  },

  /* Справочный приём без примеров запросов: прогонять у него нечего, и требовать
     прогон значило бы требовать невозможного. Ручка публикации делает такое же
     исключение, экран не должен быть строже неё. */
  nothingToRun(report, state) {
    if (state !== this.RUN_NOT_PERFORMED) return false;
    const run = report.run || {};
    const skill = report.skill || {};
    return run.skip_reason === this.SKIP_NOTHING && skill.kind === "reference";
  },

  /* Что отчёт говорит о прогоне на данных.

     Отчёт бывает двух видов: со старым признаком «прогон подтверждён» и с
     состоянием прогона (данные есть, пусто, ошибка, не выполнялся). Читаем оба,
     а незнакомое состояние показываем как есть — молчать о нём хуже, чем
     назвать непонятным словом.

     Возвращает объект: state — состояние как в отчёте, gap — причина, по которой
     публикация закрыта (пустая строка, если открыта). */
  runVerdict(report) {
    const value = this.runStateValue(report || {});
    if (this.nothingToRun(report || {}, value)) return { state: value, gap: "" };
    if (value === true) return { state: "данные есть", gap: "" };
    if (value === false) {
      return { state: "не подтверждён",
               gap: "прогон на данных не подтверждён. Запросы скилла не выполнены или не прошли" };
    }
    if (typeof value === "string") {
      // Своё поле, а не унаследованное: состояние с именем вроде toString не
      // должно превратиться в чужое значение.
      const key = value.toLowerCase();
      const known = Object.prototype.hasOwnProperty.call(this.RUN_STATE_GAPS, key)
        ? this.RUN_STATE_GAPS[key] : undefined;
      if (known !== undefined) return { state: value, gap: known };
      return { state: value, gap: `прогон на данных не подтверждён. Отчёт называет его состояние «${value}»` };
    }
    return { state: "неизвестно",
             gap: "прогон на данных не подтверждён. Отчёт о нём ничего не говорит" };
  },

  /* Пояснение о прогоне из самого отчёта: сначала название состояния, потом
     подробность из раздела прогона. */
  runNote() {
    const report = this.state.report || {};
    const run = report.run || {};
    return String(report.run_state_note || run.note || "");
  },

  /* ---------- чему верить ----------
     Одно состояние на всех: и кнопка публикации, и первая строка отчёта, и
     точка в шапке разговора берут ответ отсюда. Пока источников было два, они
     расходились при первой же правке и говорили человеку разное. */
  trust() {
    if (!this.state.text.trim()) {
      return { key: "empty", label: "пусто", why: "скилла ещё нет", gap: "" };
    }
    /* Слово сервера, если оно есть: рубеж считает та же сторона, что и отказывает
       в публикации. Свой расчёт ниже остаётся на случай, когда сервер о рубеже
       промолчал — старая сборка или отчёт, поднятый из черновика. */
    if (typeof this.state.gap === "string") {
      return this.state.gap
        ? { key: "bad", label: "не готов", why: this.state.gap, gap: this.state.gap }
        : { key: "ok", label: "проверен на данных",
            why: "сервер подтвердил готовность к публикации", gap: "" };
    }
    if (!this.state.report) {
      return {
        key: "unchecked", label: "не проверен",
        why: "скилл ещё не проверен. Нажмите «Проверить»",
        gap: "скилл ещё не проверен. Нажмите «Проверить»",
      };
    }
    if (!this.state.reportFresh) {
      return {
        key: "stale", label: "отчёт устарел",
        why: "текст изменился после проверки. Нажмите «Проверить»",
        gap: "текст изменился после проверки. Нажмите «Проверить»",
      };
    }
    const gap = this.runVerdict(this.state.report).gap;
    return gap
      ? { key: "bad", label: "не готов", why: gap, gap }
      : { key: "ok", label: "проверен на данных", why: "запросы выполнились и вернули строки", gap: "" };
  },

  publishGap() { return this.trust().gap; },

  renderPublishGate() {
    const gap = this.publishGap();
    this.renderTrust();
    if (this.els.publishBtn) {
      this.els.publishBtn.classList.toggle("off", !!gap);
      this.els.publishBtn.title = gap ? "Публикация закрыта: " + gap : this.PUBLISH_HINT;
    }
    if (!this.els.gate) return;
    this.els.gate.textContent = gap ? "публикация закрыта: " + gap : "";
    /* Под наведением та же причина плюс пояснение прогона из самого отчёта:
       строка рядом с кнопкой короткая, а знать надо всё. */
    const note = this.runNote();
    this.els.gate.title = gap ? (note ? gap + "\n" + note : gap) : "";
  },

  async publish(force) {
    if (this.state.busy) {
      this.banner("warn", "Агенты сейчас правят черновик. Публикация — после их работы.");
      return;
    }
    const filename = (this.els.filename.value || "").trim();
    if (!filename) { this.banner("warn", "Укажите имя файла с расширением .yaml или .md."); return; }
    const gap = this.publishGap();
    if (gap && !force) {
      this.banner("warn", `Публикация закрыта: ${gap}. На стенд идёт то, что прогнано на данных: `
        + "его читают все агенты канала.");
      if (!confirm(`Публикация закрыта: ${gap}.\n\nОпубликовать под свою ответственность?`)) return;
      return this.publish(true);
    }
    try {
      const result = await this.post("/publish", {
        filename, text: this.state.text,
        path: this.state.path || null, draft_id: this.state.draftId || "", force: !!force,
      });
      this.state.path = result.path;
      this.state.dirty = false;
      this.els.main.classList.remove("dirty");
      this.banner("ok", `Опубликовано на стенде: ${result.path} (${result.action}). Скилл уже виден агентам.`);
      this.reloadList();
    } catch (err) {
      this.banner("err", "Публикация отклонена: " + err.message);
      this.switchMode("report");
    }
  },

  async download(bundle) {
    if (!this.state.draftId) {
      this.saveBlob(new Blob([this.state.text], { type: "text/plain;charset=utf-8" }),
        this.state.filename || "skill.yaml");
      return;
    }
    /* Качаем обычным запросом, а не window.open: открытая вкладка уходит без
       заголовка авторизации, и на ift это 401 вместо файла. */
    try {
      const path = "/drafts/" + this.state.draftId + "/download" + (bundle ? "?bundle=true" : "");
      const response = await fetch(this.API + path, { headers: this.headers(false) });
      if (!response.ok) throw new Error("HTTP " + response.status);
      this.saveBlob(await response.blob(), this.downloadName(response, bundle));
    } catch (err) {
      this.banner("err", "Скачать не вышло: " + err.message);
    }
  },

  /* Имя файла берём из заголовка ответа, иначе собираем из имени скилла.
     Кириллическое имя едет полем filename* (RFC 5987) — берём сначала его, в
     ASCII-поле рядом лежит урезанная версия. */
  downloadName(response, bundle) {
    const disposition = response.headers.get("Content-Disposition") || "";
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (encoded) {
      try { return decodeURIComponent(encoded[1].trim()); } catch (_) { /* испорченное поле */ }
    }
    const match = /filename="?([^";]+)"?/.exec(disposition);
    if (match) return match[1].trim();
    const name = this.state.filename || "skill.yaml";
    return bundle ? name.replace(/\.[^.]+$/, "") + ".zip" : name;
  },

  saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = this.el("a", { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async remove() {
    if (!this.guardBusy()) return;
    if (this.state.draftId && !this.state.path) {
      if (!confirm("Удалить черновик?")) return;
      await this.api("/drafts/" + this.state.draftId, { method: "DELETE" }).catch(() => {});
      this.state.draftId = null;
      this.setText("", "");
      this.reloadList();
      return;
    }
    if (!this.state.path) return;
    if (!confirm("Удалить скилл со стенда: " + this.state.path + "?")) return;
    try {
      await this.api("/skills?path=" + encodeURIComponent(this.state.path), { method: "DELETE" });
      this.state.path = null;
      this.setText("", "");
      this.banner("ok", "Скилл удалён со стенда.");
      this.reloadList();
    } catch (err) {
      this.banner("err", "Удалить не вышло: " + err.message);
    }
  },
};

window.SkillFactory = SkillFactory;
