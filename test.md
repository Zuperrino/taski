/* ============ Фабрика скиллов: вкладка админки ============
   Все правила под #page-skills с префиксом sf-, поэтому вкладка не задевает
   остальной интерфейс. Цвета берутся из переменных темы Heimdall, светлая и
   тёмная работают без отдельных правил.
   Файл отдаётся ручкой /skill-factory/api/v1/ui/factory.css и живёт в пакете
   Фабрики, чтобы её можно было унести вместе с интерфейсом. */

#page-skills .sf-layout { flex: 1; display: flex; min-width: 0; min-height: 0; }

/* ---------- левая колонка: каталог и черновики ---------- */
#page-skills .sf-side {
  width: 290px; flex: none; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--border); background: var(--bg-panel);
}
#page-skills .sf-side-head { display: flex; gap: 6px; padding: 8px 8px 6px; }
#page-skills .sf-side-head input {
  flex: 1; min-width: 0; padding: 5px 8px; border: 1px solid var(--border-strong);
  border-radius: var(--radius); background: var(--bg); color: var(--text); font-size: 12px;
}
#page-skills .sf-newrow { display: flex; gap: 6px; padding: 0 8px 8px; }
#page-skills .sf-newrow button { flex: 1; justify-content: center; }
#page-skills .sf-seg {
  display: flex; gap: 4px; padding: 0 8px 8px; border-bottom: 1px solid var(--border);
}
#page-skills .sf-seg button {
  flex: 1; justify-content: center; font-size: 11.5px; padding: 4px 6px;
}
#page-skills .sf-seg button.on {
  color: var(--accent-text); border-color: var(--accent); background: var(--accent-bg);
}
#page-skills .sf-list { flex: 1; overflow: auto; padding: 4px 0 12px; }
#page-skills .sf-group {
  padding: 8px 10px 4px; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
  color: var(--faint);
}
#page-skills .sf-item {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer;
  border-left: 2px solid transparent; font-size: 12.5px;
}
#page-skills .sf-item:hover { background: var(--bg-hover); }
#page-skills .sf-item.on { background: var(--bg-active); border-left-color: var(--accent); }
#page-skills .sf-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#page-skills .sf-item.broken .sf-item-title { color: var(--red); }
#page-skills .sf-badge { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 5px; flex: none; }
#page-skills .sf-badge.recipe { color: var(--green); background: var(--green-bg); }
#page-skills .sf-badge.reference { color: var(--blue); background: rgba(47, 111, 235, 0.13); }
#page-skills .sf-badge.err { color: var(--red); background: var(--red-bg); }
#page-skills .sf-badge.draft { color: var(--purple); background: rgba(124, 58, 237, 0.13); }

/* ---------- правая часть ---------- */
#page-skills .sf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#page-skills .sf-toolbar {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px; flex-wrap: wrap;
  border-bottom: 1px solid var(--border); background: var(--bg-elev);
}
#page-skills .sf-toolbar .sf-spacer { flex: 1; }
#page-skills .sf-filename {
  min-width: 210px; padding: 4px 8px; border: 1px solid var(--border-strong);
  border-radius: var(--radius); background: var(--bg); color: var(--text);
  font-family: var(--mono); font-size: 12px;
}
#page-skills .sf-dot { color: var(--accent-text); font-weight: 700; width: 8px; opacity: 0; }
#page-skills .sf-main.dirty .sf-dot { opacity: 1; }
#page-skills .sf-del { color: var(--red); border-color: var(--red); background: transparent; }
#page-skills .sf-del:hover:not(:disabled) { color: #fff; background: var(--red); border-color: var(--red); }

#page-skills .sf-modes { display: flex; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
#page-skills .sf-modes button { font-size: 12px; }
#page-skills .sf-modes button.on {
  color: var(--accent-text); border-color: var(--accent); background: var(--accent-bg);
}

#page-skills .sf-body { flex: 1; display: flex; min-height: 0; min-width: 0; }
#page-skills .sf-pane { flex: 1; display: none; min-width: 0; min-height: 0; overflow: auto; }
#page-skills .sf-pane.on { display: flex; flex-direction: column; }

#page-skills .sf-banner {
  display: none; padding: 6px 12px; font-size: 12px; gap: 8px; align-items: center;
  border-bottom: 1px solid var(--border);
}
#page-skills .sf-banner.show { display: flex; }
#page-skills .sf-banner.warn { background: var(--yellow-bg); color: var(--yellow); }
#page-skills .sf-banner.err { background: var(--red-bg); color: var(--red); }
#page-skills .sf-banner.ok { background: var(--green-bg); color: var(--green); }
#page-skills .sf-banner code {
  background: var(--bg-hover); padding: 1px 5px; border-radius: 4px; font-family: var(--mono);
}

/* ---------- сырой текст ---------- */
#page-skills .sf-editor {
  flex: 1; width: 100%; border: 0; resize: none; padding: 12px 14px; outline: none;
  font-family: var(--mono); font-size: 12.5px; line-height: 1.55; tab-size: 2;
  background: var(--bg); color: var(--text);
}
#page-skills .sf-editor::placeholder { color: var(--faint); }

/* ---------- форма ---------- */
#page-skills .sf-form { padding: 12px 14px 40px; display: flex; flex-direction: column; gap: 14px; }
#page-skills .sf-field { display: flex; flex-direction: column; gap: 4px; }
#page-skills .sf-field > label { font-size: 12px; font-weight: 600; }
#page-skills .sf-field .sf-help { font-size: 11.5px; color: var(--muted); }
#page-skills .sf-field .req { color: var(--red); margin-left: 3px; }
#page-skills .sf-field input, #page-skills .sf-field textarea, #page-skills .sf-field select {
  padding: 5px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius);
  background: var(--bg); color: var(--text); font-size: 12.5px; font-family: var(--sans);
}
#page-skills .sf-field textarea { min-height: 64px; resize: vertical; font-family: var(--mono); font-size: 12px; }
#page-skills .sf-field textarea.json { min-height: 130px; }
#page-skills .sf-rows { display: flex; flex-direction: column; gap: 5px; }
#page-skills .sf-row { display: flex; gap: 5px; align-items: center; }
#page-skills .sf-row input { flex: 1; min-width: 0; }
#page-skills .sf-row button { flex: none; }

/* ---------- чат ---------- */
#page-skills .sf-chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
#page-skills .sf-log { flex: 1; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
#page-skills .sf-msg { max-width: 90%; padding: 7px 10px; border-radius: var(--radius); font-size: 12.5px; line-height: 1.5; }
#page-skills .sf-msg.user { align-self: flex-end; background: var(--accent-bg); color: var(--accent-text); }
#page-skills .sf-msg.bot { align-self: flex-start; background: var(--bg-hover); white-space: pre-wrap; }
#page-skills .sf-msg.sys { align-self: center; color: var(--muted); font-size: 11.5px; background: transparent; }
#page-skills .sf-step {
  align-self: flex-start; display: flex; align-items: center; gap: 7px; font-size: 11.5px;
  color: var(--muted); font-family: var(--mono);
}
#page-skills .sf-step .mark { color: var(--accent-text); }
#page-skills .sf-step.tool { padding-left: 16px; }
#page-skills .sf-step.tool.bad { color: var(--red); }
#page-skills .sf-ask {
  align-self: flex-start; max-width: 90%; padding: 8px 10px; border-radius: var(--radius);
  border: 1px solid var(--accent); background: var(--accent-bg); font-size: 12.5px;
}
#page-skills .sf-ask .opts { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
#page-skills .sf-composer { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--border); }
#page-skills .sf-composer textarea {
  flex: 1; min-height: 38px; max-height: 140px; resize: vertical; padding: 7px 9px;
  border: 1px solid var(--border-strong); border-radius: var(--radius);
  background: var(--bg); color: var(--text); font-size: 12.5px; font-family: var(--sans);
}

/* ---------- отчёт проверки ---------- */
#page-skills .sf-report { padding: 12px 14px 40px; display: flex; flex-direction: column; gap: 8px; }
#page-skills .sf-counts { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; }
#page-skills .sf-count { padding: 3px 9px; border-radius: 999px; font-weight: 600; }
#page-skills .sf-count.error { color: var(--red); background: var(--red-bg); }
#page-skills .sf-count.warning { color: var(--yellow); background: var(--yellow-bg); }
#page-skills .sf-count.advice { color: var(--muted); background: var(--bg-hover); }
#page-skills .sf-issue {
  border: 1px solid var(--border); border-left-width: 3px; border-radius: var(--radius);
  padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; background: var(--bg-panel);
}
#page-skills .sf-issue.error { border-left-color: var(--red); }
#page-skills .sf-issue.warning { border-left-color: var(--yellow); }
#page-skills .sf-issue.advice { border-left-color: var(--border-strong); }
#page-skills .sf-issue .head { display: flex; align-items: center; gap: 7px; font-size: 12.5px; }
#page-skills .sf-issue .head .code { font-family: var(--mono); font-size: 11px; color: var(--muted); }
#page-skills .sf-issue .head .src { margin-left: auto; font-size: 11px; color: var(--faint); }
#page-skills .sf-issue .hint { font-size: 11.5px; color: var(--muted); }
#page-skills .sf-issue .act { display: flex; gap: 6px; }
#page-skills .sf-runs { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
#page-skills .sf-run { display: flex; gap: 8px; align-items: center; font-family: var(--mono); font-size: 11.5px; }
#page-skills .sf-run .ok { color: var(--green); }
#page-skills .sf-run .bad { color: var(--red); }
#page-skills .sf-empty { padding: 22px 14px; color: var(--muted); font-size: 12.5px; }

/* ---------- дифф ---------- */
#page-skills .sf-diff { flex: 1; overflow: auto; padding: 10px 14px 40px; font-family: var(--mono); font-size: 12px; }
#page-skills .sf-diff .ln { display: block; padding: 0 6px; white-space: pre-wrap; border-radius: 3px; }
#page-skills .sf-diff .ln.add { background: var(--green-bg); color: var(--green); }
#page-skills .sf-diff .ln.del { background: var(--red-bg); color: var(--red); }
#page-skills .sf-diffbar { display: flex; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border); align-items: center; }




js


/* ============ Фабрика скиллов: вкладка админки ============
   Самодостаточный модуль: свои помощники DOM и свой доступ к сети, никаких
   зависимостей от остального кода админки. Наружу отдаёт объект SkillFactory с
   методами init(container) и render(); интеграция с админкой сводится к их вызову.

   Экран устроен так: слева каталог скиллов стенда и черновики, справа четыре
   режима одного и того же скилла — форма, сырой текст, чат с агентами и отчёт
   проверки. Источник истины — текст: форма его разбирает и собирает обратно. */
"use strict";

const SkillFactory = {
  API: "/skill-factory/api/v1",

  DOMAIN_TITLES: {
    employee: "Сотрудники", position: "Должности", recruitment: "Подбор",
    talent_radar: "Talent Radar", agentic: "Агентная разработка",
    education: "Обучение", anagent: "Аналитика", general: "Общее",
  },

  state: {
    catalog: [],       // скиллы стенда
    drafts: [],        // черновики Фабрики
    tab: "catalog",    // что показано в списке слева
    filter: "",
    mode: "form",      // форма | текст | чат | отчёт | дифф
    kind: "recipe",
    path: null,        // открытый файл каталога
    draftId: null,     // открытый черновик
    filename: "",
    text: "",
    previous: "",      // текст до последней правки агентом, для диффа
    fields: { recipe: null, reference: null },
    report: null,
    models: [],
    model: "",
    stub: true,
    dirty: false,
    busy: false,
  },
  els: {},
  _built: false,

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

  async api(path, options) {
    const response = await fetch(this.API + path, Object.assign({ headers: {} }, options || {}));
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = { detail: raw }; }
    if (!response.ok) {
      const error = new Error((body && (body.detail || body.code)) || ("HTTP " + response.status));
      error.code = body && body.code;
      throw error;
    }
    return body;
  },

  post(path, payload) {
    return this.api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  },

  put(path, payload) {
    return this.api(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
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
    this.els.search = search;
    this.els.listTabs = tabs;
    this.els.list = list;
    return this.el("div", { class: "sf-side" },
      this.el("div", { class: "sf-side-head" }, search,
        this.el("button", { class: "iconbtn", title: "Обновить", text: "⟳", onclick: () => this.reloadList() })),
      this.el("div", { class: "sf-newrow" },
        this.el("button", { text: "+ Рецепт", onclick: () => this.newDraft("recipe") }),
        this.el("button", { text: "+ Приём", onclick: () => this.newDraft("reference") }),
        this.el("button", { class: "primary", text: "Создать (AI)", onclick: () => this.newAiDraft() })),
      tabs, list,
    );
  },

  buildMain() {
    const filename = this.el("input", {
      class: "sf-filename", placeholder: "имя_скилла.yaml", spellcheck: "false",
      oninput: (e) => { this.state.filename = e.target.value; this.markDirty(); },
    });
    const modelSelect = this.el("select", {
      title: "Модель для агентов",
      onchange: (e) => { this.state.model = e.target.value; },
    });
    const banner = this.el("div", { class: "sf-banner" });

    const toolbar = this.el("div", { class: "sf-toolbar" },
      this.el("span", { class: "sf-dot", text: "●" }), filename,
      this.el("button", { text: "Проверить", onclick: () => this.check(true) }),
      this.el("button", { text: "Быстрая проверка", title: "Без ревью языковой моделью", onclick: () => this.check(false) }),
      this.el("span", { class: "sf-spacer" }),
      modelSelect,
      this.el("button", { class: "primary", text: "Опубликовать", onclick: () => this.publish() }),
      this.el("button", { text: "Скачать", onclick: () => this.download(false) }),
      this.el("button", { text: "Скачать с отчётом", onclick: () => this.download(true) }),
      this.el("button", { class: "sf-del", text: "Удалить", onclick: () => this.remove() }),
    );

    const modes = this.el("div", { class: "sf-modes" },
      ...[["form", "Форма"], ["text", "Текст"], ["chat", "Чат с агентами"], ["report", "Отчёт"], ["diff", "Дифф"]]
        .map(([id, label]) => this.el("button", {
          class: id === "form" ? "on" : "", "data-mode": id, text: label,
          onclick: () => this.switchMode(id),
        })));

    const form = this.el("div", { class: "sf-pane on" }, this.el("div", { class: "sf-form" }));
    const editor = this.el("textarea", {
      class: "sf-editor", spellcheck: "false",
      placeholder: "Выберите скилл слева или создайте новый.",
      oninput: (e) => { this.state.text = e.target.value; this.markDirty(); },
    });
    const text = this.el("div", { class: "sf-pane" }, editor);
    const chat = this.el("div", { class: "sf-pane" }, this.buildChat());
    const report = this.el("div", { class: "sf-pane" }, this.el("div", { class: "sf-report" }));
    const diff = this.el("div", { class: "sf-pane" }, this.buildDiff());

    Object.assign(this.els, {
      filename, modelSelect, banner, toolbar, modes,
      form: form.firstChild, editor, report: report.firstChild,
      panes: { form, text, chat, report, diff },
      main: this.el("div", { class: "sf-main" }, toolbar, banner, modes,
        this.el("div", { class: "sf-body" }, form, text, chat, report, diff)),
    });
    return this.els.main;
  },

  buildChat() {
    const log = this.el("div", { class: "sf-log" });
    const input = this.el("textarea", {
      placeholder: "Опишите задачу или скажите, что улучшить. Enter — отправить, Shift+Enter — перенос строки.",
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); }
      },
    });
    const send = this.el("button", { class: "primary", text: "Отправить", onclick: () => this.send() });
    this.els.log = log;
    this.els.input = input;
    this.els.send = send;
    return this.el("div", { class: "sf-chat" }, log, this.el("div", { class: "sf-composer" }, input, send));
  },

  buildDiff() {
    const body = this.el("div", { class: "sf-diff" });
    this.els.diff = body;
    return this.el("div", { class: "sf-chat" },
      this.el("div", { class: "sf-diffbar" },
        this.el("span", { text: "Правка агента: слева убрано, справа добавлено." }),
        this.el("span", { class: "sf-spacer" }),
        this.el("button", { text: "Откатить правку", onclick: () => this.revert() })),
      body);
  },

  bindShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      // Перехватываем Ctrl+S, только когда вкладка Фабрики открыта: класс active
      // на .ws-page ставит переключатель вкладок админки.
      if (!this.els.main || !this.els.main.closest(".ws-page.active")) return;
      e.preventDefault();
      if (this.state.dirty) this.publish();
    });
    window.addEventListener("beforeunload", (e) => {
      if (this.state.dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  },

  render() { if (!this.state.catalog.length && !this.state.drafts.length) this.reloadList(); },

  /* ---------- состояние Фабрики ---------- */
  async loadState() {
    try {
      const state = await this.api("/state");
      this.state.stub = state.stub;
      this.state.models = state.models || [];
      this.state.model = this.state.models[0] || "";
      this.els.modelSelect.innerHTML = "";
      for (const name of this.state.models) {
        this.els.modelSelect.append(this.el("option", { value: name, text: name }));
      }
      if (state.stub) {
        this.banner("warn", "Фабрика работает на заглушке: языковая модель ещё не подключена. " +
          "Проверка, прогон и публикация работают по-настоящему.");
      }
    } catch (err) {
      this.banner("err", "Фабрика недоступна: " + err.message);
    }
  },

  banner(kind, text) {
    const node = this.els.banner;
    node.className = "sf-banner show " + kind;
    node.textContent = text;
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
      const shown = this.state.drafts.filter((d) =>
        !needle || (d.title + d.filename).toLowerCase().includes(needle));
      if (!shown.length) list.append(this.el("div", { class: "sf-empty", text: "Черновиков нет." }));
      for (const draft of shown) {
        list.append(this.el("div", {
          class: "sf-item" + (draft.id === this.state.draftId ? " on" : ""),
          onclick: () => this.openDraft(draft.id),
        },
          this.el("span", { class: "sf-item-title", text: draft.title || draft.filename || draft.id }),
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
    if (!this.confirmDiscard()) return;
    try {
      const data = await this.api("/skills/raw?path=" + encodeURIComponent(item.path));
      this.state.path = data.path;
      this.state.draftId = null;
      this.state.kind = data.suffix === ".md" ? "reference" : "recipe";
      this.state.filename = data.path.split("/").pop();
      this.setText(data.text, "");
      this.state.report = null;
      this.clearBanner();
      this.renderList();
      this.renderChatLog([]);
      this.switchMode("form");
    } catch (err) {
      this.banner("err", "Скилл не открылся: " + err.message);
    }
  },

  async openDraft(id) {
    if (!this.confirmDiscard()) return;
    try {
      const draft = await this.api("/drafts/" + id);
      this.state.draftId = draft.id;
      this.state.path = draft.source_path || null;
      this.state.kind = draft.kind;
      this.state.filename = draft.filename || (draft.kind === "reference" ? "new_reference.md" : "new_recipe.yaml");
      this.setText(draft.text || "", "");
      this.state.report = draft.report || null;
      this.renderReport();
      this.renderChatLog(draft.chat || []);
      this.renderList();
      this.switchMode(draft.text ? "form" : "chat");
    } catch (err) {
      this.banner("err", "Черновик не открылся: " + err.message);
    }
  },

  async newDraft(kind) {
    if (!this.confirmDiscard()) return;
    try {
      const draft = await this.post("/drafts", { kind, title: kind === "reference" ? "Новый приём" : "Новый рецепт" });
      await this.reloadList();
      this.switchList("drafts");
      await this.openDraft(draft.id);
      this.switchMode("form");
    } catch (err) {
      this.banner("err", "Черновик не создался: " + err.message);
    }
  },

  async newAiDraft() {
    await this.newDraft("recipe");
    this.switchMode("chat");
    this.pushMsg("sys", "Опишите задачу словами. Агент допросит по недостающему и ничего не додумает.");
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
      this.put("/drafts/" + this.state.draftId, {
        text: this.state.text, filename: this.state.filename,
      }).catch(() => {});
    }, 700);
  },

  confirmDiscard() {
    return !this.state.dirty || confirm("Есть несохранённые правки. Открыть другой скилл и потерять их?");
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
      const data = await this.api("/form/fields?kind=" + kind);
      this.state.fields[kind] = data.fields;
    }
    return this.state.fields[kind];
  },

  async renderForm() {
    const host = this.els.form;
    host.innerHTML = "";
    if (!this.state.text) {
      host.append(this.el("div", { class: "sf-empty", text: "Выберите скилл слева или создайте новый." }));
      return;
    }
    let data;
    try {
      const parsed = await this.post("/form/parse", { text: this.state.text, kind: this.state.kind });
      data = parsed.data;
    } catch (err) {
      host.append(this.el("div", { class: "sf-empty" },
        "Текст пока не разбирается формой: " + err.message,
        this.el("div", { class: "sf-help", text: "Поправьте его в режиме «Текст» — форма подхватит." })));
      return;
    }
    const fields = await this.fields();
    const draft = Object.assign({}, data);
    const sync = () => {
      this.post("/form/render", { data: draft, kind: this.state.kind })
        .then((res) => {
          this.state.text = res.text;
          this.els.editor.value = res.text;
          this.markDirty();
        })
        .catch(() => {});
    };

    for (const field of fields) {
      host.append(this.renderField(field, draft, sync));
    }
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
          try { draft[field.name] = JSON.parse(e.target.value); e.target.style.borderColor = ""; sync(); }
          catch (_) { e.target.style.borderColor = "var(--red)"; }
        },
      });
      control.value = JSON.stringify(draft[field.name] || {}, null, 2);
    } else if (field.type === "tags") {
      control = this.renderTags(field, draft, sync);
    } else if (field.type === "list") {
      control = this.renderList2(field, draft, sync);
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

  renderList2(field, draft, sync) {
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
              const value = e.target.value;
              row[key] = key === "query" ? SkillFactory.tryJson(value) : value;
              draft[field.name] = rows; sync();
            },
          });
          const current = row[key];
          input.value = current === undefined || current === null
            ? "" : (typeof current === "object" ? JSON.stringify(current) : current);
          line.append(input);
        }
        line.append(this.el("button", {
          class: "danger-ghost small", text: "✕",
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
    this.busy(true);
    this.banner("warn", withReview ? "Проверяю: статика, прогон на данных, ревью критиков…" : "Проверяю: статика и прогон…");
    try {
      const report = await this.post("/check", {
        text: this.state.text, kind: this.state.kind,
        with_review: !!withReview, with_run: true, model: this.state.model,
      });
      this.state.report = report;
      this.renderReport();
      this.switchMode("report");
      const counts = report.counts;
      if (report.ok && !counts.warning && !counts.advice) this.banner("ok", "Проверка пройдена, замечаний нет.");
      else if (report.ok) this.banner("warn", `Ошибок нет. Предупреждений ${counts.warning}, советов ${counts.advice}.`);
      else this.banner("err", `Ошибок ${counts.error}, предупреждений ${counts.warning}.`);
      if (this.state.draftId) this.reloadList();
    } catch (err) {
      this.banner("err", "Проверка не выполнилась: " + err.message);
    } finally {
      this.busy(false);
    }
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
      host.append(box);
    }

    if (!report.issues.length) {
      host.append(this.el("div", { class: "sf-empty", text: "Замечаний нет." }));
      return;
    }
    host.append(this.el("div", { class: "sf-group", text: "Замечания" }));
    for (const issue of report.issues) {
      host.append(this.el("div", { class: "sf-issue " + issue.severity },
        this.el("div", { class: "head" },
          this.el("b", { text: { error: "Ошибка", warning: "Предупреждение", advice: "Совет" }[issue.severity] || issue.severity }),
          this.el("span", { class: "code", text: issue.code }),
          issue.source ? this.el("span", { class: "src", text: issue.source }) : null),
        this.el("div", { text: issue.message }),
        issue.fix_hint ? this.el("div", { class: "hint", text: issue.fix_hint }) : null,
        this.el("div", { class: "act" },
          this.el("button", { class: "small", text: "Исправить это", onclick: () => this.fixOne(issue) })),
      ));
    }
  },

  /* ---------- чат с агентами ---------- */
  renderChatLog(messages) {
    this.els.log.innerHTML = "";
    for (const message of messages || []) {
      this.pushMsg(message.role === "user" ? "user" : "bot", message.content || "");
    }
  },

  pushMsg(kind, text) {
    const node = this.el("div", { class: "sf-msg " + kind, text });
    this.els.log.append(node);
    this.els.log.scrollTop = this.els.log.scrollHeight;
    return node;
  },

  pushStep(text, extraClass) {
    const node = this.el("div", { class: "sf-step " + (extraClass || "") },
      this.el("span", { class: "mark", text: "▸" }), this.el("span", { text }));
    this.els.log.append(node);
    this.els.log.scrollTop = this.els.log.scrollHeight;
    return node;
  },

  busy(on) {
    this.state.busy = on;
    this.els.send.disabled = on;
    this.els.send.textContent = on ? "Работаю…" : "Отправить";
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
    const mode = this.state.text.trim() ? "improve" : "create";
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

  async stream(payload) {
    this.busy(true);
    this.clearBanner();
    try {
      const response = await fetch(this.API + "/drafts/" + this.state.draftId + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      this.banner("err", "Поток прервался: " + err.message);
    } finally {
      this.busy(false);
      this.reloadList();
    }
  },

  onEvent(event) {
    switch (event.type) {
      case "start":
        this.pushStep(event.stub ? "заглушка модели" : "модель подключена");
        break;
      case "stage":
        this.pushStep(event.title);
        break;
      case "tool":
        this.pushStep(`${event.name}: ${event.summary}`, "tool" + (event.ok ? "" : " bad"));
        break;
      case "message":
        this.pushMsg("bot", event.text);
        break;
      case "question":
        this.askQuestion(event);
        break;
      case "findings":
        this.pushStep(`модель: ${(event.model || {}).schema}.${(event.model || {}).logic_model}, ` +
          `колонок ${(event.columns || []).length}, уверенность ${event.confidence}`, "tool");
        break;
      case "draft":
        this.state.filename = event.filename || this.state.filename;
        this.setText(event.text, event.previous || this.state.text);
        this.pushStep("черновик обновлён" + (event.comment ? ": " + event.comment : ""));
        break;
      case "report":
        this.state.report = event.report;
        this.renderReport();
        this.pushStep(`проверка: ошибок ${event.report.counts.error}, ` +
          `предупреждений ${event.report.counts.warning}`);
        break;
      case "done":
        this.pushStep(event.ready ? "готово" : "нужна ваша правка");
        break;
      case "error":
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
    this.els.log.scrollTop = this.els.log.scrollHeight;
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
    this.busy(true);
    try {
      const result = await this.post("/publish", {
        filename, text: this.state.text,
        path: this.state.path || null,
        draft_id: this.state.draftId || "",
      });
      this.state.path = result.path;
      this.state.dirty = false;
      this.els.main.classList.remove("dirty");
      this.banner("ok", `Опубликовано на стенде: ${result.path} (${result.action}). Скилл уже виден агентам.`);
      this.reloadList();
    } catch (err) {
      this.banner("err", "Публикация отклонена: " + err.message);
      this.switchMode("report");
    } finally {
      this.busy(false);
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
    if (this.state.draftId) {
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



s
