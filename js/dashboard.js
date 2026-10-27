import { supabase } from './supabase.js';

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

// Estado actual del calendario (por defecto el mes y año actual)
let currentCalendarDate = new Date();

// Referencias del Modal de borrado
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let taskToDeleteId = null; 
let fileToDeleteUrl = null; 

// Almacén global para las tareas descargadas y filtrado en cliente
let allTasks = [];

// --- SISTEMA DE NOTIFICACIONES ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { toastNotification.classList.remove('show'); }, 3000);
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

// --- 2. FUNCIONAMIENTO DEL MENÚ DESPLEGABLE ---
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

// --- 4. ACTUALIZAR NOMBRE DE ARCHIVO EN LA INTERFAZ ---
taskFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        fileNameDisplay.textContent = e.target.files[0].name;
    } else {
        fileNameDisplay.textContent = 'Ningún archivo...';
    }
});

// --- 5. FUNCIÓN AUXILIAR PARA BORRAR ARCHIVOS DE STORAGE ---
async function deleteFileFromStorage(fileUrl) {
    if (!fileUrl) return;
    const urlParts = fileUrl.split('/task_files/');
    if (urlParts.length === 2) {
        const filePath = urlParts[1];
        await supabase.storage.from('task_files').remove([filePath]);
    }
}

// --- 6. CARGAR TAREAS Y ACTUALIZAR VISTAS ---
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
    renderCalendar(); // Renderizar el calendario con las tareas cargadas
}

// --- 7. LÓGICA DEL MINI-CALENDARIO INTERACTIVO ---
function renderCalendar() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    // Actualizar nombre del mes y valor del input de año
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

// Evento para cuando el usuario escribe o cambia el año en el input
if (calendarYearInput) {
    calendarYearInput.addEventListener('input', (e) => {
        const typedYear = parseInt(e.target.value);
        // Validar que sea un año razonable de 4 dígitos antes de actualizar
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

// --- 8. FILTRADO EN TIEMPO REAL ---
function applyFiltersAndRender() {
    const searchTerm = searchTaskInput.value.toLowerCase().trim();
    const fileFilter = filterFileSelect.value;
    const dateFilter = filterDateInput.value;

    const filteredTasks = allTasks.filter(task => {
        const matchesTitle = task.title.toLowerCase().includes(searchTerm);

        let matchesFile = true;
        if (fileFilter === 'with') {
            matchesFile = Boolean(task.file_url);
        } else if (fileFilter === 'without') {
            matchesFile = !task.file_url;
        }

        let matchesDate = true;
        if (dateFilter) {
            matchesDate = task.due_date === dateFilter;
        }

        return matchesTitle && matchesFile && matchesDate;
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
        
        let dueDateMarkup = '';
        if (task.due_date) {
            const isOverdue = task.due_date < todayStr && !task.is_completed;
            const dateStyle = isOverdue 
                ? 'background: #ffe6e6; color: #dc3545; border: 1px solid #f5c6cb;' 
                : 'background: #f1f3f5; color: #495057; border: 1px solid #dee2e6;';
            
            dueDateMarkup = `
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; ${dateStyle}" title="${isOverdue ? '¡Fecha límite vencida!' : 'Fecha límite'}">
                    📅 ${task.due_date} ${isOverdue ? '⚠️' : ''}
                </span>
            `;
        }

        taskElement.innerHTML = `
            <div class="task-content">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px;">
                    <h4 class="task-title" style="margin: 0;">${task.title}</h4>
                    ${dueDateMarkup}
                </div>
                ${task.description ? `<p>${task.description}</p>` : ''}
                ${task.file_url ? `
                    <div style="margin-top: 8px;">
                        <a href="${task.file_url}" target="_blank" style="font-size: 13px; color: #007bff; text-decoration: none;">
                            📎 Descargar: ${task.file_name}
                        </a>
                    </div>
                ` : ''}
            </div>
            <div class="task-actions">
                <label class="btn-icon" title="${task.file_url ? 'Sustituir archivo' : 'Añadir archivo'}" style="cursor:pointer;">
                    🔄
                    <input type="file" class="hidden-replace-input" style="display:none;">
                </label>
                
                <button class="btn-icon complete-btn" title="${task.is_completed ? 'Desmarcar' : 'Completar'}">
                    ${task.is_completed ? '✅' : '⬜'}
                </button>
                <button class="btn-icon delete-btn" title="Borrar">🗑️</button>
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

// --- 9. EVENTOS DE LOS FILTROS ---
searchTaskInput.addEventListener('input', applyFiltersAndRender);
filterFileSelect.addEventListener('change', applyFiltersAndRender);

filterDateInput.addEventListener('change', () => {
    applyFiltersAndRender();
    renderCalendar(); // Actualizar selección visual en el calendario si se cambia desde el input fecha
});

clearFiltersBtn.addEventListener('click', () => {
    searchTaskInput.value = '';
    filterFileSelect.value = 'all';
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
    const userId = await checkAuthAndLoadProfile();
    if (userId) {
        loadTasks(userId);
    }
});