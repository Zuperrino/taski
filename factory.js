/* ============ Фабрика скиллов: вкладка админки ============
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
  },

  state: {
    catalog: [], drafts: [], tab: "catalog", filter: "",
    mode: "form", kind: "recipe",
    path: null, draftId: null, filename: "", text: "", previous: "",
    fields: { recipe: null, reference: null },
    /* report — последний отчёт проверки, reportFresh — относится ли он к тому
       тексту, который сейчас в редакторе. Публикация смотрит на оба. */
    report: null, reportFresh: false,
    models: [], model: "", defaultModel: "", chain: [],
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

  /* Подсказка у кнопки публикации. Про Ctrl+S тут не сказано намеренно: клавиша
     сохраняет черновик, а запись в каталог стенда идёт только кнопкой. */
  PUBLISH_HINT: "Записать скилл в каталог стенда: его сразу видят все агенты канала",

  RAW_KEY: "heimdall.factory.raw",   // тумблер «показывать сырые ответы»
  THINK_LIMIT: 20000,                // сколько символов размышлений держим в DOM
  RAW_LIMIT: 200000,                 // потолок накопленного сырого ответа
  STASH_LIMIT: 400,                  // потолок придержанных событий одной роли
  RECENT_LIMIT: 8,                   // глубина памяти на повтор сообщения
  BANNER_MS: 9000,                   // сколько баннер держится на экране

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

  /* Запуск потока может закончиться обычным отказом: закрытая Фабрика, чужой или
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
    page.append(this.buildSide(), this.buildMain());
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
    Object.assign(this.els, { search, listTabs: tabs, list });
    return this.el("div", { class: "sf-side" },
      this.el("div", { class: "sf-side-head" }, search,
        this.el("button", { class: "iconbtn", title: "Обновить список", text: "⟳", onclick: () => this.reloadList() })),
      this.el("div", { class: "sf-newrow" },
        this.el("button", { class: "primary", text: "✨ Создать (AI)", title: "Описать задачу словами — агенты соберут скилл",
                            onclick: () => this.newAiDraft() })),
      this.el("div", { class: "sf-newrow" },
        this.el("button", { text: "+ Рецепт", onclick: () => this.newDraft("recipe") }),
        this.el("button", { text: "+ Приём", onclick: () => this.newDraft("reference") })),
      tabs, list,
    );
  },

  buildMain() {
    const filename = this.el("input", {
      class: "sf-filename", placeholder: "имя_скилла.yaml", spellcheck: "false",
      oninput: (e) => { this.state.filename = e.target.value; this.markDirty(); },
    });
    const modelSelect = this.el("select", {
      class: "sf-model", title: "Модель для агентов",
      onchange: (e) => { this.state.model = e.target.value; },
    });
    /* Тумблер разработчика: сырой ответ модели это служебный JSON, обычному
       пользователю он не нужен, а разработчику нужен целиком. */
    const rawCheck = this.el("input", {
      type: "checkbox", onchange: (e) => this.setShowRaw(e.target.checked),
    });
    const rawToggle = this.el("label", {
      class: "sf-rawtoggle", title: "Показывать в карточках ролей кнопку «сырой ответ»",
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
    const toolbar = this.el("div", { class: "sf-toolbar" },
      this.el("span", { class: "sf-dot", title: "Есть несохранённые правки", text: "●" }), filename,
      btn("Проверить", { class: "sf-act", title: "Статика, прогон на данных и ревью критиков",
                         onclick: () => this.check(true) }),
      btn("Быстро", { class: "sf-act", title: "Только статика и прогон, без обращения к модели",
                      onclick: () => this.check(false) }),
      this.el("span", { class: "sf-spacer" }),
      modelSelect, rawToggle,
      publishBtn, gate,
      btn("Скачать", { class: "sf-act", onclick: () => this.download(false) }),
      btn("Архив", { class: "sf-act", title: "Скилл, отчёт проверки и история чата", onclick: () => this.download(true) }),
      btn("Удалить", { class: "sf-del sf-act", onclick: () => this.remove() }),
    );

    const progress = this.el("div", { class: "sf-progress" });
    const modes = this.el("div", { class: "sf-modes" },
      ...[["form", "Форма"], ["text", "Текст"], ["chat", "Чат с агентами"], ["report", "Отчёт"], ["diff", "Дифф"]]
        .map(([id, label]) => this.el("button", {
          class: id === "form" ? "on" : "", "data-mode": id, text: label,
          onclick: () => this.switchMode(id),
        })));

    const form = this.el("div", { class: "sf-pane on" }, this.el("div", { class: "sf-form" }));
    const editor = this.el("textarea", {
      class: "sf-editor", spellcheck: "false",
      placeholder: "Выберите скилл слева или нажмите «Создать (AI)».",
      oninput: (e) => { this.state.text = e.target.value; this.markDirty(); },
    });
    const text = this.el("div", { class: "sf-pane" }, editor);
    const chat = this.el("div", { class: "sf-pane" }, this.buildChat());
    const report = this.el("div", { class: "sf-pane" }, this.el("div", { class: "sf-report" }));
    const diff = this.el("div", { class: "sf-pane" }, this.buildDiff());

    Object.assign(this.els, {
      filename, modelSelect, rawCheck, banner, toolbar, modes, progress, publishBtn, gate,
      form: form.firstChild, editor, report: report.firstChild,
      panes: { form, text, chat, report, diff },
      main: this.el("div", { class: "sf-main" }, toolbar, banner, progress, modes,
        this.el("div", { class: "sf-body" }, form, text, chat, report, diff)),
    });
    return this.els.main;
  },

  buildChat() {
    const log = this.el("div", { class: "sf-log" });
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
    return this.el("div", { class: "sf-chat" }, log,
      this.el("div", { class: "sf-composer" }, input,
        this.el("div", { class: "sf-composer-btns" }, flow, send, stop)));
  },

  buildDiff() {
    const body = this.el("div", { class: "sf-diff" });
    this.els.diff = body;
    return this.el("div", { class: "sf-chat" },
      this.el("div", { class: "sf-diffbar" },
        this.el("span", { text: "Правка агента: красным убрано, зелёным добавлено." }),
        this.el("span", { class: "sf-spacer" }),
        this.el("button", { text: "Откатить правку", onclick: () => this.revert() })),
      body);
  },

  bindShortcuts() {
    document.addEventListener("keydown", (e) => {
      /* Слушаем документ, поэтому сначала убеждаемся, что открыта именно вкладка
         Фабрики: Escape из любой другой вкладки Heimdall прерывал агентов. */
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

  /* ---------- состояние Фабрики ---------- */
  async loadState() {
    try {
      const s = await this.api("/state");
      Object.assign(this.state, {
        stub: s.stub, llmOk: s.llm_ok !== false, clientKind: s.client || "",
        models: s.models || [], defaultModel: s.default_model || "", chain: s.fallback_chain || [],
      });
      this.fillModels(s);
      const notes = [];
      if (s.auth_mode === "unavailable") {
        notes.push(["err", "Проверка прав на стенде не поднялась: " + (s.auth_reason || "причина неизвестна")
          + ". Ручки Фабрики отвечают отказом, пока рубеж не собран."]);
      } else if (s.auth_mode === "disabled") {
        notes.push(["info", "Стенд dev: ручки Фабрики работают без проверки токена. "
          + "Публикация сразу видна всем агентам канала."]);
      }
      if (s.stub) {
        notes.push(["warn", "Фабрика работает на заглушке модели. Проверка, прогон и публикация настоящие."]);
      } else if (s.llm_probe === "timeout") {
        notes.push(["warn", "Шлюз модели не ответил за отведённое время: список моделей взят из настроек. "
          + "Работает ли генерация — сейчас неизвестно."]);
      } else if (s.llm_ok === false) {
        notes.push(["err", "Модель настроена, но шлюз не ответил на запрос списка моделей. "
          + "Генерация, скорее всего, работать не будет — проверьте доступность шлюза."]);
      }
      if (!s.catalog_source) {
        notes.push(["warn", "Источник каталога моделей неизвестен: сервис не ответил за отведённое время. "
          + "Агенты возьмут то, что окажется доступно, — это видно будет в ленте."]);
      } else if (s.catalog_source === "disk") {
        notes.push(["warn", "Каталог моделей читается с диска: живой сервис не ответил. "
          + "Часть моделей может не совпадать с тем, что реально доступно."]);
      }
      this.showNotes(notes);
    } catch (err) {
      // Закрытая или недоступная Фабрика — это состояние стенда, а не разовое
      // сообщение: такой баннер висит, пока вкладку не перезагрузят.
      if (err.status === 503 || err.code === "auth-unavailable") {
        this.banner("err", "Фабрика закрыта: " + err.message, true);
      } else {
        this.banner("err", (err.status === 401 || err.status === 403)
          ? "Нет доступа к Фабрике. Укажите токен в настройках админки (шестерёнка в шапке)."
          : "Фабрика недоступна: " + err.message, true);
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

  /* То же самое сообщение уже стоит в ленте чата: баннером его повторяем, только
     когда лента не на экране. Иначе один сбой виден дважды. */
  bannerAside(kind, text) {
    if (this.state.mode !== "chat") this.banner(kind, text);
  },

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
        aiFlow: draft.flow === "create",
      });
      this.setText(draft.text || "", "");
      this.renderPublishGate();
      this.renderReport();
      this.renderChatLog(draft.chat || []);
      this.syncFlow();
      this.renderList();
      this.switchMode(draft.text ? "form" : "chat");
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
    this.switchMode("chat");
    this.resetChat();
    this.pushMsg("sys", "Опишите задачу словами: какой вопрос должен закрывать скилл. "
      + "Агент допросит по недостающему и ничего не додумает.");
    this.focusInput();
  },

  /* ---------- текст и форма ---------- */
  setText(text, previous) {
    this.state.text = text;
    this.state.previous = previous || "";
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
    /* Правка делает отчёт прошлым: он относится к прежнему тексту. */
    this.state.reportFresh = false;
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
    try {
      await this.put("/drafts/" + this.state.draftId,
                     { text: this.state.text, filename: this.state.filename });
      this.state.dirty = false;
      this.els.main.classList.remove("dirty");
      this.banner("ok", "Черновик сохранён.");
      return true;
    } catch (err) {
      this.banner("err", "Черновик не сохранён: " + err.message);
      return false;
    }
  },

  autosave() {
    if (!this.state.draftId) return;
    /* Пока агенты работают, автосохранение молчит: оно отправляло на сервер
       текст из редактора и затирало то, что в этот же момент писал агент.
       Отложенное сохранение выполняется, когда прогон закончился. */
    if (this.state.busy) { this._saveWanted = true; return; }
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.put("/drafts/" + this.state.draftId, { text: this.state.text, filename: this.state.filename })
        .catch(() => {});
    }, 700);
  },

  confirmDiscard() {
    return !this.state.dirty || confirm("Есть несохранённые правки. Открыть другой скилл и потерять их?");
  },

  guardBusy() {
    if (!this.state.busy) return true;
    return confirm("Агенты сейчас работают. Прервать и переключиться?") ? (this.stop(), true) : false;
  },

  switchMode(mode) {
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
    return this.el("div", { class: "sf-field" }, label, help, control);
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
          const input = this.el("input", {
            placeholder: key,
            oninput: (e) => {
              row[key] = key === "query" ? SkillFactory.tryJson(e.target.value) : e.target.value;
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

  /* ---------- проверка ---------- */
  async check(withReview) {
    /* Второй поток поверх работающего ломал отмену и таймер: у обоих один
       this._abort. Кнопки во время прогона гасит класс на корне, но проверка
       нужна и здесь — кнопку можно нажать с клавиатуры. */
    if (this.state.busy) return;
    if (!this.state.text.trim()) { this.banner("warn", "Нечего проверять: текст пуст."); return; }
    /* Проверка идёт потоком по черновику: у скилла каталога его нет. Если по
       этому же файлу черновик уже заводили, берём его — иначе каждое открытие
       скилла плодило бы ещё один черновик «Проверка». */
    if (!this.state.draftId && this.state.path) {
      const known = (this.state.drafts || []).find((d) => d.source_path === this.state.path);
      if (known) this.state.draftId = known.id;
    }
    if (!this.state.draftId) {
      const draft = await this.post("/drafts", {
        kind: this.state.kind, title: this.state.filename || "Проверка",
        source_path: this.state.path || "", text: this.state.text,
      }).catch((err) => { this.banner("err", "Не удалось начать проверку: " + err.message); return null; });
      if (!draft) return;
      this.state.draftId = draft.id;
      await this.reloadList();
    } else {
      await this.put("/drafts/" + this.state.draftId, { text: this.state.text }).catch(() => {});
    }
    this.switchMode("chat");
    this.pushStep(withReview ? "Проверка: статика, прогон и ревью критиков" : "Быстрая проверка: статика и прогон");
    await this.stream({ mode: "check", model: this.state.model, with_review: !!withReview });
  },

  renderReport() {
    const host = this.els.report;
    host.innerHTML = "";
    const report = this.state.report;
    if (!report) {
      host.append(this.el("div", { class: "sf-empty", text: "Отчёта ещё нет. Нажмите «Проверить»." }));
      return;
    }
    /* Счётчики читаем через запасное значение: отчёт приходит и от прошлых
       версий Фабрики, и из черновика, который лежал на диске, а недостающее поле
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

    const issues = report.issues || [];
    if (!issues.length) {
      host.append(this.el("div", { class: "sf-empty", text: "Замечаний нет." }));
      return;
    }
    host.append(this.el("div", { class: "sf-group", text: "Замечания" }));
    const titles = { error: "Ошибка", warning: "Предупреждение", advice: "Совет" };
    for (const issue of issues) {
      host.append(this.el("div", { class: "sf-issue " + issue.severity },
        this.el("div", { class: "head" },
          this.el("b", { text: titles[issue.severity] || issue.severity }),
          this.el("span", { class: "code", text: issue.code }),
          issue.source ? this.el("span", { class: "src", text: issue.source }) : null),
        this.el("div", { text: issue.message }),
        issue.fix_hint ? this.el("div", { class: "hint", text: issue.fix_hint }) : null,
        this.el("div", { class: "act" },
          this.el("button", { class: "small sf-act", text: "Исправить это", onclick: () => this.fixOne(issue) })),
      ));
    }
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
    this._recent.length = 0;
    this.els.log.innerHTML = "";
  },

  renderChatLog(messages) {
    this.resetChat();
    for (const message of messages || []) {
      this.pushMsg(message.role === "user" ? "user" : "bot", message.content || "");
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
     (например, живой каталог моделей недоступен). */
  pushNotice(event) {
    const warn = event.level !== "info";
    const text = String(event.text || "");
    this.els.log.append(this.el("div", {
      class: "sf-notice " + (warn ? "warn" : "info"), title: event.code || "",
    },
      this.el("span", { class: "sf-notice-icon", text: warn ? "⚠" : "ℹ" }),
      this.el("span", { text })));
    this.scroll();
    this.bannerAside(warn ? "warn" : "info", text);
  },

  scroll() {
    /* Не дёргаем прокрутку, если человек сам отлистал вверх читать размышления. */
    const log = this.els.log;
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 120) log.scrollTop = log.scrollHeight;
  },

  /* ---------- карточка роли ----------
     Каждый экземпляр роли (Интервьюер, Разведчик, Автор, три Критика) получает
     свою карточку по role_key: кто работает, на какой модели, сколько думает,
     чем занят сейчас и что в итоге сделал. Ключ обязателен, потому что критики
     идут параллельно и их события перемешаны в одном потоке. */
  ROLE_ICONS: {
    interviewer: "❓", scout: "🔎", author: "✎", fixer: "🔧", critic: "⚖",
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

    const icon = this.ROLE_ICONS[event.role] || "•";
    const model = this.el("span", { class: "sf-role-model", text: event.model || "модель по умолчанию" });
    const timer = this.el("span", { class: "sf-role-time", text: "0 с" });
    const status = this.el("span", { class: "sf-role-status", text: "работает" });
    const live = this.el("span", { class: "sf-role-live" });
    const head = this.el("div", { class: "sf-role-head" },
      this.el("span", { class: "sf-role-icon", text: icon }),
      this.el("span", { class: "sf-role-title", text: event.role_title || event.role }),
      model, live, this.el("span", { class: "sf-spacer" }), timer, status);
    const steps = this.el("div", { class: "sf-role-steps" });
    const foot = this.el("div", { class: "sf-role-foot" });
    const box = this.el("div", { class: "sf-role working" }, head, steps, foot);
    this.els.log.append(box);

    const card = {
      key, box, head, steps, foot, model, timer, status, live,
      started: Date.now(), think: null, raw: "", rawChars: 0, raf: 0, tick: 0,
    };
    card.tick = setInterval(() => {
      card.timer.textContent = Math.round((Date.now() - card.started) / 1000) + " с";
      if (card.think && !card.think.done) card.think.count.textContent = this.thinkNote(card.think);
    }, 1000);
    this._roles.set(key, card);
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
    clearInterval(card.tick);
    if (card.raf) { cancelAnimationFrame(card.raf); card.raf = 0; }
    if (card.think) this.paintThink(card.think, true);
    card.live.textContent = "";
    card.live.classList.remove("on");
    card.box.classList.remove("working");
    if (this._stopped) {
      card.box.classList.add("stopped");
      card.status.textContent = "прервано";
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
    const box = this.el("div", { class: "sf-think" }, head, body);
    head.addEventListener("click", () => {
      const open = box.classList.toggle("open");
      caret.textContent = open ? "▾" : "▸";
      if (open) body.scrollTop = body.scrollHeight;
    });
    card.steps.append(box);
    card.think = {
      box, head, body, node, label, count,
      text: "", chars: 0, started: Date.now(), stopped: 0, done: false,
    };
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
      think.label.textContent = "размышления";
    }
    const shown = (think.chars > think.text.length ? "…\n" : "") + think.text;
    if (think.node.nodeValue !== shown) {
      const atBottom = think.body.scrollHeight - think.body.scrollTop - think.body.clientHeight < 40;
      think.node.nodeValue = shown;
      if (atBottom) think.body.scrollTop = think.body.scrollHeight;
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
      this.el("span", { class: "sf-stage-name", text: (this.STAGE_ICONS[this.state.stage] || "•") + " " + (this._stageTitle || "работаю") }),
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
    const mode = this.state.aiFlow ? "create" : "improve";
    /* Открыта развилка «взять готовое или писать новое», а человек ответил
       словами вместо кнопки: считаем это выбором в пользу нового скилла,
       иначе следующий ход снова упрётся в тот же вопрос. */
    const payload = { mode, message, model: this.state.model };
    if (this._reusePending) { payload.reuse = "new"; this.closeReuse(); }
    await this.stream(payload);
  },

  async fixOne(issue) {
    if (this.state.busy) return;
    if (!this.state.draftId) {
      this.banner("warn", "Исправление работает с черновиком. Заведите черновик из этого скилла.");
      return;
    }
    this.switchMode("chat");
    this.pushMsg("user", "Исправить: " + issue.message);
    await this.stream({ mode: "fix", issues: [issue], model: this.state.model });
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
       сейчас у черновика на сервере. */
    this._textTouched = false;
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
        break;
      case "stage":
        this.state.stage = event.name;
        this._stageTitle = event.title;
        this.state.stageStartedAt = Date.now();
        this.els.log.append(this.el("div", { class: "sf-stagebar" },
          this.el("span", { text: (this.STAGE_ICONS[event.name] || "•") + " " + event.title })));
        this.scroll();
        // Новый этап — прежняя подробность к нему уже не относится.
        this.renderProgress("");
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
        this.pushNotice(event);
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
      case "findings": {
        const f = event.findings || {};
        const m = f.model || {};
        const related = (f.related || []).length;
        this.pushStep(`выбрана модель ${m.schema || "?"}.${m.logic_model || "?"}, `
          + `колонок ${(f.columns || []).length}, уверенность ${f.confidence || "?"}`
          + (related ? `, связей: ${related}` : ""), "tool ok");
        break;
      }
      case "draft":
        this.state.filename = event.filename || this.state.filename;
        this.setText(event.text, event.previous || this.state.text);
        /* Текст переписал агент: прошлый отчёт к нему уже не относится. */
        this.state.reportFresh = false;
        this.renderPublishGate();
        this.pushStep("черновик обновлён" + (event.comment ? ": " + event.comment : ""), "ok");
        break;
      case "report":
        this.state.report = event.report;
        /* Отчёт получен по тексту черновика на сервере. Если человек правил
           редактор, пока шла проверка, отчёт относится к другой версии —
           публикацию такой отчёт не открывает. */
        this.state.reportFresh = !this._textTouched;
        this.renderPublishGate();
        this.renderReport();
        this.pushStep(`проверка: ошибок ${event.report.counts.error}, `
          + `предупреждений ${event.report.counts.warning}, советов ${event.report.counts.advice}`,
          event.report.ok ? "ok" : "bad");
        break;
      case "done":
        /* Сборка с нуля дошла до готового скилла: дальше черновик дорабатывают.
           Признак уезжает в сам черновик, чтобы пережить переоткрытие вкладки. */
        if (this.state.aiFlow && event.ready) this.setFlow(false);
        this.pushStep(event.ready ? "готово" : "нужна ваша правка", event.ready ? "ok" : "");
        break;
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
    this.switchMode("chat");
    this.pushStep(`взят на доработку скилл ${skill.name}`, "ok");
    this.pushMsg("sys", "Опишите, что в нём поменять — дальше работаем с этим скиллом.");
    this.focusInput();
  },

  /* ---------- дифф ---------- */
  renderDiff() {
    const host = this.els.diff;
    if (!host) return;
    host.innerHTML = "";
    if (!this.state.previous) {
      host.append(this.el("div", { class: "sf-empty", text: "Правок агента пока не было." }));
      return;
    }
    const before = this.state.previous.split("\n");
    const after = this.state.text.split("\n");
    const removed = new Set(before.filter((l) => !after.includes(l)));
    const added = new Set(after.filter((l) => !before.includes(l)));
    for (const line of before) {
      if (removed.has(line)) host.append(this.el("span", { class: "ln del", text: "- " + line }));
    }
    for (const line of after) {
      host.append(this.el("span", { class: "ln" + (added.has(line) ? " add" : ""), text: (added.has(line) ? "+ " : "  ") + line }));
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

  publishGap() {
    if (!this.state.text.trim()) return "";
    if (!this.state.report) return "скилл ещё не проверен. Нажмите «Проверить»";
    if (!this.state.reportFresh) return "текст изменился после проверки. Нажмите «Проверить»";
    return this.runVerdict(this.state.report).gap;
  },

  renderPublishGate() {
    const gap = this.publishGap();
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
