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

// Referencias de los filtros en tiempo real
const searchTaskInput = document.getElementById('search-task');
const filterFileSelect = document.getElementById('filter-file');
const filterDateInput = document.getElementById('filter-date');
const clearFiltersBtn = document.getElementById('clear-filters-btn');

// Referencias del Calendario Lateral
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonthName = document.getElementById('calendar-month-name');
const calendarYearInput = document.getElementById('calendar-year-input');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');

let currentCalendarDate = new Date();

// Referencias del Modal de borrado
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let taskToDeleteId = null; 
let fileToDeleteUrl = null; 

let allTasks = [];

// --- SISTEMA DE NOTIFICACIONES ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { toastNotification.classList.remove('show'); }, 3000);
}

// --- RENDERIZAR MENÚS DESPLEGABLES DE COLOR ---
function initColorPickers() {
    // 1. Desplegable en formulario de creación
    const taskTrigger = document.getElementById('task-color-trigger');
    const taskDropdown = document.getElementById('task-color-dropdown');
    const taskInput = document.getElementById('task-color-value');
    const taskPreviewSwatch = document.getElementById('task-color-preview-swatch');
    const taskPreviewText = document.getElementById('task-color-preview-text');

    if (taskTrigger && taskDropdown && taskInput) {
        taskDropdown.innerHTML = '';
        Object.keys(TASK_COLORS).forEach(colorName => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `color-swatch-btn ${colorName === 'blanco' ? 'selected' : ''}`;
            btn.style.backgroundColor = TASK_COLORS[colorName].bg;
            if (colorName === 'blanco' || colorName === 'amarillo') {
                btn.style.border = '1px solid #adb5bd';
            }
            btn.title = colorName.charAt(0).toUpperCase() + colorName.slice(1);
            
            btn.addEventListener('click', () => {
                taskDropdown.querySelectorAll('.color-swatch-btn').forEach(s => s.classList.remove('selected'));
                btn.classList.add('selected');
                taskInput.value = colorName;
                
                // Actualizar vista previa del botón principal
                taskPreviewSwatch.style.backgroundColor = TASK_COLORS[colorName].bg;
                taskPreviewText.textContent = colorName.charAt(0).toUpperCase() + colorName.slice(1);
                taskDropdown.classList.add('hidden');
            });
            taskDropdown.appendChild(btn);
        });

        taskTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (filterDropdown) filterDropdown.classList.add('hidden');
            taskDropdown.classList.toggle('hidden');
        });
    }

    // 2. Desplegable en barra de filtros
    const filterTrigger = document.getElementById('filter-color-trigger');
    const filterDropdown = document.getElementById('filter-color-dropdown');
    const filterInput = document.getElementById('filter-color-value');
    const filterPreviewText = document.getElementById('filter-color-preview-text');

    if (filterTrigger && filterDropdown && filterInput) {
        filterDropdown.innerHTML = '';
        
        // Opción "Todos" dentro del desplegable de filtro
        const allBtn = document.createElement('div');
        allBtn.textContent = '🎨 Colores (Todos)';
        allBtn.style.cssText = 'grid-column: 1 / -1; padding: 6px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; background: #f1f3f5; border-radius: 4px; margin-bottom: 4px; color: #333;';
        allBtn.addEventListener('click', () => {
            filterDropdown.querySelectorAll('.color-swatch-btn').forEach(s => s.classList.remove('selected'));
            filterInput.value = 'all';
            filterPreviewText.textContent = '🎨 Colores (Todos)';
            filterDropdown.classList.add('hidden');
            applyFiltersAndRender();
        });
        filterDropdown.appendChild(allBtn);

        Object.keys(TASK_COLORS).forEach(colorName => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'color-swatch-btn';
            btn.style.backgroundColor = TASK_COLORS[colorName].bg;
            if (colorName === 'blanco' || colorName === 'amarillo') {
                btn.style.border = '1px solid #adb5bd';
            }
            btn.title = colorName.charAt(0).toUpperCase() + colorName.slice(1);
            
            btn.addEventListener('click', () => {
                filterDropdown.querySelectorAll('.color-swatch-btn').forEach(s => s.classList.remove('selected'));
                btn.classList.add('selected');
                filterInput.value = colorName;
                filterPreviewText.textContent = `🎨 ${colorName.charAt(0).toUpperCase() + colorName.slice(1)}`;
                filterDropdown.classList.add('hidden');
                applyFiltersAndRender();
            });
            filterDropdown.appendChild(btn);
        });

        filterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (taskDropdown) taskDropdown.classList.add('hidden');
            filterDropdown.classList.toggle('hidden');
        });
    }

    // Cerrar desplegables al hacer clic fuera
    document.addEventListener('click', () => {
        if (taskDropdown) taskDropdown.classList.add('hidden');
        if (filterDropdown) filterDropdown.classList.add('hidden');
    });
}

// --- 1. VERIFICAR SESIÓN Y CARGAR PERFIL ---
async function checkAuthAndLoadProfile() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session || sessionError) {
        window.location.href = 'index.html';
        return null;
    }

    const userId = session.user.id;
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('username, profile_picture_url')
        .eq('id', userId)
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
    return userId; 
}

// --- 2. MENÚ DESPLEGABLE ---
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

// --- 6. CARGAR TAREAS ---
async function loadTasks(userId) {
    const { data: tasks, error } = await supabase
        .from('personal_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }); 

    if (error) {
        showToast('Error al cargar tareas', 'error');
        return;
    }
    
    allTasks = tasks || [];
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

    const todayStr = new Date().toISOString().split('T')[0];
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

        const hasTaskOnThisDay = allTasks.some(task => task.due_date === dateString);
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
    const colorFilterInput = document.getElementById('filter-color-value');
    const colorFilter = colorFilterInput ? colorFilterInput.value : 'all';
    const dateFilter = filterDateInput.value;

    const filteredTasks = allTasks.filter(task => {
        const matchesTitle = task.title.toLowerCase().includes(searchTerm);

        let matchesFile = true;
        if (fileFilter === 'with') {
            matchesFile = Boolean(task.file_url);
        } else if (fileFilter === 'without') {
            matchesFile = !task.file_url;
        }

        const taskColorValue = task.color || 'blanco';
        const matchesColor = (colorFilter === 'all') || (taskColorValue === colorFilter);

        let matchesDate = true;
        if (dateFilter) {
            matchesDate = task.due_date === dateFilter;
        }

        return matchesTitle && matchesFile && matchesColor && matchesDate;
    });

    renderTasks(filteredTasks);
}

function renderTasks(tasks) {
    taskListContainer.innerHTML = ''; 

    if (tasks.length === 0) {
        taskListContainer.innerHTML = '<p class="empty-state">No se encontraron tareas con los filtros seleccionados.</p>';
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `task-item ${task.is_completed ? 'completed' : ''}`;
        
        // Aplicar colores dinámicos
        const colorKey = task.color || 'blanco';
        const styleConfig = TASK_COLORS[colorKey] || TASK_COLORS['blanco'];
        
        taskElement.style.backgroundColor = styleConfig.bg;
        taskElement.style.color = styleConfig.text;
        taskElement.style.borderLeft = `4px solid ${styleConfig.border}`;

        let dueDateMarkup = '';
        if (task.due_date) {
            const isOverdue = task.due_date < todayStr && !task.is_completed;
            const dateStyle = isOverdue 
                ? 'background: #ffe6e6; color: #dc3545; border: 1px solid #f5c6cb;' 
                : 'background: rgba(0,0,0,0.05); color: inherit; border: 1px solid rgba(0,0,0,0.1);';
            
            dueDateMarkup = `
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; ${dateStyle}" title="${isOverdue ? '¡Fecha límite vencida!' : 'Fecha límite'}">
                    📅 ${task.due_date} ${isOverdue ? '⚠️' : ''}
                </span>
            `;
        }

        taskElement.innerHTML = `
            <div class="task-content" style="color: inherit;">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px;">
                    <h4 class="task-title" style="margin: 0; color: inherit;">${task.title}</h4>
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
                
                <button class="btn-icon complete-btn" title="${task.is_completed ? 'Desmarcar' : 'Completar'}" style="color: inherit;">
                    ${task.is_completed ? '✅' : '⬜'}
                </button>
                <button class="btn-icon delete-btn" title="Borrar" style="color: inherit;">🗑️</button>
            </div>
        `;

        const completeBtn = taskElement.querySelector('.complete-btn');
        completeBtn.addEventListener('click', () => toggleTaskCompletion(task.id, !task.is_completed));

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
    
    // Resetear desplegable de color del filtro
    const filterColorInput = document.getElementById('filter-color-value');
    if (filterColorInput) filterColorInput.value = 'all';
    const filterPreviewText = document.getElementById('filter-color-preview-text');
    if (filterPreviewText) filterPreviewText.textContent = '🎨 Colores (Todos)';
    document.querySelectorAll('#filter-color-dropdown .color-swatch-btn').forEach(s => s.classList.remove('selected'));

    filterDateInput.value = '';
    applyFiltersAndRender();
    renderCalendar();
});

// --- 10. CREAR NUEVA TAREA ---
createTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = createTaskForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Subiendo...';
    submitBtn.disabled = true;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const title = taskTitleInput.value;
    const description = taskDescInput.value;
    const taskColorInput = document.getElementById('task-color-value');
    const taskColor = taskColorInput ? taskColorInput.value : 'blanco';
    const dueDate = taskDateInput.value || null;
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
            color: taskColor,
            due_date: dueDate,
            file_url: fileUrl,
            file_name: fileName
        }]);

    if (insertError) {
        showToast('Error al crear la tarea', 'error');
    } else {
        showToast('Tarea añadida con éxito', 'success');
        createTaskForm.reset();
        fileNameDisplay.textContent = 'Ningún archivo...'; 
        
        // Reiniciar selector de color de creación a blanco por defecto
        if (taskColorInput) taskColorInput.value = 'blanco';
        const taskPreviewSwatch = document.getElementById('task-color-preview-swatch');
        const taskPreviewText = document.getElementById('task-color-preview-text');
        if (taskPreviewSwatch) taskPreviewSwatch.style.backgroundColor = '#ffffff';
        if (taskPreviewText) taskPreviewText.textContent = 'Blanco';
        initColorPickers();

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

// --- 12. COMPLETAR TAREA ---
async function toggleTaskCompletion(taskId, newStatus) {
    const { error } = await supabase
        .from('personal_tasks')
        .update({ is_completed: newStatus })
        .eq('id', taskId);

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
    initColorPickers();
    const userId = await checkAuthAndLoadProfile();
    if (userId) {
        loadTasks(userId);
    }
});