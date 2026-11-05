'use strict';

/* =========================================================
   Состояние
   ========================================================= */
const state = {
  tab: 'add',
  mode: 'add',               // 'add' | 'remove'
  theme: 'light',
  employees: [],
  customDepartments: [],     // отделы, созданные в приложении (config.json)
  selectedId: null,          // сотрудник, выбранный из подсказок при отбитии
  dragId: null,
  boardsCollapsed: true,     // отделы по умолчанию скрыты (видны только заголовки)
  connected: false,
  historyAction: 'add',      // 'add' | 'remove'
  departmentCapacity: 16,    // максимум сотрудников в отделе (приходит из get_settings)
};

const TABS = ['add', 'list', 'boards', 'history'];
const NO_DEPT = '';
const NO_DEPT_TITLE = 'Без отдела';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ICONS = {
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* =========================================================
   Утилиты
   ========================================================= */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function normalize(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function initials(fio) {
  const parts = String(fio).trim().split(/\s+/);
  return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase();
}

function shortName(fio) {
  return String(fio).split(' ').slice(0, 2).join(' ');
}

function formatWhen(date, time) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const day = match ? `${match[3]}.${match[2]}.${match[1]}` : date;
  return [day, String(time).slice(0, 5)].filter(Boolean).join(', ');
}

function deptTitle(name) {
  return name || NO_DEPT_TITLE;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Запрос к серверу. Возвращает data или бросает Error с текстом ошибки. */
async function request(url, options) {
  let result;
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      ...options,
      headers: { 'X-CSRFToken': csrfToken(), ...(options.headers || {}) },
    });
    result = await response.json();
  } catch {
    throw new Error('Нет связи с сервером');
  }
  if (!result || !result.ok) throw new Error(result?.error || 'Неизвестная ошибка');
  return result.data;
}

/** Вызов серверного метода: api('add_employee', who, info, department). */
function api(method, ...args) {
  return request(`/api/${method}/`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  });
}

/** Все отделы: созданные в приложении + встречающиеся в БД. */
function allDepartments() {
  const names = [...state.customDepartments];
  const known = new Set(names.map(normalize));
  const fromDb = [...new Set(state.employees.map((e) => e.group).filter(Boolean))]
    .filter((name) => !known.has(normalize(name)))
    .sort((a, b) => a.localeCompare(b, 'ru'));
  return names.concat(fromDb);
}

function findEmployee(id) {
  return state.employees.find((e) => e.id === id);
}

/* =========================================================
   Уведомления
   ========================================================= */
function toast(text, type = 'info') {
  const host = $('#toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.setAttribute('role', 'status');
  el.textContent = text;
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2800);
}

/* =========================================================
   Тема и вкладки
   ========================================================= */
function savedTheme() {
  try { return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

function applyTheme(theme) {
  state.theme = theme;
  $('#app').dataset.theme = theme;
  document.body.style.background = theme === 'dark' ? '#0E1013' : '#F4F5F7';
  $('#themeBtn').innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch { /* хранилище недоступно */ }
}

function switchTab(tab) {
  if (state.tab === tab) return;
  editingEmployeeId = null;
  editingDepartment = null;
  state.tab = tab;
  $('#tabIndicator').style.transform = `translateX(${TABS.indexOf(tab) * 100}%)`;
  $$('.tab').forEach((btn) => btn.classList.toggle('on', btn.dataset.tab === tab));
  TABS.forEach((name) => { $(`#view-${name}`).hidden = name !== tab; });
  $('.main').scrollTop = 0;

  // При открытии вкладки подтягиваем свежие данные из БД
  if (tab === 'list' || tab === 'boards') loadEmployees({ animate: true });
  else if (tab === 'history') loadHistory({ animate: true });
}

/* =========================================================
   Загрузка данных
   ========================================================= */
async function loadEmployees({ animate = false } = {}) {
  try {
    state.employees = await api('get_employees');
    // отделы общие для всех пользователей и хранятся в БД — подтягиваем свежий список
    state.customDepartments = (await api('get_settings')).departments || [];
    setConnected(true);
  } catch (error) {
    setConnected(false, error.message);
  }
  renderAll(animate);
}

function setConnected(connected, message = '') {
  state.connected = connected;
  if (!connected) toast(message || 'Нет связи с сервером', 'error');
}

function renderAddDeptSelect() {
  const select = $('#addDept');
  const current = select.value;
  select.innerHTML = departmentOptions(current);
}

function renderAll(animate = false) {
  renderAddDeptSelect();
  renderSuggestions();
  renderList(animate);
  renderBoards(animate);
}

/* =========================================================
   Вкладка «Учёт»
   ========================================================= */
const form = {
  fio: $('#fio'),
  role: $('#role'),
  error: $('#formError'),
  submit: $('#submitBtn'),
};

function setMode(mode) {
  state.mode = mode;
  $$('input[name="mode"]').forEach((input) => { input.checked = input.value === mode; });
  const isAdd = mode === 'add';
  const title = $('#formTitle');
  title.textContent = isAdd ? 'Добавление сотрудника' : 'Отбитие сотрудника';
  title.style.animation = 'none';
  void title.offsetWidth; // перезапуск анимации заголовка
  title.style.animation = '';
  $('#roleBlock').classList.toggle('open', isAdd);
  $('#deptBlock').classList.toggle('open', isAdd);
  $('#addDept').disabled = !isAdd;
  form.role.disabled = !isAdd;
  state.selectedId = null;
  showFormError('');
  renderSuggestions();
}

function showFormError(message) {
  form.error.hidden = !message;
  if (!message) return;
  form.error.textContent = message;
  form.error.classList.remove('shake');
  void form.error.offsetWidth;
  form.error.classList.add('shake');
}

function renderSuggestions() {
  const box = $('#suggestions');
  if (state.mode !== 'remove') { box.innerHTML = ''; return; }

  const query = normalize(form.fio.value);
  const selected = findEmployee(state.selectedId);
  if (selected && normalize(selected.who) === query) { box.innerHTML = ''; return; }

  const items = state.employees
    .filter((e) => !query || normalize(e.who).includes(query))
    .slice(0, 5);

  box.innerHTML = items.map((e, i) => `
    <button type="button" class="chip" data-id="${e.id}" style="animation-delay:${i * 35}ms">
      ${escapeHtml(e.who)}${e.info ? `<span>· ${escapeHtml(e.info)}</span>` : ''}
    </button>`).join('');
}

async function submitForm(event) {
  event.preventDefault();
  const fio = form.fio.value.trim().replace(/\s+/g, ' ');
  if (!fio) { showFormError('Укажите ФИО сотрудника'); form.fio.focus(); return; }

  if (state.mode === 'add') {
    const role = form.role.value.trim();
    if (!role) { showFormError('Опишите должность сотрудника'); form.role.focus(); return; }
    await withBusy(form.submit, async () => {
      const employee = await api('add_employee', fio, role, $('#addDept').value);
      state.employees.push(employee);
      form.fio.value = '';
      form.role.value = '';
      renderAll();
      toast('Сотрудник добавлен');
    });
    return;
  }

  const selected = findEmployee(state.selectedId);
  const candidates = selected && normalize(selected.who) === normalize(fio)
    ? [selected]
    : state.employees.filter((e) => normalize(e.who) === normalize(fio));

  if (candidates.length === 0) { showFormError('Сотрудник с таким ФИО не найден'); return; }
  if (candidates.length > 1) {
    showFormError('Найдено несколько сотрудников с таким ФИО — выберите нужного в подсказках');
    return;
  }

  const employee = candidates[0];
  await withBusy(form.submit, async () => {
    await api('remove_employee', employee.id);
    state.selectedId = null;
    form.fio.value = '';
    renderAll();
    toast('Отбитие выполнено');
  });
}

/** Блокирует кнопку на время запроса и показывает ошибку в форме. */
async function withBusy(button, action) {
  button.disabled = true;
  showFormError('');
  try {
    await action();
  } catch (error) {
    showFormError(error.message);
  } finally {
    button.disabled = false;
  }
}

/* =========================================================
   Вкладка «Сотрудники»
   ========================================================= */
function departmentOptions(current) {
  const names = allDepartments();
  if (current && !names.includes(current)) names.push(current);
  return [`<option value="">${NO_DEPT_TITLE}</option>`]
    .concat(names.map((name) =>
      `<option value="${escapeHtml(name)}"${name === current ? ' selected' : ''}>${escapeHtml(name)}</option>`))
    .join('');
}

let editingEmployeeId = null; // id сотрудника, который сейчас редактируется прямо в списке

function renderList(animate = false) {
  const body = $('#listBody');
  const query = normalize($('#listSearch').value);
  const rows = state.employees.filter((e) =>
    !query || normalize(`${e.who} ${e.info} ${deptTitle(e.group)}`).includes(query));

  $('#totalCount').textContent = state.employees.length;
  body.classList.toggle('anim', animate);

  if (rows.length === 0) {
    const text = state.employees.length === 0 ? 'В базе пока нет сотрудников' : 'Ничего не найдено';
    body.innerHTML = `<div class="empty">${text}</div>`;
    return;
  }

  body.innerHTML = rows.map((e, i) => e.id === editingEmployeeId
    ? renderEditRow(e, i)
    : `
    <div class="trow" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="person"><div class="av">${escapeHtml(initials(e.who))}</div><span class="n" title="${escapeHtml(e.who)}">${escapeHtml(e.who)}</span></div>
      <div class="role" title="${escapeHtml(e.info)}">${escapeHtml(e.info)}</div>
      <div><select class="sel" data-id="${e.id}" aria-label="Отдел сотрудника">${departmentOptions(e.group)}</select></div>
      <div class="when">${escapeHtml(formatWhen(e.date, e.time))}</div>
      <div class="row-actions">
        <button type="button" class="cdel" data-edit-id="${e.id}" aria-label="Изменить сотрудника" title="Изменить">${ICONS.edit}</button>
        <button type="button" class="cdel" data-remove-id="${e.id}" aria-label="Отбить сотрудника" title="Отбить сотрудника">${ICONS.trash}</button>
      </div>
    </div>`).join('');
}

function renderEditRow(e, i) {
  return `
    <div class="trow editing" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="person">
        <div class="av">${escapeHtml(initials(e.who))}</div>
        <input class="inp sm edit-who" value="${escapeHtml(e.who)}" aria-label="ФИО сотрудника" placeholder="Фамилия Имя Отчество">
      </div>
      <div><input class="inp sm edit-info" value="${escapeHtml(e.info)}" aria-label="Должность" placeholder="Должность"></div>
      <div><select class="sel" data-id="${e.id}" aria-label="Отдел сотрудника">${departmentOptions(e.group)}</select></div>
      <div class="when">${escapeHtml(formatWhen(e.date, e.time))}</div>
      <div class="row-actions">
        <button type="button" class="cdel ok" data-save-id="${e.id}" aria-label="Сохранить изменения" title="Сохранить">${ICONS.check}</button>
        <button type="button" class="cdel" data-cancel-edit aria-label="Отменить изменения" title="Отменить">${ICONS.close}</button>
      </div>
    </div>`;
}

function startEditEmployee(id) {
  editingEmployeeId = id;
  renderList();
  const input = $('#listBody .trow.editing .edit-who');
  input?.focus();
  input?.select();
}

function cancelEditEmployee() {
  editingEmployeeId = null;
  renderList();
}

async function saveEmployeeEdit(id, row) {
  const who = $('.edit-who', row).value.trim().replace(/\s+/g, ' ');
  const info = $('.edit-info', row).value.trim();
  if (!who) { toast('Укажите ФИО сотрудника', 'error'); $('.edit-who', row).focus(); return; }
  if (!info) { toast('Укажите должность', 'error'); $('.edit-info', row).focus(); return; }

  const saveBtn = $('[data-save-id]', row);
  saveBtn.disabled = true;
  try {
    await api('update_employee', id, who, info);
    const employee = findEmployee(id);
    if (employee) { employee.who = who; employee.info = info; }
    editingEmployeeId = null;
    renderAll();
    toast('Изменения сохранены');
  } catch (error) {
    toast(error.message, 'error');
    saveBtn.disabled = false;
  }
}

function deleteEmployeeFromList(id, fio) {
  confirmDialog('Отбить сотрудника?', `«${fio}» получит в базе метку «отбился». Из списка он не удаляется.`, async () => {
    await api('remove_employee', id);
    renderAll();
    toast('Отбитие выполнено');
  });
}

/* =========================================================
   Назначение отдела
   ========================================================= */
async function assignDepartment(id, department, { viaDrop = false } = {}) {
  const employee = findEmployee(id);
  if (!employee || employee.group === department) return;

  if (department) {
    const occupied = state.employees.filter((e) => e.group === department).length;
    if (occupied >= state.departmentCapacity) {
      toast(`В отделе «${department}» уже максимум мест (${state.departmentCapacity})`, 'error');
      renderList();
      renderBoards();
      return;
    }
  }

  const previous = employee.group;
  employee.group = department; // оптимистичное обновление
  renderList();
  renderBoards();
  if (viaDrop) flashCard(id, 'landed');

  try {
    await api('set_department', id, department);
    toast(`${shortName(employee.who)} — ${deptTitle(department)}`);
  } catch (error) {
    employee.group = previous;
    renderList();
    renderBoards();
    toast(error.message, 'error');
  }
}

/* =========================================================
   Вкладка «Отделы»
   ========================================================= */
function cardMatches(employee, query) {
  return !!query && normalize(`${employee.who} ${employee.info}`).includes(query);
}

let editingDepartment = null; // название отдела, который сейчас переименовывается

function renderBoards(animate = false) {
  const boards = $('#boards');
  const columns = [NO_DEPT, ...allDepartments()];
  const capacity = state.departmentCapacity;

  boards.classList.toggle('anim', animate);
  boards.innerHTML = columns.map((dept, i) => {
    const items = state.employees.filter((e) => (e.group || NO_DEPT) === dept);
    const isFull = !!dept && items.length >= capacity;
    const cards = items.map((e) => `
      <div class="pcard" draggable="true" data-id="${e.id}">
        <div class="av sm">${escapeHtml(initials(e.who))}</div>
        <div class="pc"><b title="${escapeHtml(e.who)}">${escapeHtml(e.who)}</b><span title="${escapeHtml(e.info)}">${escapeHtml(e.info)}</span></div>
      </div>`).join('');

    const isEditing = dept && dept === editingDepartment;
    const headInner = isEditing ? `
        <input class="inp sm dept-edit-name" value="${escapeHtml(dept)}" aria-label="Название отдела">
        <button type="button" class="cdel ok" data-save-dept="${escapeHtml(dept)}" aria-label="Сохранить название" title="Сохранить">${ICONS.check}</button>
        <button type="button" class="cdel" data-cancel-dept aria-label="Отменить" title="Отменить">${ICONS.close}</button>
      ` : `
        <strong title="${escapeHtml(deptTitle(dept))}">${escapeHtml(deptTitle(dept))}</strong>
        <span class="badge${isFull ? ' full' : ''}">${dept ? `${items.length}/${capacity}` : items.length}</span>
        ${dept ? `
          <span class="chead-actions">
            <button type="button" class="cdel" data-edit-dept="${escapeHtml(dept)}" aria-label="Переименовать отдел" title="Переименовать">${ICONS.edit}</button>
            <button type="button" class="cdel" data-delete="${escapeHtml(dept)}" aria-label="Удалить отдел" title="Удалить отдел">${ICONS.trash}</button>
          </span>` : ''}
      `;

    return `
      <div class="col${isFull ? ' full' : ''}" data-dept="${escapeHtml(dept)}" style="animation-delay:${Math.min(i, 10) * 50}ms">
        <div class="chead${isEditing ? ' editing' : ''}">${headInner}</div>
        <div class="stack">${cards || '<div class="drop">Перетащите сотрудника сюда</div>'}</div>
      </div>`;
  }).join('') + `
    <div class="col ghost" style="animation-delay:${Math.min(columns.length, 10) * 50}ms">
      <button type="button" class="newdept" id="newDeptBtn"><span class="plus">${ICONS.plus}</span>Новый отдел</button>
    </div>`;

  applyBoardSearch({ scroll: false });
}

function startEditDepartment(name) {
  editingDepartment = name;
  renderBoards();
  const input = $('#boards .chead.editing .dept-edit-name');
  input?.focus();
  input?.select();
}

function cancelEditDepartment() {
  editingDepartment = null;
  renderBoards();
}

async function saveDepartmentRename(oldName, chead) {
  const input = $('.dept-edit-name', chead);
  const newName = input.value.trim().replace(/\s+/g, ' ');
  if (!newName) { toast('Введите название отдела', 'error'); input.focus(); return; }
  if (newName === oldName) { editingDepartment = null; renderBoards(); return; }
  if (allDepartments().some((d) => normalize(d) === normalize(newName))) {
    toast('Такой отдел уже есть', 'error');
    return;
  }

  const saveBtn = $('[data-save-dept]', chead);
  saveBtn.disabled = true;
  try {
    await api('rename_department', oldName, newName);
    state.customDepartments = state.customDepartments.map((d) => (d === oldName ? newName : d));
    state.employees.forEach((e) => { if (e.group === oldName) e.group = newName; });
    editingDepartment = null;
    renderBoards();
    renderList();
    toast(`Отдел переименован в «${newName}»`);
  } catch (error) {
    toast(error.message, 'error');
    saveBtn.disabled = false;
  }
}

/** Скрывает/показывает сотрудников во всех отделах. При активном поиске отделы раскрыты, чтобы были видны найденные. */
function updateBoardsCollapse() {
  const searching = !!normalize($('#boardSearch').value);
  const collapsed = state.boardsCollapsed && !searching;
  $('#boards').classList.toggle('collapsed', collapsed);
  const button = $('#toggleBoardsBtn');
  button.textContent = state.boardsCollapsed ? 'Раскрыть все отделы' : 'Скрыть все отделы';
  button.setAttribute('aria-expanded', String(!state.boardsCollapsed));
}

/** Подсветка найденных сотрудников и их отделов без перерисовки досок. */
function applyBoardSearch({ scroll = true } = {}) {
  const query = normalize($('#boardSearch').value);
  updateBoardsCollapse();

  $$('#boards .col[data-dept]').forEach((col) => {
    let hasHit = false;
    $$('.pcard', col).forEach((card) => {
      const hit = cardMatches(findEmployee(Number(card.dataset.id)), query);
      hasHit ||= hit;
      card.classList.toggle('hit', hit);
      card.classList.toggle('dim', !!query && !hit);
    });
    col.classList.toggle('hit', hasHit);
    $('.badge', col).classList.toggle('hit', hasHit);
  });

  renderFound(query);
  if (scroll && query) {
    const first = $('#boards .pcard.hit');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function renderFound(query) {
  const box = $('#found');
  box.hidden = !query;
  if (!query) { box.innerHTML = ''; return; }

  const matches = state.employees.filter((e) => cardMatches(e, query)).slice(0, 8);
  box.innerHTML = matches.length
    ? matches.map((e, i) => `
        <button type="button" class="tag" data-id="${e.id}" style="animation-delay:${i * 30}ms">
          ${escapeHtml(e.who)} · <b>${escapeHtml(deptTitle(e.group))}</b>
        </button>`).join('')
    : '<span class="sub">Никого не найдено</span>';
}

function flashCard(id, className) {
  const card = $(`#boards .pcard[data-id="${id}"]`);
  if (!card) return null;
  card.classList.remove(className);
  void card.offsetWidth;
  card.classList.add(className);
  card.addEventListener('animationend', () => card.classList.remove(className), { once: true });
  return card;
}

function showNewDepartmentForm(ghost) {
  ghost.innerHTML = `
    <form class="deptform" novalidate>
      <input class="inp" name="name" placeholder="Название отдела" autocomplete="off" maxlength="80">
      <div class="row">
        <button type="button" class="btn ghost small" data-cancel>Отмена</button>
        <button type="submit" class="btn small">Создать</button>
      </div>
    </form>`;
  const input = $('input', ghost);
  input.focus();
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') renderBoards(); });
  $('[data-cancel]', ghost).addEventListener('click', () => renderBoards());
  $('form', ghost).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) { input.focus(); return; }
    if ([NO_DEPT_TITLE, ...allDepartments()].some((d) => normalize(d) === normalize(name))) {
      toast('Такой отдел уже есть', 'error');
      return;
    }
    try {
      await api('add_department', name);
      state.customDepartments.push(name);
      renderBoards();
      renderList();
      toast(`Отдел «${name}» создан`);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function deleteDepartment(name) {
  const count = state.employees.filter((e) => e.group === name).length;
  const text = count
    ? `Сотрудники отдела (${count}) будут перемещены в «${NO_DEPT_TITLE}».`
    : 'В отделе нет сотрудников.';
  confirmDialog(`Удалить отдел «${name}»?`, text, async () => {
    await api('delete_department', name);
    state.customDepartments = state.customDepartments.filter((d) => d !== name);
    state.employees.forEach((e) => { if (e.group === name) e.group = NO_DEPT; });
    renderBoards();
    renderList();
    toast(`Отдел «${name}» удалён`);
  });
}

/* ---------- Перемещение по двойному клику ---------- */
let movingEmployeeId = null;

function openMoveDialog(id) {
  const employee = findEmployee(id);
  if (!employee) return;
  movingEmployeeId = id;
  $('#moveText').textContent = `${employee.who} · сейчас: ${deptTitle(employee.group)}`;
  $('#moveDept').innerHTML = departmentOptions(employee.group);
  openModal($('#moveModal'));
  $('#moveDept').focus();
}

function submitMove(event) {
  event.preventDefault();
  const id = movingEmployeeId;
  const department = $('#moveDept').value;
  closeModal($('#moveModal'));
  movingEmployeeId = null;
  if (id != null) assignDepartment(id, department, { viaDrop: true });
}

/* ---------- Drag-and-drop ---------- */
/** Во время перетаскивания колесо мыши в Chromium не работает — прокручиваем .main сами у краёв окна. */
const autoScroll = { y: 0, raf: 0 };

function autoScrollStep() {
  const main = $('.main');
  const rect = main.getBoundingClientRect();
  const zone = 90;
  const maxSpeed = 22;
  let delta = 0;
  if (autoScroll.y < rect.top + zone) delta = -maxSpeed * Math.min(1, (rect.top + zone - autoScroll.y) / zone);
  else if (autoScroll.y > rect.bottom - zone) delta = maxSpeed * Math.min(1, (autoScroll.y - (rect.bottom - zone)) / zone);
  if (delta) main.scrollTop += delta;
  autoScroll.raf = requestAnimationFrame(autoScrollStep);
}

function startAutoScroll() {
  if (!autoScroll.raf) autoScroll.raf = requestAnimationFrame(autoScrollStep);
}

function stopAutoScroll() {
  cancelAnimationFrame(autoScroll.raf);
  autoScroll.raf = 0;
}

function setupDragAndDrop() {
  const boards = $('#boards');
  const clearOver = () => $$('#boards .col.over').forEach((c) => c.classList.remove('over'));

  boards.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.pcard');
    if (!card) return;
    state.dragId = Number(card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
    autoScroll.y = e.clientY;
    startAutoScroll();
    requestAnimationFrame(() => card.classList.add('drag'));
  });

  boards.addEventListener('dragend', (e) => {
    e.target.closest('.pcard')?.classList.remove('drag');
    state.dragId = null;
    stopAutoScroll();
    clearOver();
  });

  // позиция курсора берётся на уровне документа — у краёв окна курсор уже вне #boards
  document.addEventListener('dragover', (e) => { autoScroll.y = e.clientY; });

  boards.addEventListener('dragover', (e) => {
    const col = e.target.closest('.col[data-dept]');
    if (!col || state.dragId == null) return;
    const dept = col.dataset.dept;
    const dragged = findEmployee(state.dragId);
    const occupied = dept ? state.employees.filter((x) => x.group === dept).length : 0;
    const isFull = !!dept && dragged?.group !== dept && occupied >= state.departmentCapacity;

    e.preventDefault();
    e.dataTransfer.dropEffect = isFull ? 'none' : 'move';
    if (isFull) { clearOver(); return; }
    if (!col.classList.contains('over')) {
      clearOver();
      col.classList.add('over');
    }
  });

  boards.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.col[data-dept]');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('over');
  });

  boards.addEventListener('drop', (e) => {
    const col = e.target.closest('.col[data-dept]');
    if (!col) return;
    e.preventDefault();
    const id = state.dragId ?? Number(e.dataTransfer.getData('text/plain'));
    state.dragId = null;
    stopAutoScroll();
    clearOver();
    assignDepartment(id, col.dataset.dept, { viaDrop: true });
  });
}

/* =========================================================
   Вкладка «История»
   ========================================================= */
function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function setHistoryAction(action) {
  state.historyAction = action;
  $('#histInd').style.transform = action === 'remove' ? 'translateX(100%)' : 'none';
  $$('#histToggle .tog').forEach((btn) => btn.classList.toggle('on', btn.dataset.action === action));
  loadHistory({ animate: true });
}

async function loadHistory({ animate = false } = {}) {
  const from = $('#histFrom').value;
  const to = $('#histTo').value;
  const body = $('#historyBody');
  const actionWord = state.historyAction === 'add' ? 'добавления' : 'отбития';

  if (from && to && from > to) {
    body.innerHTML = '<div class="empty">Начальная дата позже конечной</div>';
    $('#historySummary').textContent = 'Проверьте период';
    return;
  }

  let events = [];
  try {
    events = await api('get_history', state.historyAction, from, to);
    setConnected(true);
  } catch (error) {
    setConnected(false, error.message);
    body.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    $('#historySummary').textContent = 'Не удалось загрузить';
    return;
  }

  $('#historySummary').textContent = `Событий ${actionWord}: ${events.length}`;
  body.classList.toggle('anim', animate);

  if (events.length === 0) {
    body.innerHTML = '<div class="empty">За выбранный период ничего не найдено</div>';
    return;
  }

  body.innerHTML = events.map((e, i) => `
    <div class="trow" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="person"><div class="av">${escapeHtml(initials(e.who))}</div><span class="n" title="${escapeHtml(e.who)}">${escapeHtml(e.who)}</span></div>
      <div class="role" title="${escapeHtml(e.info)}">${escapeHtml(e.info)}</div>
      <div class="role">${escapeHtml(deptTitle(e.group))}</div>
      <div class="when">${escapeHtml(formatWhen(e.date, e.time))}</div>
      <div><button type="button" class="cdel" data-id="${e.id}" aria-label="Удалить запись из истории" title="Удалить запись из истории">${ICONS.trash}</button></div>
    </div>`).join('');
}

function deleteHistoryEvent(id, fio) {
  confirmDialog('Удалить запись из истории?', `Запись о сотруднике «${fio}» будет удалена безвозвратно.`, async () => {
    await api('delete_history_event', id);
    await loadHistory();
    toast('Запись удалена из истории');
  });
}

/* =========================================================
   Импорт сотрудников из файла
   ========================================================= */
let importParsedRows = []; // полный список строк, распарсенных из последнего выбранного файла

function setImportStatus(message, ok = false) {
  const el = $('#importStatus');
  el.hidden = !message;
  el.textContent = message;
  el.className = 'status ' + (ok ? 'ok' : 'bad');
}

function resetImportModal() {
  importParsedRows = [];
  $('#importFile').value = '';
  $('#dzText').textContent = 'Перетащите файл сюда';
  $('#dropzone').classList.remove('over');
  $('#importResult').hidden = true;
  $('#importConfirmBtn').disabled = true;
  setImportStatus('');
}

function openImportModal() {
  resetImportModal();
  $('#importDept').innerHTML = `<option value="">${NO_DEPT_TITLE}</option>` +
    allDepartments().map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  openModal($('#importModal'));
}

function renderImportPreview(rows, skipped) {
  const hasRows = rows.length > 0;
  $('#importResult').hidden = !hasRows;
  $('#importConfirmBtn').disabled = !hasRows;

  if (!hasRows) {
    setImportStatus(skipped ? `Нет строк с заполненными ФИО и должностью (пропущено: ${skipped})` : 'В файле не найдено подходящих строк');
    return;
  }

  let summary = `Найдено сотрудников: ${rows.length}`;
  if (skipped) summary += ` · пропущено строк (нет ФИО или должности): ${skipped}`;
  $('#importSummary').textContent = summary;

  const PREVIEW_LIMIT = 30;
  const preview = rows.slice(0, PREVIEW_LIMIT)
    .map((r) => `<div class="prow"><span class="n">${escapeHtml(r.who)}</span><span>${escapeHtml(r.info)}</span></div>`)
    .join('');
  const more = rows.length > PREVIEW_LIMIT ? `<div class="prow more">и ещё ${rows.length - PREVIEW_LIMIT}</div>` : '';
  $('#importPreview').innerHTML = preview + more;
}

async function handleImportFile(file) {
  if (!file) return;
  $('#dzText').textContent = file.name;
  $('#importResult').hidden = true;
  $('#importConfirmBtn').disabled = true;
  setImportStatus('Разбираю файл…', true);

  try {
    const formData = new FormData();
    formData.append('file', file);
    const { rows, skipped } = await request('/api/parse_import_file/', { body: formData });
    importParsedRows = rows;
    setImportStatus('');
    renderImportPreview(rows, skipped);
  } catch (error) {
    importParsedRows = [];
    setImportStatus(error.message);
  }
}

async function confirmImport() {
  if (importParsedRows.length === 0) return;
  const button = $('#importConfirmBtn');
  button.disabled = true;
  setImportStatus('');
  try {
    const department = $('#importDept').value;
    const { added } = await api('import_employees', importParsedRows, department);
    closeModal($('#importModal'));
    toast(`Импортировано сотрудников: ${added}`);
    await loadEmployees({ animate: true });
  } catch (error) {
    setImportStatus(error.message);
    button.disabled = false;
  }
}

function setupImportDropzone() {
  const zone = $('#dropzone');
  const input = $('#importFile');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => handleImportFile(input.files[0]));

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  });
}

/* =========================================================
   Диалоги
   ========================================================= */
function openModal(modal) {
  clearTimeout(modal._closeTimer);
  modal.hidden = false;
  modal.classList.remove('closing');
}

function closeModal(modal) {
  if (modal.hidden || modal.classList.contains('closing')) return;
  modal.classList.add('closing');
  void modal.offsetWidth; // форсируем reflow, чтобы анимация закрытия гарантированно запустилась

  let done = false;
  const finish = () => {
    if (done || !modal.classList.contains('closing')) return; // модаль уже открыли заново
    done = true;
    modal.hidden = true;
    modal.classList.remove('closing');
    modal.removeEventListener('animationend', onEnd);
  };
  // animationend может не дойти до слушателя (анимация прервана, вкладка в фоне,
  // reduced motion и т.п.) — тогда оверлей завис бы навсегда и блокировал клики.
  // Поэтому таймер-страховка дублирует закрытие на случай, если событие не пришло.
  const onEnd = (e) => { if (e.target === modal) finish(); };
  modal.addEventListener('animationend', onEnd);
  modal._closeTimer = setTimeout(finish, 260);
}

let confirmAction = null;

function confirmDialog(title, text, action) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  confirmAction = action;
  openModal($('#confirmModal'));
  $('#confirmOk').focus();
}

async function runConfirmAction() {
  const button = $('#confirmOk');
  button.disabled = true;
  try {
    await confirmAction?.();
    closeModal($('#confirmModal'));
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

/* =========================================================
   Обработчики событий
   ========================================================= */
function bindEvents() {
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#importBtn').addEventListener('click', openImportModal);
  $('#importConfirmBtn').addEventListener('click', confirmImport);
  setupImportDropzone();

  // Учёт
  $$('input[name="mode"]').forEach((input) =>
    input.addEventListener('change', () => setMode(input.value)));
  form.fio.addEventListener('input', () => {
    showFormError('');
    renderSuggestions();
  });
  form.role.addEventListener('input', () => showFormError(''));
  $('#suggestions').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const employee = findEmployee(Number(chip.dataset.id));
    state.selectedId = employee.id;
    form.fio.value = employee.who;
    showFormError('');
    renderSuggestions();
    form.submit.focus();
  });
  $('#employeeForm').addEventListener('submit', submitForm);

  // Сотрудники
  $('#listSearch').addEventListener('input', () => renderList());
  $('#listBody').addEventListener('change', (e) => {
    const select = e.target.closest('.sel');
    if (select) assignDepartment(Number(select.dataset.id), select.value);
  });
  $('#listBody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) { startEditEmployee(Number(editBtn.dataset.editId)); return; }

    const saveBtn = e.target.closest('[data-save-id]');
    if (saveBtn) { saveEmployeeEdit(Number(saveBtn.dataset.saveId), saveBtn.closest('.trow')); return; }

    if (e.target.closest('[data-cancel-edit]')) { cancelEditEmployee(); return; }

    const removeBtn = e.target.closest('[data-remove-id]');
    if (removeBtn) {
      const fio = $('.n', removeBtn.closest('.trow'))?.textContent || 'сотрудник';
      deleteEmployeeFromList(Number(removeBtn.dataset.removeId), fio);
    }
  });
  $('#listBody').addEventListener('keydown', (e) => {
    const row = e.target.closest('.trow.editing');
    if (!row) return;
    if (e.key === 'Enter') { e.preventDefault(); saveEmployeeEdit(Number($('[data-save-id]', row).dataset.saveId), row); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditEmployee(); }
  });

  // Отделы
  const scrollToHit = debounce(() => applyBoardSearch({ scroll: true }), 300);
  $('#boardSearch').addEventListener('input', () => {
    applyBoardSearch({ scroll: false });
    scrollToHit();
  });
  $('#toggleBoardsBtn').addEventListener('click', () => {
    state.boardsCollapsed = !state.boardsCollapsed;
    updateBoardsCollapse();
  });
  $('#found').addEventListener('click', (e) => {
    const tag = e.target.closest('.tag');
    if (!tag) return;
    const card = flashCard(Number(tag.dataset.id), 'flash');
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#boards').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-dept]');
    if (editBtn) { startEditDepartment(editBtn.dataset.editDept); return; }

    const saveBtn = e.target.closest('[data-save-dept]');
    if (saveBtn) { saveDepartmentRename(saveBtn.dataset.saveDept, saveBtn.closest('.chead')); return; }

    if (e.target.closest('[data-cancel-dept]')) { cancelEditDepartment(); return; }

    const del = e.target.closest('[data-delete]');
    if (del) { deleteDepartment(del.dataset.delete); return; }
    if (e.target.closest('#newDeptBtn')) showNewDepartmentForm(e.target.closest('.col.ghost'));
  });
  $('#boards').addEventListener('dblclick', (e) => {
    const card = e.target.closest('.pcard');
    if (card) openMoveDialog(Number(card.dataset.id));
  });
  $('#moveForm').addEventListener('submit', submitMove);
  $('#boards').addEventListener('keydown', (e) => {
    const chead = e.target.closest('.chead.editing');
    if (!chead) return;
    if (e.key === 'Enter') { e.preventDefault(); saveDepartmentRename($('[data-save-dept]', chead).dataset.saveDept, chead); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditDepartment(); }
  });
  setupDragAndDrop();

  // История
  $('#histToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.tog');
    if (btn) setHistoryAction(btn.dataset.action);
  });
  $('#histFrom').addEventListener('change', () => loadHistory({ animate: true }));
  $('#histTo').addEventListener('change', () => loadHistory({ animate: true }));
  $('#historyBody').addEventListener('click', (e) => {
    const btn = e.target.closest('.cdel');
    if (!btn) return;
    const fio = $('.n', btn.closest('.trow'))?.textContent || 'сотрудник';
    deleteHistoryEvent(Number(btn.dataset.id), fio);
  });

  // Диалоги
  $$('.overlay').forEach((overlay) => {
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(overlay); });
    $$('[data-close]', overlay).forEach((btn) => btn.addEventListener('click', () => closeModal(overlay)));
  });
  $('#confirmOk').addEventListener('click', runConfirmAction);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.overlay:not([hidden])').forEach(closeModal);
  });
}

/* =========================================================
   Запуск
   ========================================================= */
async function init() {
  bindEvents();
  $('#histFrom').value = todayIso();
  $('#histTo').value = todayIso();
  try {
    const settings = await api('get_settings');
    applyTheme(savedTheme());
    state.customDepartments = settings.departments || [];
    state.departmentCapacity = settings.department_capacity || state.departmentCapacity;
  } catch {
    applyTheme(savedTheme());
  }
  $('#app').classList.add('ready');
  await loadEmployees({ animate: true });
}

document.addEventListener('DOMContentLoaded', init);
