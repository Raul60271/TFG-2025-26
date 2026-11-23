import { supabase } from './supabase.js';

// --- MAPEO DE COLORES PREESTABLECIDOS ---
const TASK_COLORS = {
    blanco: { bg: '#ffffff', text: '#333333', border: '#cccccc' },
    negro: { bg: '#212529', text: '#ffffff', border: '#111416' },
    gris: { bg: '#6c757d', text: '#ffffff', border: '#545b62' },
    marron: { bg: '#854d0e', text: '#ffffff', border: '#713f12' },
    rojo: { bg: '#dc3545', text: '#ffffff', border: '#bd2130' },
    naranja: { bg: '#fd7e14', text: '#ffffff', border: '#e86a02' },
    amarillo: { bg: '#ffc107', text: '#212529', border: '#d39e00' },
    verde: { bg: '#28a745', text: '#ffffff', border: '#1e7e34' },
    'verde oscuro': { bg: '#155724', text: '#ffffff', border: '#0f3d19' },
    azul: { bg: '#007bff', text: '#ffffff', border: '#0056b3' },
    'azul oscuro': { bg: '#004085', text: '#ffffff', border: '#002752' },
    morado: { bg: '#6f42c1', text: '#ffffff', border: '#59339d' },
    rosa: { bg: '#e83e8c', text: '#ffffff', border: '#d91a72' }
};

const WEEKDAY_SHORT_NAMES = {
    1: 'L',
    2: 'M',
    3: 'X',
    4: 'J',
    5: 'V',
    6: 'S',
    0: 'D'
};

// --- UTILIDADES DE FECHAS Y PERIODICIDAD ---
function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatLocalDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function addDays(dateStr, days) {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + days);
    return formatLocalDate(d);
}

function getNextWeeklyDate(fromDateStr, selectedDays, inclusive = false) {
    if (!selectedDays || selectedDays.length === 0) return fromDateStr;
    const base = parseLocalDate(fromDateStr);
    const startOffset = inclusive ? 0 : 1;

    for (let offset = startOffset; offset <= 7; offset++) {
        const candidate = new Date(base);
        candidate.setDate(base.getDate() + offset);
        if (selectedDays.includes(candidate.getDay())) {
            return formatLocalDate(candidate);
        }
    }
    return fromDateStr;
}

function getNextYearlyDate(currentDateStr, anchorDateStr) {
    const current = parseLocalDate(currentDateStr);
    const anchor = parseLocalDate(anchorDateStr || currentDateStr);

    const nextYear = current.getFullYear() + 1;
    const targetMonth = anchor.getMonth(); // 0-indexed (1 = Febrero)
    let targetDay = anchor.getDate();

    if (targetMonth === 1 && targetDay === 29 && !isLeapYear(nextYear)) {
        targetDay = 28;
    }

    return formatLocalDate(new Date(nextYear, targetMonth, targetDay));
}

function calculateNextOccurrence(currentDueDateStr, recurrenceType, recurrenceDays, anchorDateStr) {
    const baseDate = currentDueDateStr || formatLocalDate(new Date());

    switch (recurrenceType) {
        case 'daily':
            return addDays(baseDate, 1);
        case 'weekly':
            return getNextWeeklyDate(baseDate, recurrenceDays, false);
        case 'monthly':
            return addDays(baseDate, 30);
        case 'yearly':
            return getNextYearlyDate(baseDate, anchorDateStr || baseDate);
        default:
            return baseDate;
    }
}

// Adelanta una fecha pasada hasta la fecha más próxima vigente (>= minDateStr)
function getUpcomingDate(dateStr, recurrenceType, recurrenceDays, anchorDateStr, minDateStr) {
    if (!dateStr || !recurrenceType || recurrenceType === 'none') return dateStr;

    let current = dateStr;
    const anchor = anchorDateStr || dateStr;
    let safetyCounter = 0;

    if (recurrenceType === 'weekly') {
        const days = Array.isArray(recurrenceDays) ? recurrenceDays : [];
        if (days.length > 0 && current < minDateStr) {
            current = getNextWeeklyDate(minDateStr, days, true);
        }
        return current;
    }

    while (current < minDateStr && safetyCounter < 500) {
        current = calculateNextOccurrence(current, recurrenceType, recurrenceDays, anchor);
        safetyCounter++;
    }

    return current;
}

// Sincroniza en BD las tareas periódicas cuya fecha haya quedado atrás
async function syncRecurringTasksToUpcomingDates(tasks) {
    const todayStr = formatLocalDate(new Date());
    const updatedTasks = [];

    for (const task of tasks) {
        const recType = task.recurrence_type || 'none';
        if (recType !== 'none' && task.due_date && task.due_date < todayStr) {
            const anchor = task.recurrence_anchor_date || task.due_date;
            const upcomingDate = getUpcomingDate(
                task.due_date,
                recType,
                task.recurrence_days,
                anchor,
                todayStr
            );

            if (upcomingDate !== task.due_date) {
                const { error } = await supabase
                    .from('personal_tasks')
                    .update({
                        due_date: upcomingDate,
                        recurrence_anchor_date: anchor,
                        is_completed: false
                    })
                    .eq('id', task.id);

                if (!error) {
                    task.due_date = upcomingDate;
                    task.recurrence_anchor_date = anchor;
                    task.is_completed = false;
                }
            }
        }
        updatedTasks.push(task);
    }

    return updatedTasks;
}

function doesTaskOccurOnDate(task, targetDateStr) {
    if (!task.due_date) return false;
    if (task.due_date === targetDateStr) return true;

    const type = task.recurrence_type || 'none';
    if (type === 'none' || task.is_completed) return false;

    const start = parseLocalDate(task.due_date);
    const target = parseLocalDate(targetDateStr);
    if (target < start) return false;

    if (type === 'daily') {
        return true;
    }

    if (type === 'weekly') {
        const days = Array.isArray(task.recurrence_days) ? task.recurrence_days : [];
        return days.includes(target.getDay());
    }

    if (type === 'monthly') {
        const diffTime = target.getTime() - start.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays % 30 === 0;
    }

    if (type === 'yearly') {
        const anchor = parseLocalDate(task.recurrence_anchor_date || task.due_date);
        const anchorMonth = anchor.getMonth();
        let expectedDay = anchor.getDate();

        if (anchorMonth === 1 && expectedDay === 29 && !isLeapYear(target.getFullYear())) {
            expectedDay = 28;
        }

        return target.getMonth() === anchorMonth && target.getDate() === expectedDay;
    }

    return false;
}

function getRecurrenceBadgeText(task) {
    const type = task.recurrence_type || 'none';
    if (type === 'none') return '';

    if (type === 'daily') return '🔁 1 vez al día';
    if (type === 'weekly') {
        const order = [1, 2, 3, 4, 5, 6, 0];
        const days = Array.isArray(task.recurrence_days) ? task.recurrence_days : [];
        const sortedLabels = order.filter(d => days.includes(d)).map(d => WEEKDAY_SHORT_NAMES[d]);
        return sortedLabels.length > 0 ? `🔁 Semanal (${sortedLabels.join(', ')})` : '🔁 1 vez a la semana';
    }
    if (type === 'monthly') return '🔁 Cada 30 días';
    if (type === 'yearly') return '🔁 1 vez al año';
    return '';
}

// --- REFERENCIAS HTML ---
const userNameSpan = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const profileTrigger = document.getElementById('profile-trigger');
const profileDropdown = document.getElementById('profile-dropdown');
const toastNotification = document.getElementById('toast-notification');

const createTaskForm = document.getElementById('create-task-form');
const taskTitleInput = document.getElementById('task-title');
const taskDescInput = document.getElementById('task-desc');
const taskFileInput = document.getElementById('task-file');
const taskDateInput = document.getElementById('task-date');
const fileNameDisplay = document.getElementById('file-name-display');
const taskListContainer = document.getElementById('task-list');

// Referencias de Periodicidad (Botón y Modal)
const openRecurrenceModalBtn = document.getElementById('open-recurrence-modal-btn');
const taskRecurrenceInput = document.getElementById('task-recurrence-value');
const taskRecurrencePreviewText = document.getElementById('task-recurrence-preview-text');

const recurrenceModal = document.getElementById('recurrence-modal');
const modalRecurrenceSelect = document.getElementById('modal-recurrence-select');
const modalWeeklyDaysPanel = document.getElementById('modal-weekly-days-panel');
const cancelRecurrenceBtn = document.getElementById('cancel-recurrence-btn');
const saveRecurrenceBtn = document.getElementById('save-recurrence-btn');

let savedWeeklyDays = [];
let tempWeeklyDays = [];

// Referencias de los filtros en tiempo real
const searchTaskInput = document.getElementById('search-task');
const filterFileSelect = document.getElementById('filter-file');
const filterDateInput = document.getElementById('filter-date');
const clearFiltersBtn = document.getElementById('clear-filters-btn');

// Referencias de Etiquetas (Desplegables y Modales)
const taskTagTrigger = document.getElementById('task-tag-trigger');
const taskTagDropdown = document.getElementById('task-tag-dropdown');
const taskTagInput = document.getElementById('task-tag-value');
const taskTagPreviewDot = document.getElementById('task-tag-preview-dot');
const taskTagPreviewText = document.getElementById('task-tag-preview-text');

const filterTagTrigger = document.getElementById('filter-tag-trigger');
const filterTagDropdown = document.getElementById('filter-tag-dropdown');
const filterTagInput = document.getElementById('filter-tag-value');
const filterTagPreviewText = document.getElementById('filter-tag-preview-text');

const createTagModal = document.getElementById('create-tag-modal');
const createTagForm = document.getElementById('create-tag-form');
const newTagNameInput = document.getElementById('new-tag-name');
const newTagColorGrid = document.getElementById('new-tag-color-grid');
const newTagColorInput = document.getElementById('new-tag-color-value');
const cancelCreateTagBtn = document.getElementById('cancel-create-tag-btn');
const saveNewTagBtn = document.getElementById('save-new-tag-btn');

const deleteTagModal = document.getElementById('delete-tag-modal');
const confirmDeleteTagBtn = document.getElementById('confirm-delete-tag-btn');
const cancelDeleteTagBtn = document.getElementById('cancel-delete-tag-btn');
let tagToDeleteId = null;

// Referencias del Calendario Lateral
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonthName = document.getElementById('calendar-month-name');
const calendarYearInput = document.getElementById('calendar-year-input');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');

let currentCalendarDate = new Date();

// Referencias del Modal de borrado de tareas
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let taskToDeleteId = null; 
let fileToDeleteUrl = null; 

let currentUserId = null;
let allTasks = [];
let userTags = [];

// --- SISTEMA DE NOTIFICACIONES ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { toastNotification.classList.remove('show'); }, 3500);
}

// --- MODAL Y SELECTOR DE TAREAS PERIÓDICAS ---
function syncModalWeeklyButtons() {
    if (!modalWeeklyDaysPanel) return;
    modalWeeklyDaysPanel.querySelectorAll('.weekday-toggle-btn').forEach(btn => {
        const dayNum = parseInt(btn.getAttribute('data-day'), 10);
        btn.classList.toggle('active', tempWeeklyDays.includes(dayNum));
    });
}

function initRecurrenceModal() {
    if (!openRecurrenceModalBtn || !recurrenceModal) return;

    openRecurrenceModalBtn.addEventListener('click', () => {
        const currentType = taskRecurrenceInput.value || 'none';
        modalRecurrenceSelect.value = currentType;
        tempWeeklyDays = [...savedWeeklyDays];

        if (currentType === 'weekly') {
            modalWeeklyDaysPanel.classList.remove('hidden');
        } else {
            modalWeeklyDaysPanel.classList.add('hidden');
        }

        syncModalWeeklyButtons();
        recurrenceModal.classList.remove('hidden');
    });

    modalRecurrenceSelect.addEventListener('change', () => {
        if (modalRecurrenceSelect.value === 'weekly') {
            modalWeeklyDaysPanel.classList.remove('hidden');
        } else {
            modalWeeklyDaysPanel.classList.add('hidden');
        }
    });

    if (modalWeeklyDaysPanel) {
        modalWeeklyDaysPanel.querySelectorAll('.weekday-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dayNum = parseInt(btn.getAttribute('data-day'), 10);
                if (tempWeeklyDays.includes(dayNum)) {
                    tempWeeklyDays = tempWeeklyDays.filter(d => d !== dayNum);
                } else {
                    tempWeeklyDays.push(dayNum);
                }
                syncModalWeeklyButtons();
            });
        });
    }

    cancelRecurrenceBtn.addEventListener('click', () => {
        recurrenceModal.classList.add('hidden');
    });

    saveRecurrenceBtn.addEventListener('click', () => {
        const chosenType = modalRecurrenceSelect.value;
        if (chosenType === 'weekly' && tempWeeklyDays.length === 0) {
            showToast('Selecciona al menos un día de la semana', 'error');
            return;
        }

        taskRecurrenceInput.value = chosenType;
        savedWeeklyDays = chosenType === 'weekly' ? [...tempWeeklyDays] : [];
        updateRecurrencePreviewLabel();
        recurrenceModal.classList.add('hidden');
    });
}

function updateRecurrencePreviewLabel() {
    const val = taskRecurrenceInput.value;
    if (val === 'none') {
        taskRecurrencePreviewText.textContent = 'No repetir';
    } else if (val === 'daily') {
        taskRecurrencePreviewText.textContent = '1 vez al día';
    } else if (val === 'weekly') {
        const order = [1, 2, 3, 4, 5, 6, 0];
        const sortedLabels = order.filter(d => savedWeeklyDays.includes(d)).map(d => WEEKDAY_SHORT_NAMES[d]);
        taskRecurrencePreviewText.textContent = sortedLabels.length > 0
            ? `Semanal (${sortedLabels.join(',')})`
            : '1 vez a la semana';
    } else if (val === 'monthly') {
        taskRecurrencePreviewText.textContent = '1 vez al mes';
    } else if (val === 'yearly') {
        taskRecurrencePreviewText.textContent = '1 vez al año';
    }
}

function resetRecurrencePicker() {
    if (!taskRecurrenceInput) return;
    taskRecurrenceInput.value = 'none';
    savedWeeklyDays = [];
    tempWeeklyDays = [];
    updateRecurrencePreviewLabel();
}

// --- INICIALIZAR PALETA DE COLORES EN EL MODAL DE NUEVA ETIQUETA ---
function initNewTagColorGrid() {
    if (!newTagColorGrid) return;
    newTagColorGrid.innerHTML = '';

    Object.keys(TASK_COLORS).forEach(colorName => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `color-swatch-btn ${colorName === 'azul' ? 'selected' : ''}`;
        btn.style.backgroundColor = TASK_COLORS[colorName].bg;
        if (colorName === 'blanco' || colorName === 'amarillo') {
            btn.style.border = '1px solid #adb5bd';
        }
        btn.title = colorName.charAt(0).toUpperCase() + colorName.slice(1);

        btn.addEventListener('click', () => {
            newTagColorGrid.querySelectorAll('.color-swatch-btn').forEach(s => s.classList.remove('selected'));
            btn.classList.add('selected');
            newTagColorInput.value = colorName;
        });

        newTagColorGrid.appendChild(btn);
    });
}

// --- CARGAR ETIQUETAS DEL USUARIO ---
async function loadUserTags(userId) {
    const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        showToast('Error al cargar etiquetas', 'error');
        return;
    }

    userTags = data || [];
    renderTagDropdowns();
}

// --- RENDERIZAR MENÚS DESPLEGABLES DE ETIQUETAS ---
function renderTagDropdowns() {
    if (taskTagDropdown) {
        taskTagDropdown.innerHTML = '';

        const addNewBtn = document.createElement('button');
        addNewBtn.type = 'button';
        addNewBtn.className = 'tag-add-new-btn';
        addNewBtn.innerHTML = '➕ Añadir nueva etiqueta';
        addNewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            taskTagDropdown.classList.add('hidden');
            openCreateTagModal();
        });
        taskTagDropdown.appendChild(addNewBtn);

        const noneItem = document.createElement('button');
        noneItem.type = 'button';
        noneItem.className = `tag-option-item ${taskTagInput.value === '' ? 'selected' : ''}`;
        noneItem.innerHTML = `
            <span class="tag-color-dot" style="background-color: #ffffff; border: 1px solid #ccc;"></span>
            <span>Sin etiqueta</span>
        `;
        noneItem.addEventListener('click', () => {
            selectCreationTag(null);
            taskTagDropdown.classList.add('hidden');
        });
        taskTagDropdown.appendChild(noneItem);

        userTags.forEach(tag => {
            const colorStyle = TASK_COLORS[tag.color] || TASK_COLORS['blanco'];
            
            const row = document.createElement('div');
            row.className = `tag-option-row ${taskTagInput.value === tag.id ? 'selected' : ''}`;

            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'tag-option-item';
            itemBtn.innerHTML = `
                <span class="tag-color-dot" style="background-color: ${colorStyle.bg}; border: 1px solid ${colorStyle.border};"></span>
                <span>${tag.name}</span>
            `;
            itemBtn.addEventListener('click', () => {
                selectCreationTag(tag);
                taskTagDropdown.classList.add('hidden');
            });

            const deleteTagBtn = document.createElement('button');
            deleteTagBtn.type = 'button';
            deleteTagBtn.className = 'tag-delete-btn';
            deleteTagBtn.title = 'Eliminar etiqueta';
            deleteTagBtn.textContent = '🗑️';
            deleteTagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                taskTagDropdown.classList.add('hidden');
                openDeleteTagModal(tag.id);
            });

            row.appendChild(itemBtn);
            row.appendChild(deleteTagBtn);
            taskTagDropdown.appendChild(row);
        });
    }

    if (filterTagDropdown) {
        filterTagDropdown.innerHTML = '';

        const allItem = document.createElement('button');
        allItem.type = 'button';
        allItem.className = `tag-option-item ${filterTagInput.value === 'all' ? 'selected' : ''}`;
        allItem.innerHTML = `<span>🏷️ Etiquetas (Todas)</span>`;
        allItem.addEventListener('click', () => {
            filterTagInput.value = 'all';
            filterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';
            filterTagDropdown.classList.add('hidden');
            renderTagDropdowns();
            applyFiltersAndRender();
        });
        filterTagDropdown.appendChild(allItem);

        const untaggedItem = document.createElement('button');
        untaggedItem.type = 'button';
        untaggedItem.className = `tag-option-item ${filterTagInput.value === 'none' ? 'selected' : ''}`;
        untaggedItem.innerHTML = `
            <span class="tag-color-dot" style="background-color: #ffffff; border: 1px solid #ccc;"></span>
            <span>Sin etiqueta</span>
        `;
        untaggedItem.addEventListener('click', () => {
            filterTagInput.value = 'none';
            filterTagPreviewText.textContent = '🏷️ Sin etiqueta';
            filterTagDropdown.classList.add('hidden');
            renderTagDropdowns();
            applyFiltersAndRender();
        });
        filterTagDropdown.appendChild(untaggedItem);

        userTags.forEach(tag => {
            const colorStyle = TASK_COLORS[tag.color] || TASK_COLORS['blanco'];
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `tag-option-item ${filterTagInput.value === tag.id ? 'selected' : ''}`;
            item.innerHTML = `
                <span class="tag-color-dot" style="background-color: ${colorStyle.bg}; border: 1px solid ${colorStyle.border};"></span>
                <span>${tag.name}</span>
            `;
            item.addEventListener('click', () => {
                filterTagInput.value = tag.id;
                filterTagPreviewText.textContent = `🏷️ ${tag.name}`;
                filterTagDropdown.classList.add('hidden');
                renderTagDropdowns();
                applyFiltersAndRender();
            });
            filterTagDropdown.appendChild(item);
        });
    }
}

function selectCreationTag(tag) {
    if (!tag) {
        taskTagInput.value = '';
        taskTagPreviewDot.style.backgroundColor = '#ffffff';
        taskTagPreviewDot.style.border = '1px solid #ccc';
        taskTagPreviewText.textContent = 'Sin etiqueta';
    } else {
        const colorStyle = TASK_COLORS[tag.color] || TASK_COLORS['blanco'];
        taskTagInput.value = tag.id;
        taskTagPreviewDot.style.backgroundColor = colorStyle.bg;
        taskTagPreviewDot.style.border = `1px solid ${colorStyle.border}`;
        taskTagPreviewText.textContent = tag.name;
    }
    renderTagDropdowns();
}

if (taskTagTrigger) {
    taskTagTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (filterTagDropdown) filterTagDropdown.classList.add('hidden');
        taskTagDropdown.classList.toggle('hidden');
    });
}

if (filterTagTrigger) {
    filterTagTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (taskTagDropdown) taskTagDropdown.classList.add('hidden');
        filterTagDropdown.classList.toggle('hidden');
    });
}

document.addEventListener('click', () => {
    if (taskTagDropdown) taskTagDropdown.classList.add('hidden');
    if (filterTagDropdown) filterTagDropdown.classList.add('hidden');
});

// --- MODAL PARA CREAR NUEVA ETIQUETA ---
function openCreateTagModal() {
    createTagForm.reset();
    newTagColorInput.value = 'azul';
    initNewTagColorGrid();
    createTagModal.classList.remove('hidden');
    setTimeout(() => newTagNameInput.focus(), 50);
}

cancelCreateTagBtn.addEventListener('click', () => {
    createTagModal.classList.add('hidden');
});

createTagForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tagName = newTagNameInput.value.trim();
    const tagColor = newTagColorInput.value || 'azul';

    if (!tagName || !currentUserId) return;

    saveNewTagBtn.disabled = true;
    saveNewTagBtn.textContent = 'Guardando...';

    try {
        const { data: createdTag, error } = await supabase
            .from('tags')
            .insert([{
                name: tagName,
                color: tagColor,
                user_id: currentUserId
            }])
            .select()
            .single();

        if (error) throw error;

        showToast('¡Etiqueta creada con éxito!', 'success');
        createTagModal.classList.add('hidden');

        await loadUserTags(currentUserId);
        if (createdTag) {
            selectCreationTag(createdTag);
        }
    } catch (err) {
        showToast('Error al crear etiqueta: ' + err.message, 'error');
    } finally {
        saveNewTagBtn.disabled = false;
        saveNewTagBtn.textContent = 'Crear Etiqueta';
    }
});

// --- MODAL PARA ELIMINAR ETIQUETA ---
function openDeleteTagModal(tagId) {
    tagToDeleteId = tagId;
    deleteTagModal.classList.remove('hidden');
}

cancelDeleteTagBtn.addEventListener('click', () => {
    deleteTagModal.classList.add('hidden');
    tagToDeleteId = null;
});

confirmDeleteTagBtn.addEventListener('click', async () => {
    if (!tagToDeleteId) return;

    try {
        const { error } = await supabase
            .from('tags')
            .delete()
            .eq('id', tagToDeleteId);

        if (error) throw error;

        showToast('Etiqueta eliminada', 'success');

        if (taskTagInput.value === tagToDeleteId) {
            selectCreationTag(null);
        }

        if (filterTagInput.value === tagToDeleteId) {
            filterTagInput.value = 'all';
            filterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';
        }

        await loadUserTags(currentUserId);
        await loadTasks(currentUserId);
    } catch (err) {
        showToast('Error al eliminar etiqueta: ' + err.message, 'error');
    } finally {
        deleteTagModal.classList.add('hidden');
        tagToDeleteId = null;
    }
});

// --- 1. VERIFICAR SESIÓN Y CARGAR PERFIL ---
async function checkAuthAndLoadProfile() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session || sessionError) {
        window.location.href = 'index.html';
        return null;
    }

    currentUserId = session.user.id;
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('username, profile_picture_url')
        .eq('id', currentUserId)
        .single();

    if (userData && !userError) {
        userNameSpan.textContent = userData.username;
        
        const avatarPlaceholder = document.getElementById('avatar-placeholder');
        const userAvatar = document.getElementById('user-avatar');

        if (userData.profile_picture_url) {
            userAvatar.src = userData.profile_picture_url;
            userAvatar.classList.remove('hidden');
            avatarPlaceholder.classList.add('hidden');
        } else {
            avatarPlaceholder.textContent = userData.username.charAt(0);
            userAvatar.classList.add('hidden');
            avatarPlaceholder.classList.remove('hidden');
        }
    }
    return currentUserId; 
}

// --- 2. MENÚ DESPLEGABLE PERFIL ---
profileTrigger.addEventListener('click', () => {
    profileDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
    if (!profileTrigger.contains(event.target) && !profileDropdown.contains(event.target)) {
        profileDropdown.classList.add('hidden');
    }
});

// --- 3. CERRAR SESIÓN ---
logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (!error) window.location.href = 'index.html';
});

// --- 4. ACTUALIZAR NOMBRE DE ARCHIVO ---
taskFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        fileNameDisplay.textContent = e.target.files[0].name;
    } else {
        fileNameDisplay.textContent = 'Ningún archivo...';
    }
});

// --- 5. BORRAR ARCHIVO DE STORAGE ---
async function deleteFileFromStorage(fileUrl) {
    if (!fileUrl) return;
    const urlParts = fileUrl.split('/task_files/');
    if (urlParts.length === 2) {
        const filePath = urlParts[1];
        await supabase.storage.from('task_files').remove([filePath]);
    }
}

// --- 6. CARGAR TAREAS (CON RELACIÓN A ETIQUETAS Y SINCRONIZACIÓN DE PRÓXIMA FECHA) ---
async function loadTasks(userId) {
    const { data: tasks, error } = await supabase
        .from('personal_tasks')
        .select('*, tags(id, name, color)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }); 

    if (error) {
        showToast('Error al cargar tareas', 'error');
        return;
    }
    
    allTasks = await syncRecurringTasksToUpcomingDates(tasks || []);
    applyFiltersAndRender();
    renderCalendar();
}

// --- 7. MINI-CALENDARIO ---
function renderCalendar() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    calendarMonthName.textContent = monthNames[month];
    if (calendarYearInput && document.activeElement !== calendarYearInput) {
        calendarYearInput.value = year;
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const adjustedFirstDay = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const todayStr = formatLocalDate(new Date());
    const selectedDateFilter = filterDateInput.value;

    for (let i = 0; i < adjustedFirstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= totalDays; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';

        const formattedMonth = String(month + 1).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        const dateString = `${year}-${formattedMonth}-${formattedDay}`;

        dayCell.textContent = day;

        if (dateString === todayStr) {
            dayCell.classList.add('today');
        }

        if (dateString === selectedDateFilter) {
            dayCell.classList.add('selected');
        }

        const hasTaskOnThisDay = allTasks.some(task => doesTaskOccurOnDate(task, dateString));
        if (hasTaskOnThisDay) {
            dayCell.classList.add('has-task');
        }

        dayCell.addEventListener('click', () => {
            if (filterDateInput.value === dateString) {
                filterDateInput.value = '';
            } else {
                filterDateInput.value = dateString;
            }
            applyFiltersAndRender();
            renderCalendar();
        });

        calendarGrid.appendChild(dayCell);
    }
}

if (calendarYearInput) {
    calendarYearInput.addEventListener('input', (e) => {
        const typedYear = parseInt(e.target.value);
        if (typedYear >= 1970 && typedYear <= 2100) {
            currentCalendarDate.setFullYear(typedYear);
            renderCalendar();
        }
    });
}

if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
    });
}

// --- 8. FILTRADO ---
function applyFiltersAndRender() {
    const searchTerm = searchTaskInput.value.toLowerCase().trim();
    const fileFilter = filterFileSelect.value;
    const tagFilter = filterTagInput ? filterTagInput.value : 'all';
    const dateFilter = filterDateInput.value;

    const filteredTasks = allTasks.filter(task => {
        const matchesTitle = task.title.toLowerCase().includes(searchTerm);

        let matchesFile = true;
        if (fileFilter === 'with') {
            matchesFile = Boolean(task.file_url);
        } else if (fileFilter === 'without') {
            matchesFile = !task.file_url;
        }

        let matchesTag = true;
        if (tagFilter === 'none') {
            matchesTag = !task.tag_id;
        } else if (tagFilter !== 'all') {
            matchesTag = task.tag_id === tagFilter;
        }

        let matchesDate = true;
        if (dateFilter) {
            matchesDate = doesTaskOccurOnDate(task, dateFilter);
        }

        return matchesTitle && matchesFile && matchesTag && matchesDate;
    });

    renderTasks(filteredTasks);
}

function renderTasks(tasks) {
    taskListContainer.innerHTML = ''; 

    if (tasks.length === 0) {
        taskListContainer.innerHTML = '<p class="empty-state">No se encontraron tareas con los filtros seleccionados.</p>';
        return;
    }

    const todayStr = formatLocalDate(new Date());

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `task-item ${task.is_completed ? 'completed' : ''}`;
        
        const colorKey = (task.tags && task.tags.color) ? task.tags.color : 'blanco';
        const styleConfig = TASK_COLORS[colorKey] || TASK_COLORS['blanco'];
        
        taskElement.style.backgroundColor = styleConfig.bg;
        taskElement.style.color = styleConfig.text;
        taskElement.style.borderLeft = `4px solid ${styleConfig.border}`;

        let tagBadgeMarkup = '';
        if (task.tags && task.tags.name) {
            tagBadgeMarkup = `
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.08); color: inherit; border: 1px solid rgba(0,0,0,0.15);">
                    🏷️ ${task.tags.name}
                </span>
            `;
        }

        let recurrenceBadgeMarkup = '';
        const recText = getRecurrenceBadgeText(task);
        if (recText) {
            recurrenceBadgeMarkup = `
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.08); color: inherit; border: 1px solid rgba(0,0,0,0.15);">
                    ${recText}
                </span>
            `;
        }

        let dueDateMarkup = '';
        if (task.due_date) {
            const isOverdue = task.due_date < todayStr && !task.is_completed;
            const dateStyle = isOverdue 
                ? 'background: #ffe6e6; color: #dc3545; border: 1px solid #f5c6cb;' 
                : 'background: rgba(0,0,0,0.05); color: inherit; border: 1px solid rgba(0,0,0,0.1);';
            
            dueDateMarkup = `
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; ${dateStyle}" title="${isOverdue ? '¡Fecha límite vencida!' : 'Próxima fecha'}">
                    📅 ${task.due_date} ${isOverdue ? '⚠️' : ''}
                </span>
            `;
        }

        taskElement.innerHTML = `
            <div class="task-content" style="color: inherit;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                    <h4 class="task-title" style="margin: 0; color: inherit;">${task.title}</h4>
                    ${tagBadgeMarkup}
                    ${recurrenceBadgeMarkup}
                    ${dueDateMarkup}
                </div>
                ${task.description ? `<p style="color: inherit; opacity: 0.85;">${task.description}</p>` : ''}
                ${task.file_url ? `
                    <div style="margin-top: 8px;">
                        <a href="${task.file_url}" target="_blank" style="font-size: 13px; color: inherit; text-decoration: underline; opacity: 0.9;">
                            📎 Descargar: ${task.file_name}
                        </a>
                    </div>
                ` : ''}
            </div>
            <div class="task-actions">
                <label class="btn-icon" title="${task.file_url ? 'Sustituir archivo' : 'Añadir archivo'}" style="cursor:pointer; color: inherit;">
                    🔄
                    <input type="file" class="hidden-replace-input" style="display:none;">
                </label>
                
                <button class="btn-icon complete-btn" title="${task.recurrence_type && task.recurrence_type !== 'none' ? 'Completar y programar siguiente fecha' : (task.is_completed ? 'Desmarcar' : 'Completar')}" style="color: inherit;">
                    ${task.is_completed ? '✅' : '⬜'}
                </button>
                <button class="btn-icon delete-btn" title="Borrar" style="color: inherit;">🗑️</button>
            </div>
        `;

        const completeBtn = taskElement.querySelector('.complete-btn');
        completeBtn.addEventListener('click', () => toggleTaskCompletion(task));

        const deleteBtn = taskElement.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => openDeleteModal(task.id, task.file_url));

        const replaceInput = taskElement.querySelector('.hidden-replace-input');
        replaceInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                replaceTaskFile(task.id, task.file_url, e.target.files[0]);
            }
        });

        taskListContainer.appendChild(taskElement);
    });
}

// --- 9. EVENTOS DE FILTROS ---
searchTaskInput.addEventListener('input', applyFiltersAndRender);
filterFileSelect.addEventListener('change', applyFiltersAndRender);

filterDateInput.addEventListener('change', () => {
    applyFiltersAndRender();
    renderCalendar();
});

clearFiltersBtn.addEventListener('click', () => {
    searchTaskInput.value = '';
    filterFileSelect.value = 'all';
    
    if (filterTagInput) filterTagInput.value = 'all';
    if (filterTagPreviewText) filterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';
    renderTagDropdowns();

    filterDateInput.value = '';
    applyFiltersAndRender();
    renderCalendar();
});

// --- 10. CREAR NUEVA TAREA ---
createTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const recurrenceType = taskRecurrenceInput ? taskRecurrenceInput.value : 'none';
    if (recurrenceType === 'weekly' && savedWeeklyDays.length === 0) {
        showToast('Selecciona al menos un día de la semana para repetir', 'error');
        return;
    }

    const submitBtn = createTaskForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Subiendo...';
    submitBtn.disabled = true;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const title = taskTitleInput.value;
    const description = taskDescInput.value;
    const tagId = taskTagInput && taskTagInput.value ? taskTagInput.value : null;
    const todayStr = formatLocalDate(new Date());
    
    let dueDate = taskDateInput.value || null;
    let anchorDate = null;

    if (recurrenceType !== 'none') {
        const baseDate = dueDate || todayStr;
        if (recurrenceType === 'weekly') {
            dueDate = getNextWeeklyDate(baseDate, savedWeeklyDays, true);
        } else {
            dueDate = baseDate;
        }
        anchorDate = dueDate;
        dueDate = getUpcomingDate(dueDate, recurrenceType, savedWeeklyDays, anchorDate, todayStr);
    }

    const file = taskFileInput.files[0];
    let fileUrl = null;
    let fileName = null;

    if (file) {
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${session.user.id}/${uniqueFileName}`; 

        const { error: uploadError } = await supabase.storage
            .from('task_files')
            .upload(filePath, file);

        if (uploadError) {
            showToast('Error al subir el archivo', 'error');
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
            return; 
        }

        const { data: publicUrlData } = supabase.storage
            .from('task_files')
            .getPublicUrl(filePath);
        
        fileUrl = publicUrlData.publicUrl;
        fileName = file.name;
    }

    const { error: insertError } = await supabase
        .from('personal_tasks')
        .insert([{ 
            user_id: session.user.id, 
            title: title, 
            description: description || null,
            tag_id: tagId,
            due_date: dueDate,
            recurrence_type: recurrenceType,
            recurrence_days: recurrenceType === 'weekly' ? [...savedWeeklyDays] : null,
            recurrence_anchor_date: anchorDate,
            file_url: fileUrl,
            file_name: fileName
        }]);

    if (insertError) {
        showToast('Error al crear la tarea: ' + insertError.message, 'error');
    } else {
        showToast('Tarea añadida con éxito', 'success');
        createTaskForm.reset();
        fileNameDisplay.textContent = 'Ningún archivo...'; 
        selectCreationTag(null);
        resetRecurrencePicker();
        loadTasks(session.user.id);
    }

    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
});

// --- 11. SUSTITUIR ARCHIVO ---
async function replaceTaskFile(taskId, oldFileUrl, newFile) {
    showToast('Subiendo nuevo archivo...', 'success');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const fileExt = newFile.name.split('.').pop();
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${session.user.id}/${uniqueFileName}`; 

    const { error: uploadError } = await supabase.storage
        .from('task_files')
        .upload(filePath, newFile);

    if (uploadError) {
        showToast('Error al subir el nuevo archivo', 'error');
        return;
    }

    const { data: publicUrlData } = supabase.storage
        .from('task_files')
        .getPublicUrl(filePath);
    const newFileUrl = publicUrlData.publicUrl;
    const newFileName = newFile.name;

    if (oldFileUrl) {
        await deleteFileFromStorage(oldFileUrl);
    }

    const { error: updateError } = await supabase
        .from('personal_tasks')
        .update({ 
            file_url: newFileUrl, 
            file_name: newFileName 
        })
        .eq('id', taskId);

    if (updateError) {
        showToast('Error al actualizar la tarea', 'error');
    } else {
        showToast('Archivo sustituido correctamente', 'success');
        loadTasks(session.user.id);
    }
}

// --- 12. COMPLETAR TAREA (CON REPROGRAMACIÓN PERIÓDICA) ---
async function toggleTaskCompletion(task) {
    const recType = task.recurrence_type || 'none';

    if (recType !== 'none') {
        const todayStr = formatLocalDate(new Date());
        let nextDate = calculateNextOccurrence(
            task.due_date,
            recType,
            task.recurrence_days,
            task.recurrence_anchor_date
        );
        nextDate = getUpcomingDate(
            nextDate,
            recType,
            task.recurrence_days,
            task.recurrence_anchor_date,
            todayStr
        );

        const { error } = await supabase
            .from('personal_tasks')
            .update({
                due_date: nextDate,
                is_completed: false
            })
            .eq('id', task.id);

        if (error) {
            showToast('Error al reprogramar la tarea periódica', 'error');
        } else {
            showToast(`🔁 Tarea completada. Próxima fecha: ${nextDate}`, 'success');
            const { data: { session } } = await supabase.auth.getSession();
            loadTasks(session.user.id);
        }
        return;
    }

    const { error } = await supabase
        .from('personal_tasks')
        .update({ is_completed: !task.is_completed })
        .eq('id', task.id);

    if (!error) {
        const { data: { session } } = await supabase.auth.getSession();
        loadTasks(session.user.id);
    }
}

// --- 13. BORRAR TAREA ---
function openDeleteModal(taskId, fileUrl) {
    taskToDeleteId = taskId;
    fileToDeleteUrl = fileUrl; 
    deleteModal.classList.remove('hidden');
}

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    taskToDeleteId = null;
    fileToDeleteUrl = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!taskToDeleteId) return;

    if (fileToDeleteUrl) {
        await deleteFileFromStorage(fileToDeleteUrl);
    }

    const { error: deleteError } = await supabase
        .from('personal_tasks')
        .delete()
        .eq('id', taskToDeleteId);

    if (deleteError) {
        showToast('Error al borrar la tarea', 'error');
    } else {
        showToast('Tarea borrada', 'success');
        const { data: { session } } = await supabase.auth.getSession();
        loadTasks(session.user.id);
    }

    deleteModal.classList.add('hidden');
    taskToDeleteId = null;
    fileToDeleteUrl = null;
});

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    initRecurrenceModal();
    initNewTagColorGrid();
    const userId = await checkAuthAndLoadProfile();
    if (userId) {
        await loadUserTags(userId);
        await loadTasks(userId);
    }
});