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
    const targetMonth = anchor.getMonth();
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

async function syncRecurringGroupTasksToUpcomingDates(tasks) {
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
                    .from('group_tasks')
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

// --- REFERENCIAS HTML GENERALES ---
const userNameSpan = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const profileTrigger = document.getElementById('profile-trigger');
const profileDropdown = document.getElementById('profile-dropdown');
const toastNotification = document.getElementById('toast-notification');

// Referencias del Listado y Paneles
const groupsListContainer = document.getElementById('groups-list');
const groupDetailPanel = document.getElementById('group-detail-panel');
const noGroupSelectedPanel = document.getElementById('no-group-selected');
const selectedGroupName = document.getElementById('selected-group-name');
const selectedGroupDesc = document.getElementById('selected-group-desc');
const adminGroupActions = document.getElementById('admin-group-actions');

// Referencias del Calendario Lateral de Grupos
const calendarWrapperCard = document.getElementById('calendar-wrapper-card');
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonthName = document.getElementById('calendar-month-name');
const calendarYearInput = document.getElementById('calendar-year-input');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');

let currentCalendarDate = new Date();

// Referencias de Múltiples Archivos en Grupo (Botón y Modal)
const openGroupFilesModalBtn = document.getElementById('open-group-files-modal-btn');
const groupFilesCountDisplay = document.getElementById('group-files-count-display');
const groupTaskFilesModal = document.getElementById('group-task-files-modal');
const groupTaskFileInput = document.getElementById('group-task-file-input');
const groupModalSelectedFilesList = document.getElementById('group-modal-selected-files-list');
const groupCancelFilesModalBtn = document.getElementById('group-cancel-files-modal-btn');
const groupAcceptFilesModalBtn = document.getElementById('group-accept-files-modal-btn');
const groupTriggerSelectFileBtn = document.getElementById('group-trigger-select-file-btn');

let confirmedGroupPendingFiles = [];
let tempGroupPendingFiles = [];
let editingGroupTaskForFiles = null;

// Referencias de Periodicidad en Grupo (Botón y Modal)
const openGroupRecurrenceModalBtn = document.getElementById('open-group-recurrence-modal-btn');
const groupTaskRecurrenceInput = document.getElementById('group-task-recurrence-value');
const groupTaskRecurrencePreviewText = document.getElementById('group-task-recurrence-preview-text');

const groupRecurrenceModal = document.getElementById('group-recurrence-modal');
const groupModalRecurrenceSelect = document.getElementById('group-modal-recurrence-select');
const groupModalWeeklyDaysPanel = document.getElementById('group-modal-weekly-days-panel');
const groupCancelRecurrenceBtn = document.getElementById('group-cancel-recurrence-btn');
const groupSaveRecurrenceBtn = document.getElementById('group-save-recurrence-btn');

let savedGroupWeeklyDays = [];
let tempGroupWeeklyDays = [];

// Modal de eliminación de tareas
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let taskToDelete = null;

// Modal de expulsión de miembros
const kickMemberModal = document.getElementById('kick-member-modal');
const confirmKickBtn = document.getElementById('confirm-kick-btn');
const cancelKickBtn = document.getElementById('cancel-kick-btn');
let userIdToKick = null;

// Modal de eliminación de grupo
const openDeleteGroupBtn = document.getElementById('open-delete-group-btn');
const deleteGroupModal = document.getElementById('delete-group-modal');
const confirmDeleteGroupBtn = document.getElementById('confirm-delete-group-btn');
const cancelDeleteGroupBtn = document.getElementById('cancel-delete-group-btn');

// Referencias de Etiquetas de Grupo (Desplegables y Modales)
const groupTaskTagTrigger = document.getElementById('group-task-tag-trigger');
const groupTaskTagDropdown = document.getElementById('group-task-tag-dropdown');
const groupTaskTagInput = document.getElementById('group-task-tag-value');
const groupTaskTagPreviewDot = document.getElementById('group-task-tag-preview-dot');
const groupTaskTagPreviewText = document.getElementById('group-task-tag-preview-text');

const groupFilterTagTrigger = document.getElementById('group-filter-tag-trigger');
const groupFilterTagDropdown = document.getElementById('group-filter-tag-dropdown');
const groupFilterTagInput = document.getElementById('group-filter-tag-value');
const groupFilterTagPreviewText = document.getElementById('group-filter-tag-preview-text');

const groupCreateTagModal = document.getElementById('group-create-tag-modal');
const groupCreateTagForm = document.getElementById('group-create-tag-form');
const groupNewTagNameInput = document.getElementById('group-new-tag-name');
const groupNewTagColorGrid = document.getElementById('group-new-tag-color-grid');
const groupNewTagColorInput = document.getElementById('group-new-tag-color-value');
const groupCancelCreateTagBtn = document.getElementById('group-cancel-create-tag-btn');
const groupSaveNewTagBtn = document.getElementById('group-save-new-tag-btn');

const groupDeleteTagModal = document.getElementById('group-delete-tag-modal');
const groupConfirmDeleteTagBtn = document.getElementById('group-confirm-delete-tag-btn');
const groupCancelDeleteTagBtn = document.getElementById('group-cancel-delete-tag-btn');
let groupTagToDeleteId = null;

// Tareas del grupo y referencias a sus filtros
const groupTaskForm = document.getElementById('group-task-form');
const groupTaskTitle = document.getElementById('group-task-title');
const groupTaskDesc = document.getElementById('group-task-desc');
const groupTaskAssignee = document.getElementById('group-task-assignee');
const groupTaskDateInput = document.getElementById('group-task-date');
const groupTasksList = document.getElementById('group-tasks-list');
const addGroupTaskBtn = document.getElementById('add-group-task-btn');

const groupSearchTaskInput = document.getElementById('group-search-task');
const groupFilterFileSelect = document.getElementById('group-filter-file');
const groupFilterDateInput = document.getElementById('group-filter-date');
const groupClearFiltersBtn = document.getElementById('group-clear-filters-btn');

// Modales de grupo
const createGroupModal = document.getElementById('create-group-modal');
const openGroupModalBtn = document.getElementById('open-group-modal-btn');
const cancelGroupBtn = document.getElementById('cancel-group-btn');
const createGroupForm = document.getElementById('create-group-form');
const groupTitleInput = document.getElementById('group-title');
const groupDescInput = document.getElementById('group-desc');
const saveGroupBtn = document.getElementById('save-group-btn');

const editGroupModal = document.getElementById('edit-group-modal');
const openEditGroupBtn = document.getElementById('open-edit-group-btn');
const cancelEditGroup = document.getElementById('cancel-edit-group');
const editGroupForm = document.getElementById('edit-group-form');
const editGroupTitle = document.getElementById('edit-group-title');
const editGroupDesc = document.getElementById('edit-group-desc');

const addMemberModal = document.getElementById('add-member-modal');
const openAddMemberBtn = document.getElementById('open-add-member-btn');
const cancelAddMember = document.getElementById('cancel-add-member');
const addMemberForm = document.getElementById('add-member-form');
const memberEmailInput = document.getElementById('member-email');
const currentMembersList = document.getElementById('current-members-list');

let currentUserId = null;
let currentGroup = null; 
let currentGroupMembers = []; 
let allGroupTasks = []; 
let groupTags = [];

// --- NOTIFICACIONES TOAST ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { toastNotification.classList.remove('show'); }, 3500);
}

// --- MODAL Y GESTIÓN DE MÚLTIPLES ARCHIVOS EN GRUPO (CREACIÓN Y EDICIÓN) ---
function updateGroupFilesCountDisplay() {
    if (!groupFilesCountDisplay) return;
    if (confirmedGroupPendingFiles.length === 0) {
        groupFilesCountDisplay.textContent = 'Ningún archivo...';
    } else if (confirmedGroupPendingFiles.length === 1) {
        groupFilesCountDisplay.textContent = `1 archivo listo (${confirmedGroupPendingFiles[0].name})`;
    } else {
        groupFilesCountDisplay.textContent = `${confirmedGroupPendingFiles.length} archivos listos`;
    }
}

function renderGroupTempFilesList() {
    if (!groupModalSelectedFilesList) return;
    groupModalSelectedFilesList.innerHTML = '';

    if (tempGroupPendingFiles.length === 0) {
        groupModalSelectedFilesList.innerHTML = '<li style="padding: 12px; text-align: center; color: #888; font-size: 13px; font-style: italic;">Ningún archivo seleccionado todavía.</li>';
        return;
    }

    tempGroupPendingFiles.forEach((item, index) => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; color: #333; background: #fff;';

        const nameSpan = document.createElement('span');
        const badgeLabel = item.kind === 'existing' ? ' (guardado)' : '';
        nameSpan.textContent = `📄 ${item.name}${badgeLabel}`;
        nameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 85%;';
        nameSpan.title = item.name;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Quitar archivo';
        removeBtn.style.cssText = 'background: none; border: none; color: #dc3545; font-weight: bold; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px;';
        removeBtn.addEventListener('click', () => {
            tempGroupPendingFiles.splice(index, 1);
            renderGroupTempFilesList();
        });

        li.appendChild(nameSpan);
        li.appendChild(removeBtn);
        groupModalSelectedFilesList.appendChild(li);
    });
}

function openGroupFilesModalForCreate() {
    editingGroupTaskForFiles = null;
    tempGroupPendingFiles = confirmedGroupPendingFiles.map(file => ({
        kind: 'new',
        file,
        name: file.name
    }));
    renderGroupTempFilesList();
    groupTaskFilesModal.classList.remove('hidden');
}

function openGroupFilesModalForTask(task) {
    editingGroupTaskForFiles = task;
    const existingFiles = Array.isArray(task.files) ? task.files : [];
    tempGroupPendingFiles = existingFiles.map(rec => ({
        kind: 'existing',
        record: rec,
        name: rec.name
    }));
    renderGroupTempFilesList();
    groupTaskFilesModal.classList.remove('hidden');
}

function closeGroupFilesModal() {
    tempGroupPendingFiles = [];
    editingGroupTaskForFiles = null;
    if (groupTaskFileInput) groupTaskFileInput.value = '';
    renderGroupTempFilesList();
    groupTaskFilesModal.classList.add('hidden');
}

function initGroupFilesModal() {
    if (!openGroupFilesModalBtn || !groupTaskFilesModal) return;

    openGroupFilesModalBtn.addEventListener('click', () => {
        openGroupFilesModalForCreate();
    });

    groupTriggerSelectFileBtn.addEventListener('click', () => {
        groupTaskFileInput.value = '';
        groupTaskFileInput.click();
    });

    groupTaskFileInput.addEventListener('change', (e) => {
        const pickedFiles = Array.from(e.target.files || []);
        if (pickedFiles.length === 0) return;

        pickedFiles.forEach(file => {
            const exists = tempGroupPendingFiles.some(item => {
                if (item.kind === 'new') {
                    return (
                        item.file.name === file.name &&
                        item.file.size === file.size &&
                        item.file.lastModified === file.lastModified
                    );
                }
                return item.record.name === file.name;
            });

            if (!exists) {
                tempGroupPendingFiles.push({
                    kind: 'new',
                    file,
                    name: file.name
                });
            }
        });

        renderGroupTempFilesList();
    });

    groupAcceptFilesModalBtn.addEventListener('click', async () => {
        if (editingGroupTaskForFiles) {
            await saveEditedGroupTaskFiles(editingGroupTaskForFiles, [...tempGroupPendingFiles]);
            closeGroupFilesModal();
            return;
        }

        confirmedGroupPendingFiles = tempGroupPendingFiles
            .filter(item => item.kind === 'new')
            .map(item => item.file);
        updateGroupFilesCountDisplay();
        closeGroupFilesModal();
    });

    groupCancelFilesModalBtn.addEventListener('click', () => {
        closeGroupFilesModal();
    });
}

function resetGroupPendingFiles() {
    confirmedGroupPendingFiles = [];
    tempGroupPendingFiles = [];
    editingGroupTaskForFiles = null;
    if (groupTaskFileInput) groupTaskFileInput.value = '';
    updateGroupFilesCountDisplay();
    renderGroupTempFilesList();
}

// --- HELPERS DE STORAGE PARA ARCHIVOS DE GRUPO ---
function extractGroupStoragePath(fileRecord) {
    if (!fileRecord) return null;
    if (fileRecord.path) return fileRecord.path;
    if (fileRecord.url) {
        const parts = fileRecord.url.split('/group-files/');
        if (parts.length === 2) return parts[1];
    }
    return null;
}

async function deleteGroupFilesFromStorage(fileRecords) {
    if (!Array.isArray(fileRecords) || fileRecords.length === 0) return;
    const paths = fileRecords
        .map(extractGroupStoragePath)
        .filter(Boolean);

    if (paths.length > 0) {
        await supabase.storage.from('group-files').remove(paths);
    }
}

async function uploadSingleGroupFileToStorage(groupId, file) {
    const fileExt = file.name.split('.').pop();
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${groupId}/${uniqueFileName}`;

    const { error: uploadError } = await supabase.storage
        .from('group-files')
        .upload(filePath, file);

    if (uploadError) {
        throw new Error(`Error al subir "${file.name}"`);
    }

    const { data: publicUrlData } = supabase.storage
        .from('group-files')
        .getPublicUrl(filePath);

    return {
        name: file.name,
        url: publicUrlData.publicUrl,
        path: filePath
    };
}

// --- MODAL Y SELECTOR DE TAREAS PERIÓDICAS DE GRUPO ---
function syncGroupModalWeeklyButtons() {
    if (!groupModalWeeklyDaysPanel) return;
    groupModalWeeklyDaysPanel.querySelectorAll('.weekday-toggle-btn').forEach(btn => {
        const dayNum = parseInt(btn.getAttribute('data-day'), 10);
        btn.classList.toggle('active', tempGroupWeeklyDays.includes(dayNum));
    });
}

function initGroupRecurrenceModal() {
    if (!openGroupRecurrenceModalBtn || !groupRecurrenceModal) return;

    openGroupRecurrenceModalBtn.addEventListener('click', () => {
        const currentType = groupTaskRecurrenceInput.value || 'none';
        groupModalRecurrenceSelect.value = currentType;
        tempGroupWeeklyDays = [...savedGroupWeeklyDays];

        if (currentType === 'weekly') {
            groupModalWeeklyDaysPanel.classList.remove('hidden');
        } else {
            groupModalWeeklyDaysPanel.classList.add('hidden');
        }

        syncGroupModalWeeklyButtons();
        groupRecurrenceModal.classList.remove('hidden');
    });

    groupModalRecurrenceSelect.addEventListener('change', () => {
        if (groupModalRecurrenceSelect.value === 'weekly') {
            groupModalWeeklyDaysPanel.classList.remove('hidden');
        } else {
            groupModalWeeklyDaysPanel.classList.add('hidden');
        }
    });

    if (groupModalWeeklyDaysPanel) {
        groupModalWeeklyDaysPanel.querySelectorAll('.weekday-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dayNum = parseInt(btn.getAttribute('data-day'), 10);
                if (tempGroupWeeklyDays.includes(dayNum)) {
                    tempGroupWeeklyDays = tempGroupWeeklyDays.filter(d => d !== dayNum);
                } else {
                    tempGroupWeeklyDays.push(dayNum);
                }
                syncGroupModalWeeklyButtons();
            });
        });
    }

    groupCancelRecurrenceBtn.addEventListener('click', () => {
        groupRecurrenceModal.classList.add('hidden');
    });

    groupSaveRecurrenceBtn.addEventListener('click', () => {
        const chosenType = groupModalRecurrenceSelect.value;
        if (chosenType === 'weekly' && tempGroupWeeklyDays.length === 0) {
            showToast('Selecciona al menos un día de la semana', 'error');
            return;
        }

        groupTaskRecurrenceInput.value = chosenType;
        savedGroupWeeklyDays = chosenType === 'weekly' ? [...tempGroupWeeklyDays] : [];
        updateGroupRecurrencePreviewLabel();
        groupRecurrenceModal.classList.add('hidden');
    });
}

function updateGroupRecurrencePreviewLabel() {
    const val = groupTaskRecurrenceInput.value;
    if (val === 'none') {
        groupTaskRecurrencePreviewText.textContent = 'No repetir';
    } else if (val === 'daily') {
        groupTaskRecurrencePreviewText.textContent = '1 vez al día';
    } else if (val === 'weekly') {
        const order = [1, 2, 3, 4, 5, 6, 0];
        const sortedLabels = order.filter(d => savedGroupWeeklyDays.includes(d)).map(d => WEEKDAY_SHORT_NAMES[d]);
        groupTaskRecurrencePreviewText.textContent = sortedLabels.length > 0
            ? `Semanal (${sortedLabels.join(',')})`
            : '1 vez a la semana';
    } else if (val === 'monthly') {
        groupTaskRecurrencePreviewText.textContent = '1 vez al mes';
    } else if (val === 'yearly') {
        groupTaskRecurrencePreviewText.textContent = '1 vez al año';
    }
}

function resetGroupRecurrencePicker() {
    if (!groupTaskRecurrenceInput) return;
    groupTaskRecurrenceInput.value = 'none';
    savedGroupWeeklyDays = [];
    tempGroupWeeklyDays = [];
    updateGroupRecurrencePreviewLabel();
}

// --- INICIALIZAR PALETA DE COLORES EN EL MODAL DE NUEVA ETIQUETA DE GRUPO ---
function initGroupNewTagColorGrid() {
    if (!groupNewTagColorGrid) return;
    groupNewTagColorGrid.innerHTML = '';

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
            groupNewTagColorGrid.querySelectorAll('.color-swatch-btn').forEach(s => s.classList.remove('selected'));
            btn.classList.add('selected');
            groupNewTagColorInput.value = colorName;
        });

        groupNewTagColorGrid.appendChild(btn);
    });
}

// --- CARGAR ETIQUETAS DEL GRUPO ---
async function loadGroupTags(groupId) {
    const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

    if (error) {
        showToast('Error al cargar etiquetas del grupo', 'error');
        return;
    }

    groupTags = data || [];
    renderGroupTagDropdowns();
}

// --- RENDERIZAR MENÚS DESPLEGABLES DE ETIQUETAS DEL GRUPO ---
function renderGroupTagDropdowns() {
    const isAdmin = currentGroup && currentGroup.admin_id === currentUserId;

    if (groupTaskTagDropdown) {
        groupTaskTagDropdown.innerHTML = '';

        if (isAdmin) {
            const addNewBtn = document.createElement('button');
            addNewBtn.type = 'button';
            addNewBtn.className = 'tag-add-new-btn';
            addNewBtn.innerHTML = '➕ Añadir nueva etiqueta';
            addNewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                groupTaskTagDropdown.classList.add('hidden');
                openGroupCreateTagModal();
            });
            groupTaskTagDropdown.appendChild(addNewBtn);
        }

        const noneItem = document.createElement('button');
        noneItem.type = 'button';
        noneItem.className = `tag-option-item ${groupTaskTagInput.value === '' ? 'selected' : ''}`;
        noneItem.innerHTML = `
            <span class="tag-color-dot" style="background-color: #ffffff; border: 1px solid #ccc;"></span>
            <span>Sin etiqueta</span>
        `;
        noneItem.addEventListener('click', () => {
            selectGroupCreationTag(null);
            groupTaskTagDropdown.classList.add('hidden');
        });
        groupTaskTagDropdown.appendChild(noneItem);

        groupTags.forEach(tag => {
            const colorStyle = TASK_COLORS[tag.color] || TASK_COLORS['blanco'];

            const row = document.createElement('div');
            row.className = `tag-option-row ${groupTaskTagInput.value === tag.id ? 'selected' : ''}`;

            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'tag-option-item';
            itemBtn.innerHTML = `
                <span class="tag-color-dot" style="background-color: ${colorStyle.bg}; border: 1px solid ${colorStyle.border};"></span>
                <span>${tag.name}</span>
            `;
            itemBtn.addEventListener('click', () => {
                selectGroupCreationTag(tag);
                groupTaskTagDropdown.classList.add('hidden');
            });

            row.appendChild(itemBtn);

            if (isAdmin) {
                const deleteTagBtn = document.createElement('button');
                deleteTagBtn.type = 'button';
                deleteTagBtn.className = 'tag-delete-btn';
                deleteTagBtn.title = 'Eliminar etiqueta';
                deleteTagBtn.textContent = '🗑️';
                deleteTagBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    groupTaskTagDropdown.classList.add('hidden');
                    openGroupDeleteTagModal(tag.id);
                });
                row.appendChild(deleteTagBtn);
            }

            groupTaskTagDropdown.appendChild(row);
        });
    }

    if (groupFilterTagDropdown) {
        groupFilterTagDropdown.innerHTML = '';

        const allItem = document.createElement('button');
        allItem.type = 'button';
        allItem.className = `tag-option-item ${groupFilterTagInput.value === 'all' ? 'selected' : ''}`;
        allItem.innerHTML = `<span>🏷️ Etiquetas (Todas)</span>`;
        allItem.addEventListener('click', () => {
            groupFilterTagInput.value = 'all';
            groupFilterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';
            groupFilterTagDropdown.classList.add('hidden');
            renderGroupTagDropdowns();
            applyGroupFiltersAndRender();
        });
        groupFilterTagDropdown.appendChild(allItem);

        const untaggedItem = document.createElement('button');
        untaggedItem.type = 'button';
        untaggedItem.className = `tag-option-item ${groupFilterTagInput.value === 'none' ? 'selected' : ''}`;
        untaggedItem.innerHTML = `
            <span class="tag-color-dot" style="background-color: #ffffff; border: 1px solid #ccc;"></span>
            <span>Sin etiqueta</span>
        `;
        untaggedItem.addEventListener('click', () => {
            groupFilterTagInput.value = 'none';
            groupFilterTagPreviewText.textContent = '🏷️ Sin etiqueta';
            groupFilterTagDropdown.classList.add('hidden');
            renderGroupTagDropdowns();
            applyGroupFiltersAndRender();
        });
        groupFilterTagDropdown.appendChild(untaggedItem);

        groupTags.forEach(tag => {
            const colorStyle = TASK_COLORS[tag.color] || TASK_COLORS['blanco'];
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `tag-option-item ${groupFilterTagInput.value === tag.id ? 'selected' : ''}`;
            item.innerHTML = `
                <span class="tag-color-dot" style="background-color: ${colorStyle.bg}; border: 1px solid ${colorStyle.border};"></span>
                <span>${tag.name}</span>
            `;
            item.addEventListener('click', () => {
                groupFilterTagInput.value = tag.id;
                groupFilterTagPreviewText.textContent = `🏷️ ${tag.name}`;
                groupFilterTagDropdown.classList.add('hidden');
                renderGroupTagDropdowns();
                applyGroupFiltersAndRender();
            });
            groupFilterTagDropdown.appendChild(item);
        });
    }
}

function selectGroupCreationTag(tag) {
    if (!tag) {
        groupTaskTagInput.value = '';
        groupTaskTagPreviewDot.style.backgroundColor = '#ffffff';
        groupTaskTagPreviewDot.style.border = '1px solid #ccc';
        groupTaskTagPreviewText.textContent = 'Sin etiqueta';
    } else {
        const colorStyle = TASK_COLORS[tag.color] || TASK_COLORS['blanco'];
        groupTaskTagInput.value = tag.id;
        groupTaskTagPreviewDot.style.backgroundColor = colorStyle.bg;
        groupTaskTagPreviewDot.style.border = `1px solid ${colorStyle.border}`;
        groupTaskTagPreviewText.textContent = tag.name;
    }
    renderGroupTagDropdowns();
}

if (groupTaskTagTrigger) {
    groupTaskTagTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (groupFilterTagDropdown) groupFilterTagDropdown.classList.add('hidden');
        groupTaskTagDropdown.classList.toggle('hidden');
    });
}

if (groupFilterTagTrigger) {
    groupFilterTagTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (groupTaskTagDropdown) groupTaskTagDropdown.classList.add('hidden');
        groupFilterTagDropdown.classList.toggle('hidden');
    });
}

document.addEventListener('click', () => {
    if (groupTaskTagDropdown) groupTaskTagDropdown.classList.add('hidden');
    if (groupFilterTagDropdown) groupFilterTagDropdown.classList.add('hidden');
});

// --- MODAL PARA CREAR NUEVA ETIQUETA EN EL GRUPO (SOLO ADMIN) ---
function openGroupCreateTagModal() {
    if (!currentGroup || currentGroup.admin_id !== currentUserId) {
        showToast('Solo el administrador puede crear etiquetas en el grupo', 'error');
        return;
    }
    groupCreateTagForm.reset();
    groupNewTagColorInput.value = 'azul';
    initGroupNewTagColorGrid();
    groupCreateTagModal.classList.remove('hidden');
    setTimeout(() => groupNewTagNameInput.focus(), 50);
}

groupCancelCreateTagBtn.addEventListener('click', () => {
    groupCreateTagModal.classList.add('hidden');
});

groupCreateTagForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentGroup || currentGroup.admin_id !== currentUserId) {
        showToast('No tienes permisos para crear etiquetas en este grupo', 'error');
        return;
    }

    const tagName = groupNewTagNameInput.value.trim();
    const tagColor = groupNewTagColorInput.value || 'azul';

    if (!tagName) return;

    groupSaveNewTagBtn.disabled = true;
    groupSaveNewTagBtn.textContent = 'Guardando...';

    try {
        const { data: createdTag, error } = await supabase
            .from('tags')
            .insert([{
                name: tagName,
                color: tagColor,
                group_id: currentGroup.id
            }])
            .select()
            .single();

        if (error) throw error;

        showToast('¡Etiqueta de grupo creada con éxito!', 'success');
        groupCreateTagModal.classList.add('hidden');

        await loadGroupTags(currentGroup.id);
        if (createdTag) {
            selectGroupCreationTag(createdTag);
        }
    } catch (err) {
        showToast('Error al crear etiqueta: ' + err.message, 'error');
    } finally {
        groupSaveNewTagBtn.disabled = false;
        groupSaveNewTagBtn.textContent = 'Crear Etiqueta';
    }
});

// --- MODAL PARA ELIMINAR ETIQUETA DEL GRUPO (SOLO ADMIN) ---
function openGroupDeleteTagModal(tagId) {
    if (!currentGroup || currentGroup.admin_id !== currentUserId) {
        showToast('Solo el administrador puede eliminar etiquetas del grupo', 'error');
        return;
    }
    groupTagToDeleteId = tagId;
    groupDeleteTagModal.classList.remove('hidden');
}

groupCancelDeleteTagBtn.addEventListener('click', () => {
    groupDeleteTagModal.classList.add('hidden');
    groupTagToDeleteId = null;
});

groupConfirmDeleteTagBtn.addEventListener('click', async () => {
    if (!groupTagToDeleteId || !currentGroup) return;
    if (currentGroup.admin_id !== currentUserId) {
        showToast('No tienes permisos para eliminar etiquetas en este grupo', 'error');
        groupDeleteTagModal.classList.add('hidden');
        groupTagToDeleteId = null;
        return;
    }

    try {
        const { error } = await supabase
            .from('tags')
            .delete()
            .eq('id', groupTagToDeleteId);

        if (error) throw error;

        showToast('Etiqueta eliminada', 'success');

        if (groupTaskTagInput.value === groupTagToDeleteId) {
            selectGroupCreationTag(null);
        }

        if (groupFilterTagInput.value === groupTagToDeleteId) {
            groupFilterTagInput.value = 'all';
            groupFilterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';
        }

        await loadGroupTags(currentGroup.id);
        await loadGroupTasks();
    } catch (err) {
        showToast('Error al eliminar etiqueta: ' + err.message, 'error');
    } finally {
        groupDeleteTagModal.classList.add('hidden');
        groupTagToDeleteId = null;
    }
});

// --- VERIFICAR AUTENTICACIÓN ---
async function checkAuthAndLoadProfile() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session || sessionError) {
        window.location.href = 'index.html';
        return null;
    }
    currentUserId = session.user.id;

    const { data: userData } = await supabase.from('users').select('username, profile_picture_url').eq('id', currentUserId).single();
    if (userData) {
        userNameSpan.textContent = userData.username;
        const placeholder = document.getElementById('avatar-placeholder');
        const avatarImg = document.getElementById('user-avatar');
        if (userData.profile_picture_url) {
            avatarImg.src = userData.profile_picture_url;
            avatarImg.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            placeholder.textContent = userData.username.charAt(0);
        }
    }
    return currentUserId;
}

// --- MENÚ DESPLEGABLE PERFIL ---
profileTrigger.addEventListener('click', () => profileDropdown.classList.toggle('hidden'));
document.addEventListener('click', (e) => {
    if (!profileTrigger.contains(e.target) && !profileDropdown.contains(e.target)) profileDropdown.classList.add('hidden');
});
logoutBtn.addEventListener('click', async () => { await supabase.auth.signOut(); window.location.href = 'index.html'; });

// --- CONTROL DE MODALES SIMPLES ---
openGroupModalBtn.addEventListener('click', () => { createGroupForm.reset(); createGroupModal.classList.remove('hidden'); });
cancelGroupBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));
cancelEditGroup.addEventListener('click', () => editGroupModal.classList.add('hidden'));
cancelAddMember.addEventListener('click', () => addMemberModal.classList.add('hidden'));

// --- CARGAR LISTA DE GRUPOS ---
async function loadGroups() {
    const { data: adminGroups } = await supabase.from('groups').select('*').eq('admin_id', currentUserId);
    const { data: memberRelations } = await supabase.from('group_members').select('group_id').eq('user_id', currentUserId);
    
    let joinedGroups = [];
    if (memberRelations && memberRelations.length > 0) {
        const groupIds = memberRelations.map(rel => rel.group_id);
        const { data: fetchedMemberGroups } = await supabase.from('groups').select('*').in('id', groupIds);
        if (fetchedMemberGroups) joinedGroups = fetchedMemberGroups;
    }

    const allGroups = [...(adminGroups || [])];
    joinedGroups.forEach(g => {
        if (!allGroups.some(ag => ag.id === g.id)) allGroups.push(g);
    });

    renderGroupsList(allGroups);
}

function renderGroupsList(groups) {
    groupsListContainer.innerHTML = '';
    if (groups.length === 0) {
        groupsListContainer.innerHTML = '<p class="empty-state">No perteneces a ningún grupo aún.</p>';
        return;
    }

    groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'task-item';
        item.style.cursor = 'pointer';
        const isAdmin = group.admin_id === currentUserId;

        item.innerHTML = `
            <div class="task-content">
                <h4 class="task-title">👥 ${group.name}</h4>
                <p style="margin:4px 0 0 0; font-size:12px; color:#777;">${isAdmin ? '👑 Eres Administrador' : '👤 Miembro'}</p>
            </div>
            <div class="task-actions"><span style="color:#007bff; font-size:13px; font-weight:bold;">Gestionar ➡️</span></div>
        `;
        item.addEventListener('click', () => selectGroup(group));
        groupsListContainer.appendChild(item);
    });
}

// --- SELECCIONAR UN GRUPO ---
async function selectGroup(group) {
    currentGroup = group;
    noGroupSelectedPanel.classList.add('hidden');
    groupDetailPanel.classList.remove('hidden');

    if (calendarWrapperCard) {
        calendarWrapperCard.classList.remove('hidden');
    }

    selectedGroupName.textContent = `👥 ${group.name}`;
    selectedGroupDesc.textContent = group.description || 'Sin descripción disponible.';

    const isAdmin = group.admin_id === currentUserId;

    if (isAdmin) {
        adminGroupActions.style.display = 'flex';
    } else {
        adminGroupActions.style.display = 'none';
    }

    if (groupSearchTaskInput) groupSearchTaskInput.value = '';
    if (groupFilterFileSelect) groupFilterFileSelect.value = 'all';
    
    resetGroupPendingFiles();
    selectGroupCreationTag(null);
    resetGroupRecurrencePicker();
    if (groupFilterTagInput) groupFilterTagInput.value = 'all';
    if (groupFilterTagPreviewText) groupFilterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';

    if (groupFilterDateInput) groupFilterDateInput.value = '';

    await loadGroupMembers(group);
    await loadGroupTags(group.id);
    await loadGroupTasks();
}

// --- LÓGICA DEL MINI-CALENDARIO DE GRUPOS ---
function renderGroupCalendar() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    if (calendarMonthName) calendarMonthName.textContent = monthNames[month];
    if (calendarYearInput && document.activeElement !== calendarYearInput) {
        calendarYearInput.value = year;
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const adjustedFirstDay = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const todayStr = formatLocalDate(new Date());
    const selectedDateFilter = groupFilterDateInput ? groupFilterDateInput.value : '';

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

        const hasTaskOnThisDay = allGroupTasks.some(task => doesTaskOccurOnDate(task, dateString));
        if (hasTaskOnThisDay) {
            dayCell.classList.add('has-task');
        }

        dayCell.addEventListener('click', () => {
            if (groupFilterDateInput.value === dateString) {
                groupFilterDateInput.value = '';
            } else {
                groupFilterDateInput.value = dateString;
            }
            applyGroupFiltersAndRender();
            renderGroupCalendar();
        });

        calendarGrid.appendChild(dayCell);
    }
}

if (calendarYearInput) {
    calendarYearInput.addEventListener('input', (e) => {
        const typedYear = parseInt(e.target.value);
        if (typedYear >= 1970 && typedYear <= 2100) {
            currentCalendarDate.setFullYear(typedYear);
            renderGroupCalendar();
        }
    });
}

if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderGroupCalendar();
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderGroupCalendar();
    });
}

// --- CARGAR MIEMBROS DEL GRUPO ---
async function loadGroupMembers(group) {
    currentGroupMembers = [];
    
    const { data: adminData } = await supabase.from('users').select('id, username, email').eq('id', group.admin_id).single();
    if (adminData) currentGroupMembers.push(adminData);

    const { data: relations, error } = await supabase
        .from('group_members')
        .select('user_id, users(id, username, email)')
        .eq('group_id', group.id);

    if (relations && !error) {
        relations.forEach(r => {
            if (r.users && r.users.id !== group.admin_id) {
                currentGroupMembers.push(r.users);
            }
        });
    }

    groupTaskAssignee.innerHTML = '';
    const isAdmin = group.admin_id === currentUserId;

    if (isAdmin) {
        currentGroupMembers.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.id === currentUserId ? `${m.username} (Tú - Admin)` : `${m.username} (${m.email})`;
            groupTaskAssignee.appendChild(opt);
        });
        groupTaskAssignee.disabled = false;
    } else {
        const opt = document.createElement('option');
        opt.value = currentUserId;
        opt.textContent = 'Asignada a mí automáticamente';
        groupTaskAssignee.appendChild(opt);
        groupTaskAssignee.disabled = true;
    }
}

// --- CARGAR Y FILTRAR TAREAS DEL GRUPO (CON ETIQUETAS Y ARCHIVOS RELACIONADOS) ---
async function loadGroupTasks() {
    let tasks = null;

    const { data: joinedTasks, error: joinedError } = await supabase
        .from('group_tasks')
        .select('*, tags(id, name, color), group_task_files(id_file, task_id, name, url, path, created_at)')
        .eq('group_id', currentGroup.id)
        .order('created_at', { ascending: false });

    if (!joinedError) {
        tasks = joinedTasks || [];
    } else {
        // Respaldo si PostgREST aún no reconoce la relación anidada group_task_files
        const { data: fallbackTasks, error: fallbackError } = await supabase
            .from('group_tasks')
            .select('*, tags(id, name, color)')
            .eq('group_id', currentGroup.id)
            .order('created_at', { ascending: false });

        if (fallbackError) {
            showToast('Error al cargar tareas: ' + fallbackError.message, 'error');
            return;
        }

        const taskList = fallbackTasks || [];
        const taskIds = taskList.map(t => t.id);
        let filesByTaskId = {};

        if (taskIds.length > 0) {
            const { data: filesRows } = await supabase
                .from('group_task_files')
                .select('id_file, task_id, name, url, path, created_at')
                .in('task_id', taskIds);

            if (Array.isArray(filesRows)) {
                filesByTaskId = filesRows.reduce((acc, row) => {
                    if (!acc[row.task_id]) acc[row.task_id] = [];
                    acc[row.task_id].push(row);
                    return acc;
                }, {});
            }
        }

        tasks = taskList.map(t => ({
            ...t,
            group_task_files: filesByTaskId[t.id] || []
        }));
    }

    const normalizedTasks = tasks.map(t => ({
        ...t,
        files: Array.isArray(t.group_task_files) ? t.group_task_files : []
    }));

    allGroupTasks = await syncRecurringGroupTasksToUpcomingDates(normalizedTasks);
    applyGroupFiltersAndRender();
    renderGroupCalendar(); 
}

// Lógica de filtrado en cliente para grupos
function applyGroupFiltersAndRender() {
    const searchTerm = groupSearchTaskInput ? groupSearchTaskInput.value.toLowerCase().trim() : '';
    const fileFilter = groupFilterFileSelect ? groupFilterFileSelect.value : 'all';
    const tagFilter = groupFilterTagInput ? groupFilterTagInput.value : 'all';
    const dateFilter = groupFilterDateInput ? groupFilterDateInput.value : '';

    const filteredTasks = allGroupTasks.filter(task => {
        const matchesTitle = task.title.toLowerCase().includes(searchTerm);
        const hasFiles = Array.isArray(task.files) && task.files.length > 0;

        let matchesFile = true;
        if (fileFilter === 'with') {
            matchesFile = hasFiles;
        } else if (fileFilter === 'without') {
            matchesFile = !hasFiles;
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

    renderGroupTasks(filteredTasks);
}

// --- COMPLETAR TAREA DE GRUPO (CON REPROGRAMACIÓN PERIÓDICA) ---
async function toggleGroupTaskCompletion(task) {
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

        const { error: updErr } = await supabase
            .from('group_tasks')
            .update({
                due_date: nextDate,
                is_completed: false
            })
            .eq('id', task.id);

        if (updErr) {
            showToast('Error al reprogramar la tarea periódica', 'error');
        } else {
            showToast(`🔁 Tarea completada. Próxima fecha: ${nextDate}`, 'success');
            loadGroupTasks();
        }
        return;
    }

    const { error: updErr } = await supabase
        .from('group_tasks')
        .update({ is_completed: !task.is_completed })
        .eq('id', task.id);

    if (updErr) {
        showToast('No se pudo cambiar el estado', 'error');
    } else {
        loadGroupTasks();
    }
}

function renderGroupTasks(tasks) {
    groupTasksList.innerHTML = '';
    if (!tasks || tasks.length === 0) {
        groupTasksList.innerHTML = '<p class="empty-state">No se encontraron tareas con los filtros seleccionados.</p>';
        return;
    }

    const isAdmin = currentGroup.admin_id === currentUserId;
    const todayStr = formatLocalDate(new Date());

    tasks.forEach(task => {
        const canModify = isAdmin || task.assigned_to === currentUserId;
        
        const item = document.createElement('div');
        item.className = `task-item ${task.is_completed ? 'completed' : ''}`;

        const colorKey = (task.tags && task.tags.color) ? task.tags.color : 'blanco';
        const styleConfig = TASK_COLORS[colorKey] || TASK_COLORS['blanco'];
        
        item.style.backgroundColor = styleConfig.bg;
        item.style.color = styleConfig.text;
        item.style.borderLeft = `4px solid ${styleConfig.border}`;

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

        const assigneeUser = currentGroupMembers.find(m => m.id === task.assigned_to);
        const assigneeName = assigneeUser ? assigneeUser.username : 'No asignado';

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

        let assigneeElementMarkup = '';
        if (isAdmin) {
            assigneeElementMarkup = `
                <select class="change-assignee-select" title="Cambiar destinatario de la tarea" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.2); color: inherit; font-size: 12px; padding: 3px 8px; border-radius: 4px; font-weight: 500; cursor: pointer; font-family: inherit; outline: none;">
                    ${currentGroupMembers.map(m => `
                        <option value="${m.id}" ${m.id === task.assigned_to ? 'selected' : ''} style="background: #fff; color: #333;">
                            👤 Destinado: ${m.username} ${m.id === currentUserId ? '(Tú)' : ''}
                        </option>
                    `).join('')}
                </select>
            `;
        } else {
            assigneeElementMarkup = `
                <button class="btn-icon-assignee" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.2); color: inherit; font-size: 12px; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; cursor: default;">
                    👤 Destinado: <strong>${assigneeName}</strong>
                </button>
            `;
        }

        const taskFiles = Array.isArray(task.files) ? task.files : [];
        let filesMarkup = '';
        if (taskFiles.length > 0) {
            const linksHtml = taskFiles.map(f => `
                <a href="${f.url}" target="_blank" rel="noopener noreferrer" style="font-size: 13px; color: inherit; text-decoration: underline; opacity: 0.9; display: inline-flex; align-items: center; gap: 4px;">
                    📎 ${f.name}
                </a>
            `).join('');

            filesMarkup = `
                <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                    ${linksHtml}
                </div>
            `;
        }

        item.innerHTML = `
            <div class="task-content" style="color: inherit;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                    <h4 class="task-title" style="margin: 0; color: inherit;">${task.title}</h4>
                    ${tagBadgeMarkup}
                    ${recurrenceBadgeMarkup}
                    ${dueDateMarkup}
                </div>
                ${task.description ? `<p style="color: inherit; opacity: 0.85;">${task.description}</p>` : ''}
                
                <div style="margin-top: 8px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    ${assigneeElementMarkup}
                    ${filesMarkup}
                </div>
            </div>
            
            <div class="task-actions">
                ${canModify ? `
                    <button type="button" class="btn-icon edit-group-files-btn" title="${taskFiles.length > 0 ? 'Gestionar archivos' : 'Añadir archivos'}" style="cursor:pointer; color: inherit;">
                        🔄
                    </button>
                ` : ''}
                
                <button class="btn-icon complete-btn" title="${task.recurrence_type && task.recurrence_type !== 'none' ? 'Completar y programar siguiente fecha' : (task.is_completed ? 'Desmarcar' : 'Completar')}" style="color: inherit;" ${!canModify ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    ${task.is_completed ? '✅' : '⬜'}
                </button>
                
                ${isAdmin || canModify ? `
                    <button class="btn-icon delete-task-btn" title="Borrar" style="color: inherit;">🗑️</button>
                ` : ''}
            </div>
        `;

        if (isAdmin) {
            const assigneeSelect = item.querySelector('.change-assignee-select');
            if (assigneeSelect) {
                assigneeSelect.addEventListener('change', async (e) => {
                    const newAssigneeId = e.target.value;
                    try {
                        const { error: updateAssigneeErr } = await supabase
                            .from('group_tasks')
                            .update({ assigned_to: newAssigneeId })
                            .eq('id', task.id);

                        if (updateAssigneeErr) throw updateAssigneeErr;

                        showToast('Destinatario de la tarea actualizado con éxito', 'success');
                        loadGroupTasks(); 
                    } catch (err) {
                        showToast('Error al reasignar destinatario: ' + err.message, 'error');
                    }
                });
            }
        }

        const completeBtn = item.querySelector('.complete-btn');
        completeBtn.addEventListener('click', async () => {
            if (!canModify) return;
            await toggleGroupTaskCompletion(task);
        });

        if (canModify) {
            const editFilesBtn = item.querySelector('.edit-group-files-btn');
            if (editFilesBtn) {
                editFilesBtn.addEventListener('click', () => {
                    openGroupFilesModalForTask(task);
                });
            }
        }

        const delBtn = item.querySelector('.delete-task-btn');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                taskToDelete = task;
                deleteModal.classList.remove('hidden');
            });
        }

        groupTasksList.appendChild(item);
    });
}

// --- EVENTOS DE FILTROS EN TIEMPO REAL PARA GRUPOS ---
if (groupSearchTaskInput) groupSearchTaskInput.addEventListener('input', applyGroupFiltersAndRender);
if (groupFilterFileSelect) groupFilterFileSelect.addEventListener('change', applyGroupFiltersAndRender);

if (groupFilterDateInput) {
    groupFilterDateInput.addEventListener('change', () => {
        applyGroupFiltersAndRender();
        renderGroupCalendar();
    });
}

if (groupClearFiltersBtn) {
    groupClearFiltersBtn.addEventListener('click', () => {
        if (groupSearchTaskInput) groupSearchTaskInput.value = '';
        if (groupFilterFileSelect) groupFilterFileSelect.value = 'all';
        
        if (groupFilterTagInput) groupFilterTagInput.value = 'all';
        if (groupFilterTagPreviewText) groupFilterTagPreviewText.textContent = '🏷️ Etiquetas (Todas)';
        renderGroupTagDropdowns();

        if (groupFilterDateInput) groupFilterDateInput.value = '';
        applyGroupFiltersAndRender();
        renderGroupCalendar();
    });
}

// --- CREAR TAREA DENTRO DEL GRUPO (CON MÚLTIPLES ARCHIVOS) ---
groupTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const recurrenceType = groupTaskRecurrenceInput ? groupTaskRecurrenceInput.value : 'none';
    if (recurrenceType === 'weekly' && savedGroupWeeklyDays.length === 0) {
        showToast('Selecciona al menos un día de la semana para repetir', 'error');
        return;
    }

    addGroupTaskBtn.disabled = true;
    addGroupTaskBtn.textContent = 'Subiendo...';

    const title = groupTaskTitle.value.trim();
    const description = groupTaskDesc.value.trim();
    const assignedTo = groupTaskAssignee.value; 
    const tagId = groupTaskTagInput && groupTaskTagInput.value ? groupTaskTagInput.value : null;
    const todayStr = formatLocalDate(new Date());

    let dueDate = groupTaskDateInput.value || null;
    let anchorDate = null;

    if (recurrenceType !== 'none') {
        const baseDate = dueDate || todayStr;
        if (recurrenceType === 'weekly') {
            dueDate = getNextWeeklyDate(baseDate, savedGroupWeeklyDays, true);
        } else {
            dueDate = baseDate;
        }
        anchorDate = dueDate;
        dueDate = getUpcomingDate(dueDate, recurrenceType, savedGroupWeeklyDays, anchorDate, todayStr);
    }

    const filesToUpload = [...confirmedGroupPendingFiles];
    const uploadedRecords = [];

    try {
        for (const file of filesToUpload) {
            const uploaded = await uploadSingleGroupFileToStorage(currentGroup.id, file);
            uploadedRecords.push(uploaded);
        }

        const { data: createdTask, error: insErr } = await supabase
            .from('group_tasks')
            .insert([{
                group_id: currentGroup.id,
                title: title,
                description: description || null,
                assigned_to: assignedTo,
                created_by: currentUserId,
                tag_id: tagId,
                due_date: dueDate,
                recurrence_type: recurrenceType,
                recurrence_days: recurrenceType === 'weekly' ? [...savedGroupWeeklyDays] : null,
                recurrence_anchor_date: anchorDate,
                is_completed: false
            }])
            .select()
            .single();

        if (insErr) throw insErr;

        if (uploadedRecords.length > 0 && createdTask) {
            const rowsToInsert = uploadedRecords.map(rec => ({
                task_id: createdTask.id,
                name: rec.name,
                url: rec.url,
                path: rec.path
            }));

            const { error: filesInsertError } = await supabase
                .from('group_task_files')
                .insert(rowsToInsert);

            if (filesInsertError) {
                throw new Error('La tarea se creó, pero falló al registrar los archivos: ' + filesInsertError.message);
            }
        }

        showToast('¡Tarea añadida con éxito!', 'success');
        groupTaskForm.reset();
        resetGroupPendingFiles();
        selectGroupCreationTag(null);
        resetGroupRecurrencePicker();
        await loadGroupTasks();
    } catch (err) {
        if (uploadedRecords.length > 0) {
            await deleteGroupFilesFromStorage(uploadedRecords);
        }
        showToast(err.message || 'Error al guardar la tarea', 'error');
    } finally {
        addGroupTaskBtn.disabled = false;
        addGroupTaskBtn.textContent = 'Añadir Tarea al Grupo';
    }
});

// --- GUARDAR ARCHIVOS EDITADOS DE UNA TAREA DE GRUPO EXISTENTE ---
async function saveEditedGroupTaskFiles(task, finalItems) {
    if (!currentGroup) return;
    showToast('Actualizando archivos...', 'success');

    const currentExistingFiles = Array.isArray(task.files) ? task.files : [];
    const keptExistingRecords = finalItems
        .filter(item => item.kind === 'existing')
        .map(item => item.record);
    const keptIds = new Set(keptExistingRecords.map(rec => rec.id_file));
    const removedExistingRecords = currentExistingFiles.filter(rec => !keptIds.has(rec.id_file));
    const newFilesToUpload = finalItems
        .filter(item => item.kind === 'new')
        .map(item => item.file);

    const uploadedRecords = [];

    try {
        for (const file of newFilesToUpload) {
            const uploaded = await uploadSingleGroupFileToStorage(currentGroup.id, file);
            uploadedRecords.push(uploaded);
        }

        if (removedExistingRecords.length > 0) {
            const removedIds = removedExistingRecords.map(rec => rec.id_file);
            const { error: deleteRowsError } = await supabase
                .from('group_task_files')
                .delete()
                .in('id_file', removedIds);

            if (deleteRowsError) {
                throw new Error('Error al quitar archivos eliminados');
            }

            await deleteGroupFilesFromStorage(removedExistingRecords);
        }

        if (uploadedRecords.length > 0) {
            const rowsToInsert = uploadedRecords.map(rec => ({
                task_id: task.id,
                name: rec.name,
                url: rec.url,
                path: rec.path
            }));

            const { error: insertError } = await supabase
                .from('group_task_files')
                .insert(rowsToInsert);

            if (insertError) {
                throw new Error('Error al guardar los nuevos archivos');
            }
        }

        showToast('Archivos actualizados correctamente', 'success');
        await loadGroupTasks();
    } catch (err) {
        if (uploadedRecords.length > 0) {
            await deleteGroupFilesFromStorage(uploadedRecords);
        }
        showToast(err.message || 'Error al actualizar archivos', 'error');
    }
}

// --- RESTO DE MODALES (CREACIÓN, EDICIÓN Y EXPULSIÓN DE MIEMBROS / ELIMINACIÓN DE GRUPOS) ---
createGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveGroupBtn.disabled = true;
    try {
        const { error } = await supabase.from('groups').insert([{
            name: groupTitleInput.value.trim(),
            description: groupDescInput.value.trim() || null,
            admin_id: currentUserId
        }]);
        if (error) throw error;
        showToast('¡Grupo creado con éxito!', 'success');
        createGroupModal.classList.add('hidden');
        loadGroups();
    } catch (err) { showToast(err.message, 'error'); }
    finally { saveGroupBtn.disabled = false; }
});

openEditGroupBtn.addEventListener('click', () => {
    editGroupTitle.value = currentGroup.name;
    editGroupDesc.value = currentGroup.description || '';
    editGroupModal.classList.remove('hidden');
});

editGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const { error } = await supabase.from('groups')
            .update({ name: editGroupTitle.value.trim(), description: editGroupDesc.value.trim() || null })
            .eq('id', currentGroup.id);
        if (error) throw error;

        showToast('Grupo actualizado', 'success');
        currentGroup.name = editGroupTitle.value.trim();
        currentGroup.description = editGroupDesc.value.trim();
        selectedGroupName.textContent = `👥 ${currentGroup.name}`;
        selectedGroupDesc.textContent = currentGroup.description || 'Sin descripción...';
        editGroupModal.classList.add('hidden');
        loadGroups();
    } catch (err) { showToast(err.message, 'error'); }
});

openAddMemberBtn.addEventListener('click', () => { 
    memberEmailInput.value = ''; 
    renderCurrentMembersList(); 
    addMemberModal.classList.remove('hidden'); 
});

function renderCurrentMembersList() {
    currentMembersList.innerHTML = '';
    
    currentGroupMembers.forEach(member => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #f9f9f9; font-size: 13px;';
        
        const isAdmin = member.id === currentGroup.admin_id;

        li.innerHTML = `
            <span><strong>${member.username}</strong> ${isAdmin ? '<span style="color: gold;" title="Administrador">👑</span>' : `(${member.email})`}</span>
            ${!isAdmin ? `<button class="kick-member-btn" data-id="${member.id}" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 16px;" title="Expulsar miembro">❌</button>` : ''}
        `;
        
        currentMembersList.appendChild(li);
    });

    const kickBtns = currentMembersList.querySelectorAll('.kick-member-btn');
    kickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            userIdToKick = e.currentTarget.getAttribute('data-id');
            kickMemberModal.classList.remove('hidden');
        });
    });
}

addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = memberEmailInput.value.trim();
    const saveBtn = document.getElementById('save-member-btn');
    saveBtn.disabled = true;
    
    try {
        const { data: targetUser, error: searchErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
            
        if (searchErr || !targetUser) throw new Error('El usuario con ese correo no está registrado.');
        if (targetUser.id === currentGroup.admin_id) throw new Error('Ese usuario ya es el administrador.');

        const { data: existing } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', currentGroup.id)
            .eq('user_id', targetUser.id)
            .maybeSingle();
            
        if (existing) throw new Error('El usuario ya pertenece a este grupo.');

        const { error: insErr } = await supabase
            .from('group_members')
            .insert([{ group_id: currentGroup.id, user_id: targetUser.id }]);
            
        if (insErr) throw insErr;

        showToast('¡Usuario añadido al grupo!', 'success');
        memberEmailInput.value = '';
        
        await loadGroupMembers(currentGroup);
        await loadGroupTasks();
        renderCurrentMembersList(); 

    } catch (err) { 
        showToast(err.message, 'error'); 
    } finally {
        saveBtn.disabled = false;
    }
});

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    taskToDelete = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!taskToDelete) return;

    try {
        const taskFiles = Array.isArray(taskToDelete.files) ? taskToDelete.files : [];
        if (taskFiles.length > 0) {
            await deleteGroupFilesFromStorage(taskFiles);
        }

        const { error: delErr } = await supabase
            .from('group_tasks')
            .delete()
            .eq('id', taskToDelete.id);
        if (delErr) throw delErr;
        
        showToast('Tarea eliminada', 'success');
        loadGroupTasks(); 
    } catch (err) {
        showToast('Error al borrar la tarea: ' + err.message, 'error');
    } finally {
        deleteModal.classList.add('hidden');
        taskToDelete = null;
    }
});

openDeleteGroupBtn.addEventListener('click', () => {
    deleteGroupModal.classList.remove('hidden');
});

cancelDeleteGroupBtn.addEventListener('click', () => {
    deleteGroupModal.classList.add('hidden');
});

confirmDeleteGroupBtn.addEventListener('click', async () => {
    if (!currentGroup) return;

    confirmDeleteGroupBtn.disabled = true;
    confirmDeleteGroupBtn.textContent = 'Eliminando...';

    try {
        const allFilesInGroup = allGroupTasks.flatMap(t => (Array.isArray(t.files) ? t.files : []));
        if (allFilesInGroup.length > 0) {
            await deleteGroupFilesFromStorage(allFilesInGroup);
        }

        const taskIds = allGroupTasks.map(t => t.id);
        if (taskIds.length > 0) {
            await supabase.from('group_task_files').delete().in('task_id', taskIds);
        }

        const { error: taskErr } = await supabase.from('group_tasks').delete().eq('group_id', currentGroup.id);
        if (taskErr) throw taskErr;

        const { error: tagsErr } = await supabase.from('tags').delete().eq('group_id', currentGroup.id);
        if (tagsErr) throw tagsErr;

        const { error: membersErr } = await supabase.from('group_members').delete().eq('group_id', currentGroup.id);
        if (membersErr) throw membersErr;

        const { error: groupErr } = await supabase.from('groups').delete().eq('id', currentGroup.id);
        if (groupErr) throw groupErr;

        showToast('Grupo y todos sus datos eliminados por completo', 'success');
        deleteGroupModal.classList.add('hidden');

        currentGroup = null;
        groupDetailPanel.classList.add('hidden');
        noGroupSelectedPanel.classList.remove('hidden');
        
        if (calendarWrapperCard) {
            calendarWrapperCard.classList.add('hidden');
        }

        loadGroups();
    } catch (err) {
        showToast('Error al eliminar el grupo: ' + err.message, 'error');
    } finally {
        confirmDeleteGroupBtn.disabled = false;
        confirmDeleteGroupBtn.textContent = 'Sí, eliminar de raíz';
    }
});

cancelKickBtn.addEventListener('click', () => {
    kickMemberModal.classList.add('hidden');
    userIdToKick = null;
});

confirmKickBtn.addEventListener('click', async () => {
    if (!userIdToKick || !currentGroup) return;

    confirmKickBtn.disabled = true;
    confirmKickBtn.textContent = 'Expulsando...';

    try {
        const { error: kickErr } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', currentGroup.id)
            .eq('user_id', userIdToKick);

        if (kickErr) throw kickErr;

        showToast('Miembro expulsado del grupo', 'success');
        kickMemberModal.classList.add('hidden');

        await loadGroupMembers(currentGroup);
        await loadGroupTasks();
        renderCurrentMembersList();
    } catch (err) {
        showToast('Error al expulsar: ' + err.message, 'error');
    } finally {
        confirmKickBtn.disabled = false;
        confirmKickBtn.textContent = 'Sí, expulsar';
        userIdToKick = null;
    }
});

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', async () => {
    initGroupFilesModal();
    initGroupRecurrenceModal();
    initGroupNewTagColorGrid();
    const uId = await checkAuthAndLoadProfile();
    if (uId) loadGroups();
});