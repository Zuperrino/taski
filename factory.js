/* ============ Фабрика скиллов: вкладка админки ============
   Самодостаточный модуль: свои помощники DOM и свой доступ к сети, никаких
   зависимостей от остального кода админки, кроме токена из общих настроек.
   Наружу отдаёт объект SkillFactory с методами init(container) и render().

   Экран: слева каталог скиллов стенда и черновики, справа один и тот же скилл в
   четырёх видах — форма, сырой текст, чат с агентами и отчёт проверки.
   Источник истины — текст: форма его разбирает и собирает обратно.

   Работа агентов идёт долго (минуты), поэтому всё, что можно показать по ходу,
   показывается: этап, размышления модели, обращения к инструментам, текст по
   мере генерации и смена модели при откате. Любую работу можно прервать. */
"use strict";

const SkillFactory = {
  API: "/skill-factory/api/v1",

  DOMAIN_TITLES: {
    employee: "Сотрудники", position: "Должности", recruitment: "Подбор",
    talent_radar: "Talent Radar", agentic: "Агентная разработка",
    education: "Обучение", anagent: "Аналитика", general: "Общее",
  },

  STAGE_ICONS: {
    interview: "❓", scout: "🔎", author: "✎", check: "✓", fix: "🔧",
  },

  state: {
    catalog: [], drafts: [], tab: "catalog", filter: "",
    mode: "form", kind: "recipe",
    path: null, draftId: null, filename: "", text: "", previous: "",
    fields: { recipe: null, reference: null },
    report: null,
    models: [], model: "", defaultModel: "", chain: [],
    stub: true, llmOk: true, clientKind: "",
    dirty: false, busy: false,
    stage: "", stageStartedAt: 0, aiFlow: false,
    formGeneration: 0,
  },
  els: {},
  _built: false,
  _abort: null,
  _timer: null,

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
    if (!response.ok) {
      const error = new Error((body && (body.detail || body.code)) || ("HTTP " + response.status));
      error.code = body && body.code;
      error.status = response.status;
      throw error;
    }
    return body;
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
    const banner = this.el("div", { class: "sf-banner" });

    const btn = (label, opts) => this.el("button", Object.assign({ text: label }, opts || {}));
    const toolbar = this.el("div", { class: "sf-toolbar" },
      this.el("span", { class: "sf-dot", title: "Есть несохранённые правки", text: "●" }), filename,
      btn("Проверить", { class: "sf-act", title: "Статика, прогон на данных и ревью критиков",
                         onclick: () => this.check(true) }),
      btn("Быстро", { class: "sf-act", title: "Только статика и прогон, без обращения к модели",
                      onclick: () => this.check(false) }),
      this.el("span", { class: "sf-spacer" }),
      modelSelect,
      btn("Опубликовать", { class: "primary sf-act", title: "Записать на стенд (Ctrl+S)", onclick: () => this.publish() }),
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
      filename, modelSelect, banner, toolbar, modes, progress,
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
    Object.assign(this.els, { log, input, send, stop });
    return this.el("div", { class: "sf-chat" }, log,
      this.el("div", { class: "sf-composer" }, input,
        this.el("div", { class: "sf-composer-btns" }, send, stop)));
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
      if (e.key === "Escape" && this.state.busy) { this.stop(); return; }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      if (!this.els.main || !this.els.main.closest(".ws-page.active")) return;
      e.preventDefault();
      if (this.state.dirty) this.publish();
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
      if (s.stub) {
        this.banner("warn", "Фабрика работает на заглушке модели. Проверка, прогон и публикация настоящие.");
      } else if (s.llm_ok === false) {
        this.banner("err", "Модель настроена, но шлюз не ответил на запрос списка моделей. "
          + "Генерация, скорее всего, работать не будет — проверьте доступность шлюза.");
      }
      if (s.catalog_source === "disk") {
        this.banner("warn", "Каталог моделей читается с диска: живой сервис не ответил. "
          + "Часть моделей может не совпадать с тем, что реально доступно.");
      }
    } catch (err) {
      this.banner("err", (err.status === 401 || err.status === 403)
        ? "Нет доступа к Фабрике. Укажите токен в настройках админки (шестерёнка в шапке)."
        : "Фабрика недоступна: " + err.message);
    }
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

  banner(kind, text) {
    this.els.banner.className = "sf-banner show " + kind;
    this.els.banner.textContent = text;
  },

  clearBanner() { this.els.banner.className = "sf-banner"; this.els.banner.textContent = ""; },

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

  /* ---------- открытие ---------- */
  async openCatalog(item) {
    if (!this.guardBusy() || !this.confirmDiscard()) return;
    try {
      const data = await this.api("/skills/raw?path=" + encodeURIComponent(item.path));
      Object.assign(this.state, {
        path: data.path, draftId: null, aiFlow: false,
        kind: data.suffix === ".md" ? "reference" : "recipe",
        filename: data.path.split("/").pop(), report: null,
      });
      this.setText(data.text, "");
      this.clearBanner();
      this.renderList();
      this.renderChatLog([]);
      this.switchMode("form");
    } catch (err) {
      this.banner("err", "Скилл не открылся: " + err.message);
    }
  },

  async openDraft(id) {
    if (!this.guardBusy() || !this.confirmDiscard()) return;
    try {
      const draft = await this.api("/drafts/" + id);
      Object.assign(this.state, {
        draftId: draft.id, path: draft.source_path || null, kind: draft.kind,
        filename: draft.filename || (draft.kind === "reference" ? "new_reference.md" : "new_recipe.yaml"),
        report: draft.report || null, aiFlow: false,
      });
      this.setText(draft.text || "", "");
      this.renderReport();
      this.renderChatLog(draft.chat || []);
      this.renderList();
      this.switchMode(draft.text ? "form" : "chat");
    } catch (err) {
      this.banner("err", "Черновик не открылся: " + err.message);
    }
  },

  async newDraft(kind) {
    if (!this.guardBusy() || !this.confirmDiscard()) return null;
    try {
      const draft = await this.post("/drafts", { kind, title: kind === "reference" ? "Новый приём" : "Новый рецепт" });
      await this.reloadList();
      this.switchList("drafts");
      await this.openDraft(draft.id);
      return draft;
    } catch (err) {
      this.banner("err", "Черновик не создался: " + err.message);
      return null;
    }
  },

  async newAiDraft() {
    const draft = await this.newDraft("recipe");
    if (!draft) return;
    /* Признак «идёт сборка с нуля» держим явно. По непустоте текста определять
       нельзя: новый черновик уже содержит заготовку, и первое же сообщение
       уходило бы как улучшение — роль интервьюера была недостижима. */
    this.state.aiFlow = true;
    this.switchMode("chat");
    this.els.log.innerHTML = "";
    this.pushMsg("sys", "Опишите задачу словами: какой вопрос должен закрывать скилл. "
      + "Агент допросит по недостающему и ничего не додумает.");
    this.els.input.focus();
  },

  /* ---------- текст и форма ---------- */
  setText(text, previous) {
    this.state.text = text;
    this.state.previous = previous || "";
    this.els.editor.value = text;
    this.els.filename.value = this.state.filename;
    this.state.dirty = false;
    this.els.main.classList.remove("dirty");
    this.renderForm();
    this.renderDiff();
  },

  markDirty() {
    this.state.dirty = true;
    this.els.main.classList.add("dirty");
    this.autosave();
  },

  autosave() {
    if (!this.state.draftId) return;
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
    if (!this.state.text.trim()) { this.banner("warn", "Нечего проверять: текст пуст."); return; }
    if (!this.state.draftId) {
      /* Проверка идёт потоком по черновику: у скилла каталога его нет, заводим. */
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
    host.append(this.el("div", { class: "sf-counts" },
      this.el("span", { class: "sf-count error", text: "ошибок: " + report.counts.error }),
      this.el("span", { class: "sf-count warning", text: "предупреждений: " + report.counts.warning }),
      this.el("span", { class: "sf-count advice", text: "советов: " + report.counts.advice }),
    ));

    const run = report.run || {};
    if (!run.skipped && (run.queries || []).length) {
      host.append(this.el("div", { class: "sf-group", text: "Прогон на данных" }));
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

    if (!report.issues.length) {
      host.append(this.el("div", { class: "sf-empty", text: "Замечаний нет." }));
      return;
    }
    host.append(this.el("div", { class: "sf-group", text: "Замечания" }));
    const titles = { error: "Ошибка", warning: "Предупреждение", advice: "Совет" };
    for (const issue of report.issues) {
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

  /* ---------- чат с агентами ---------- */
  renderChatLog(messages) {
    this.finishRole();
    this.els.log.innerHTML = "";
    for (const message of messages || []) {
      this.pushMsg(message.role === "user" ? "user" : "bot", message.content || "");
    }
  },

  pushMsg(kind, text) {
    const node = this.el("div", { class: "sf-msg " + kind, text });
    this.els.log.append(node);
    this.scroll();
    return node;
  },

  pushStep(text, extraClass) {
    const node = this.el("div", { class: "sf-step " + (extraClass || "") },
      this.el("span", { class: "mark", text: "▸" }), this.el("span", { text }));
    this.roleSteps().append(node);
    this.scroll();
    return node;
  },

  scroll() {
    /* Не дёргаем прокрутку, если человек сам отлистал вверх читать размышления. */
    const log = this.els.log;
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 120) log.scrollTop = log.scrollHeight;
  },

  /* ---------- карточка роли ----------
     Каждая роль (Интервьюер, Разведчик, Автор, три Критика) получает свою
     карточку: кто работает, на какой модели, сколько думает, чем занят сейчас и
     что в итоге сделал. Без этого в чате была видна только надпись «работаю». */
  ROLE_ICONS: {
    interviewer: "❓", scout: "🔎", author: "✎", fixer: "🔧", critic: "⚖",
  },

  roleCard(event) {
    const icon = this.ROLE_ICONS[event.role] || "•";
    const model = this.el("span", { class: "sf-role-model", text: event.model || "модель по умолчанию" });
    const timer = this.el("span", { class: "sf-role-time", text: "0 с" });
    const status = this.el("span", { class: "sf-role-status", text: "работает" });
    const head = this.el("div", { class: "sf-role-head" },
      this.el("span", { class: "sf-role-icon", text: icon }),
      this.el("span", { class: "sf-role-title", text: event.role_title || event.role }),
      model, this.el("span", { class: "sf-spacer" }), timer, status);
    const steps = this.el("div", { class: "sf-role-steps" });
    const card = this.el("div", { class: "sf-role working" }, head, steps);
    this.els.log.append(card);

    const started = Date.now();
    const tick = setInterval(() => {
      timer.textContent = Math.round((Date.now() - started) / 1000) + " с";
    }, 1000);

    this._role = { card, head, steps, model, timer, status, tick, started, think: null, delta: null };
    this.scroll();
    return this._role;
  },

  /* Куда писать шаг: в карточку текущей роли, иначе прямо в ленту. */
  roleSteps() { return this._role ? this._role.steps : this.els.log; },

  finishRole(event) {
    const role = this._role;
    if (!role) return;
    clearInterval(role.tick);
    role.card.classList.remove("working");
    role.card.classList.add("done");
    role.status.textContent = event && event.note ? event.note : "готово";
    if (event && event.model) role.model.textContent = event.model;
    this.closeLive();
    this._role = null;
  },

  /* Сворачиваемый блок размышлений внутри карточки роли. */
  reasoningBlock(model) {
    if (this._role && this._role.think) return this._role.think;
    const body = this.el("div", { class: "sf-think-body" });
    const caret = this.el("span", { class: "caret", text: "▸" });
    const count = this.el("span", { class: "sf-think-count", text: "" });
    const head = this.el("div", { class: "sf-think-head" }, caret,
      this.el("span", { class: "sf-think-label", text: "размышляет…" }), count);
    const box = this.el("div", { class: "sf-think" }, head, body);
    head.addEventListener("click", () => {
      const open = box.classList.toggle("open");
      caret.textContent = open ? "▾" : "▸";
    });
    this.roleSteps().append(box);
    const block = { model, box, body, head, count, chars: 0 };
    if (this._role) this._role.think = block; else this._orphanThink = block;
    this.scroll();
    return block;
  },

  currentThink() {
    return (this._role && this._role.think) || this._orphanThink || null;
  },

  /* Живой текст ответа: копится в одном пузыре, пока идёт генерация. */
  deltaBubble() {
    const holder = this._role || this;
    if (!holder.delta) {
      holder.delta = this.el("div", { class: "sf-msg bot live" });
      this.roleSteps().append(holder.delta);
    }
    return holder.delta;
  },

  closeLive() {
    const holder = this._role || this;
    if (holder.delta) { holder.delta.classList.remove("live"); holder.delta = null; }
    const think = this.currentThink();
    if (think) {
      think.head.classList.add("done");
      think.head.querySelector(".sf-think-label").textContent = "размышления";
      if (this._role) this._role.think = null;
      this._orphanThink = null;
    }
  },

  busy(on) {
    this.state.busy = on;
    this.els.send.disabled = on;
    this.els.input.disabled = on;
    this.els.stop.classList.toggle("show", on);
    /* Блокируем ВСЕ действия, а не одну кнопку: правка и публикация во время
       прогона приводили к записи не того текста. */
    for (const node of this.els.main.querySelectorAll(".sf-act")) node.disabled = on;
    if (on) {
      this.state.stageStartedAt = Date.now();
      this._timer = setInterval(() => this.renderProgress(), 1000);
    } else {
      clearInterval(this._timer);
      this._timer = null;
      this.state.stage = "";
      this.renderProgress();
      this.finishRole();
      this.closeLive();
    }
  },

  renderProgress(extra) {
    const p = this.els.progress;
    if (!this.state.busy) { p.className = "sf-progress"; p.innerHTML = ""; return; }
    p.className = "sf-progress show";
    const seconds = Math.round((Date.now() - this.state.stageStartedAt) / 1000);
    p.innerHTML = "";
    p.append(
      this.el("span", { class: "sf-spin" }),
      this.el("span", { class: "sf-stage-name", text: (this.STAGE_ICONS[this.state.stage] || "•") + " " + (this._stageTitle || "работаю") }),
      this.el("span", { class: "sf-elapsed", text: seconds + " с" }),
      extra ? this.el("span", { class: "sf-detail", text: extra }) : null,
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
    await this.stream({ mode, message, model: this.state.model });
  },

  async fixOne(issue) {
    if (!this.state.draftId) {
      this.banner("warn", "Исправление работает с черновиком. Заведите черновик из этого скилла.");
      return;
    }
    this.switchMode("chat");
    this.pushMsg("user", "Исправить: " + issue.message);
    await this.stream({ mode: "fix", issues: [issue], model: this.state.model });
  },

  stop() {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
      if (this._role) { this._role.status.textContent = "прервано"; this._role.card.classList.add("stopped"); }
      this.pushStep("остановлено по вашей команде", "stopped");
    }
  },

  async stream(payload) {
    this.busy(true);
    this.clearBanner();
    const controller = new AbortController();
    this._abort = controller;
    try {
      const response = await fetch(this.API + "/drafts/" + this.state.draftId + "/chat", {
        method: "POST", headers: this.headers(true), body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("HTTP " + response.status);
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
          const line = part.split(/\r?\n/).find((l) => l.startsWith("data:"));
          if (!line) continue;
          try { this.onEvent(JSON.parse(line.slice(5).trim())); } catch (_) { /* служебные кадры и пинги пропускаем */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") this.banner("err", "Поток прервался: " + err.message);
    } finally {
      this._abort = null;
      this.busy(false);
      this.reloadList();
    }
  },

  onEvent(event) {
    /* События приходят по конкретному черновику. Пользователь мог за это время
       открыть другой скилл — тогда правки применять нельзя. */
    const foreign = event.draft_id && this.state.draftId && event.draft_id !== this.state.draftId;

    switch (event.type) {
      case "start":
        this.pushStep(event.stub ? "работает заглушка модели" : "модель подключена");
        break;
      case "stage":
        this.finishRole();
        this.state.stage = event.name;
        this._stageTitle = event.title;
        this.state.stageStartedAt = Date.now();
        this.els.log.append(this.el("div", { class: "sf-stagebar" },
          this.el("span", { text: (this.STAGE_ICONS[event.name] || "•") + " " + event.title })));
        this.scroll();
        this.renderProgress();
        break;
      case "tick":
        this.renderProgress("идёт " + event.elapsed + " с");
        break;
      case "role_start":
        this.finishRole();
        this.roleCard(event);
        this._stageTitle = event.role_title;
        this.renderProgress(event.model);
        break;
      case "role_done":
        this.finishRole(event);
        break;
      case "reasoning": {
        const block = this.reasoningBlock(event.model);
        block.body.append(document.createTextNode(event.text));
        block.chars += event.text.length;
        block.count.textContent = block.chars + " симв.";
        if (this._role && event.role_title) this._role.status.textContent = "размышляет";
        this.scroll();
        break;
      }
      case "delta":
        if (this._role) this._role.status.textContent = "пишет ответ";
        this.deltaBubble().append(document.createTextNode(event.text));
        this.scroll();
        break;
      case "model_switch":
        this.closeLive();
        if (this._role) this._role.model.textContent = event.to;
        this.pushStep(`модель ${event.from} не ответила → перехожу на ${event.to}`, "switch");
        this.banner("warn", `Откат модели: ${event.from} → ${event.to}. `
          + `Контекст передан новой модели целиком.`);
        break;
      case "tool_start":
        if (this._role) this._role.status.textContent = event.name;
        this.pushStep(`${event.name}: работаю…`, "tool");
        this.renderProgress(event.name);
        break;
      case "tool":
        this.pushStep(`${event.name}: ${event.summary}`, "tool" + (event.ok ? " ok" : " bad"));
        break;
      case "message":
        this.closeLive();
        this.pushMsg("bot", event.text);
        break;
      case "question":
        this.closeLive();
        this.askQuestion(event);
        break;
      case "findings": {
        const f = event.findings || {};
        const m = f.model || {};
        this.pushStep(`выбрана модель ${m.schema || "?"}.${m.logic_model || "?"}, `
          + `колонок ${(f.columns || []).length}, уверенность ${f.confidence || "?"}`, "tool ok");
        break;
      }
      case "draft":
        if (foreign) break;
        this.closeLive();
        this.state.filename = event.filename || this.state.filename;
        this.setText(event.text, event.previous || this.state.text);
        this.pushStep("черновик обновлён" + (event.comment ? ": " + event.comment : ""), "ok");
        break;
      case "report":
        if (foreign) break;
        this.state.report = event.report;
        this.renderReport();
        this.pushStep(`проверка: ошибок ${event.report.counts.error}, `
          + `предупреждений ${event.report.counts.warning}, советов ${event.report.counts.advice}`,
          event.report.ok ? "ok" : "bad");
        break;
      case "done":
        this.closeLive();
        this.state.aiFlow = this.state.aiFlow && !event.ready;
        this.pushStep(event.ready ? "готово" : "нужна ваша правка", event.ready ? "ok" : "");
        break;
      case "error":
        this.closeLive();
        this.pushMsg("sys", "Сбой: " + event.detail);
        this.banner("err", event.detail);
        break;
    }
  },

  askQuestion(event) {
    const box = this.el("div", { class: "sf-ask" }, this.el("div", { text: event.text }));
    if ((event.options || []).length) {
      const opts = this.el("div", { class: "opts" });
      for (const option of event.options) {
        opts.append(this.el("button", {
          class: "small", text: option,
          onclick: () => { this.els.input.value = option; this.send(); },
        }));
      }
      box.append(opts);
    }
    this.els.log.append(box);
    this.scroll();
    this.els.input.focus();
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

  /* ---------- публикация ---------- */
  async publish() {
    const filename = (this.els.filename.value || "").trim();
    if (!filename) { this.banner("warn", "Укажите имя файла с расширением .yaml или .md."); return; }
    try {
      const result = await this.post("/publish", {
        filename, text: this.state.text,
        path: this.state.path || null, draft_id: this.state.draftId || "",
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

  download(bundle) {
    if (this.state.draftId) {
      window.open(this.API + "/drafts/" + this.state.draftId + "/download" + (bundle ? "?bundle=true" : ""), "_blank");
      return;
    }
    const blob = new Blob([this.state.text], { type: "text/plain;charset=utf-8" });
    const link = this.el("a", { href: URL.createObjectURL(blob), download: this.state.filename || "skill.yaml" });
    document.body.append(link);
    link.click();
    link.remove();
  },

  async remove() {
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
