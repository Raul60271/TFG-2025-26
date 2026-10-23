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
const taskDateInput = document.getElementById('task-date'); // Referencia al nuevo input de fecha
const fileNameDisplay = document.getElementById('file-name-display');
const taskListContainer = document.getElementById('task-list');

// Referencias del nuevo Modal
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let taskToDeleteId = null; 
let fileToDeleteUrl = null; 

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

// --- 6. CARGAR TAREAS DEL USUARIO ---
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
    renderTasks(tasks);
}

function renderTasks(tasks) {
    taskListContainer.innerHTML = ''; 

    if (tasks.length === 0) {
        taskListContainer.innerHTML = '<p class="empty-state">No tienes tareas pendientes. ¡Crea una!</p>';
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0]; // Fecha actual en formato YYYY-MM-DD para comparar

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = `task-item ${task.is_completed ? 'completed' : ''}`;
        
        // Formatear la fecha límite de forma sutil si existe
        let dueDateMarkup = '';
        if (task.due_date) {
            // Comprobamos si está vencida (y la tarea no está completada)
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

        // Evento para completar tarea
        const completeBtn = taskElement.querySelector('.complete-btn');
        completeBtn.addEventListener('click', () => toggleTaskCompletion(task.id, !task.is_completed));

        // Evento para borrar tarea
        const deleteBtn = taskElement.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => openDeleteModal(task.id, task.file_url));

        // Evento para sustituir archivo
        const replaceInput = taskElement.querySelector('.hidden-replace-input');
        replaceInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                replaceTaskFile(task.id, task.file_url, e.target.files[0]);
            }
        });

        taskListContainer.appendChild(taskElement);
    });
}

// --- 7. CREAR NUEVA TAREA CON ARCHIVO Y FECHA ---
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
    const dueDate = taskDateInput.value || null; // Capturamos la fecha seleccionada (o null si está vacía)
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
            due_date: dueDate, // Guardamos la fecha en la columna correspondiente
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

// --- 8. LÓGICA PARA SUSTITUIR/AÑADIR ARCHIVO EN TAREA EXISTENTE ---
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

// --- 9. COMPLETAR / DESCOMPLETAR TAREA ---
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

// --- 10. LÓGICA DEL MODAL DE BORRADO (SQL + STORAGE) ---
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