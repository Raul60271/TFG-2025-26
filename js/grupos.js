import { supabase } from './supabase.js';

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

// Modal de eliminación de tareas
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let taskToDeleteId = null;

// Modal de expulsión de miembros
const kickMemberModal = document.getElementById('kick-member-modal');
const confirmKickBtn = document.getElementById('confirm-kick-btn');
const cancelKickBtn = document.getElementById('cancel-kick-btn');
let userIdToKick = null; // Guardará temporalmente el ID del usuario a expulsar

// Modal de eliminación de grupo
const openDeleteGroupBtn = document.getElementById('open-delete-group-btn');
const deleteGroupModal = document.getElementById('delete-group-modal');
const confirmDeleteGroupBtn = document.getElementById('confirm-delete-group-btn');
const cancelDeleteGroupBtn = document.getElementById('cancel-delete-group-btn');

// Tareas del grupo
const groupTaskForm = document.getElementById('group-task-form');
const groupTaskTitle = document.getElementById('group-task-title');
const groupTaskDesc = document.getElementById('group-task-desc');
const groupTaskAssignee = document.getElementById('group-task-assignee');
const groupTaskFile = document.getElementById('group-task-file');
const groupFileNamePreview = document.getElementById('group-file-name-preview');
const groupTasksList = document.getElementById('group-tasks-list');
const addGroupTaskBtn = document.getElementById('add-group-task-btn');

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
let currentGroupMembers = []; // Lista de objetos { id, username, email }

// --- NOTIFICACIONES TOAST ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { toastNotification.classList.remove('show'); }, 3500);
}

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

// --- MOSTRAR NOMBRE DEL ARCHIVO EN FORMULARIO ---
groupTaskFile.addEventListener('change', () => {
    groupFileNamePreview.textContent = groupTaskFile.files[0] ? groupTaskFile.files[0].name : 'Ningún archivo...';
});

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

    selectedGroupName.textContent = `👥 ${group.name}`;
    selectedGroupDesc.textContent = group.description || 'Sin descripción disponible.';

    const isAdmin = group.admin_id === currentUserId;

    if (isAdmin) {
        adminGroupActions.style.display = 'flex';
    } else {
        adminGroupActions.style.display = 'none';
    }

    await loadGroupMembers(group);
    await loadGroupTasks();
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

// --- CREAR NUEVO GRUPO ---
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

// --- EDITAR GRUPO ---
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

// --- EDITAR / AÑADIR / EXPULSAR MIEMBROS ---
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
        
        // Dibujamos al miembro. Si no es admin, añadimos el botón de expulsar (❌)
        li.innerHTML = `
            <span><strong>${member.username}</strong> ${isAdmin ? '<span style="color: gold;" title="Administrador">👑</span>' : `(${member.email})`}</span>
            ${!isAdmin ? `<button class="kick-member-btn" data-id="${member.id}" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 16px;" title="Expulsar miembro">❌</button>` : ''}
        `;
        
        currentMembersList.appendChild(li);
    });

    // Añadir eventos a los botones de expulsión
    const kickBtns = currentMembersList.querySelectorAll('.kick-member-btn');
    kickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Guardamos el ID globalmente usando currentTarget y abrimos el modal flotante
            userIdToKick = e.currentTarget.getAttribute('data-id');
            kickMemberModal.classList.remove('hidden');
        });
    });
}

// --- AÑADIR MIEMBRO AL GRUPO ---
addMemberForm.addEventListener('submit', async (e) => {
    // 1. Evita que la página se reinicie
    e.preventDefault(); 
    
    const email = memberEmailInput.value.trim();
    const saveBtn = document.getElementById('save-member-btn');
    saveBtn.disabled = true;
    
    try {
        // 2. Buscamos al usuario por su email
        const { data: targetUser, error: searchErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
            
        if (searchErr || !targetUser) throw new Error('El usuario con ese correo no está registrado.');
        if (targetUser.id === currentGroup.admin_id) throw new Error('Ese usuario ya es el administrador.');

        // 3. Verificamos si ya está en el grupo
        const { data: existing } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', currentGroup.id)
            .eq('user_id', targetUser.id)
            .maybeSingle();
            
        if (existing) throw new Error('El usuario ya pertenece a este grupo.');

        // 4. Lo insertamos en la base de datos
        const { error: insErr } = await supabase
            .from('group_members')
            .insert([{ group_id: currentGroup.id, user_id: targetUser.id }]);
            
        if (insErr) throw insErr;

        // 5. Notificamos, vaciamos el input y actualizamos listas al instante
        showToast('¡Usuario añadido al grupo!', 'success');
        memberEmailInput.value = '';
        
        await loadGroupMembers(currentGroup);
        await loadGroupTasks();
        renderCurrentMembersList(); // Refresca la interfaz del modal sin cerrarlo

    } catch (err) { 
        showToast(err.message, 'error'); 
    } finally {
        saveBtn.disabled = false;
    }
});

// --- CARGAR Y RENDERIZAR TAREAS DEL GRUPO (CON REASIGNACIÓN PARA MODERADORES) ---
async function loadGroupTasks() {
    const { data: tasks, error } = await supabase
        .from('group_tasks')
        .select('*')
        .eq('group_id', currentGroup.id)
        .order('created_at', { ascending: false });

    if (error) { showToast('Error al cargar tareas', 'error'); return; }

    groupTasksList.innerHTML = '';
    if (!tasks || tasks.length === 0) {
        groupTasksList.innerHTML = '<p class="empty-state">No hay tareas creadas en este grupo.</p>';
        return;
    }

    const isAdmin = currentGroup.admin_id === currentUserId;

    tasks.forEach(task => {
        const canModify = isAdmin || task.assigned_to === currentUserId;
        
        const item = document.createElement('div');
        item.className = `task-item ${task.is_completed ? 'completed' : ''}`;

        const assigneeUser = currentGroupMembers.find(m => m.id === task.assigned_to);
        const assigneeName = assigneeUser ? assigneeUser.username : 'No asignado';

        let assigneeElementMarkup = '';
        if (isAdmin) {
            assigneeElementMarkup = `
                <select class="change-assignee-select" title="Cambiar destinatario de la tarea" style="background: #e6f2ff; border: 1px solid #b3d7ff; color: #007bff; font-size: 12px; padding: 3px 8px; border-radius: 4px; font-weight: 500; cursor: pointer; font-family: inherit; outline: none; border-style: solid;">
                    ${currentGroupMembers.map(m => `
                        <option value="${m.id}" ${m.id === task.assigned_to ? 'selected' : ''}>
                            👤 Destinado: ${m.username} ${m.id === currentUserId ? '(Tú)' : ''}
                        </option>
                    `).join('')}
                </select>
            `;
        } else {
            assigneeElementMarkup = `
                <button class="btn-icon-assignee" style="background: #e6f2ff; border: 1px solid #b3d7ff; color: #007bff; font-size: 12px; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; cursor: default; border-style: solid;">
                    👤 Destinado: <strong>${assigneeName}</strong>
                </button>
            `;
        }

        item.innerHTML = `
            <div class="task-content">
                <h4 class="task-title">${task.title}</h4>
                ${task.description ? `<p>${task.description}</p>` : ''}
                
                <div style="margin-top: 8px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    ${assigneeElementMarkup}
                    
                    ${task.file_url ? `
                        <div>
                            <a href="${task.file_url}" target="_blank" style="font-size: 13px; color: #007bff; text-decoration: none;">
                                📎 Descargar: ${task.file_name}
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="task-actions">
                ${canModify ? `
                    <label class="btn-icon" title="${task.file_url ? 'Sustituir archivo' : 'Añadir archivo'}" style="cursor:pointer;">
                        🔄
                        <input type="file" class="replace-file-input" style="display:none;">
                    </label>
                ` : ''}
                
                <button class="btn-icon complete-btn" title="${task.is_completed ? 'Desmarcar' : 'Completar'}" ${!canModify ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    ${task.is_completed ? '✅' : '⬜'}
                </button>
                
                ${isAdmin || canModify ? `
                    <button class="btn-icon delete-task-btn" title="Borrar">🗑️</button>
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
            const { error: updErr } = await supabase.from('group_tasks')
                .update({ is_completed: !task.is_completed })
                .eq('id', task.id);
            if (updErr) { showToast('No se pudo cambiar el estado', 'error'); } 
            else { loadGroupTasks(); }
        });

        if (canModify) {
            const replaceInput = item.querySelector('.replace-file-input');
            replaceInput.addEventListener('change', async () => {
                const file = replaceInput.files[0];
                if (!file) return;
                try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `group_${currentGroup.id}_task_${task.id}_${Date.now()}.${fileExt}`;
                    
                    const { error: uploadError } = await supabase.storage.from('group-files').upload(fileName, file);
                    if (uploadError) throw new Error('Error al subir el archivo al almacenamiento.');

                    const { data: pUrl } = supabase.storage.from('group-files').getPublicUrl(fileName);

                    const { error: dbErr } = await supabase.from('group_tasks')
                        .update({ file_url: pUrl.publicUrl, file_name: file.name })
                        .eq('id', task.id);
                    if (dbErr) throw dbErr;

                    showToast('Archivo actualizado', 'success');
                    loadGroupTasks();
                } catch (err) { showToast(err.message, 'error'); }
            });
        }

        const delBtn = item.querySelector('.delete-task-btn');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                taskToDeleteId = task.id;
                deleteModal.classList.remove('hidden');
            });
        }

        groupTasksList.appendChild(item);
    });
}

// --- CREAR TAREA DENTRO DEL GRUPO ---
groupTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addGroupTaskBtn.disabled = true;
    addGroupTaskBtn.textContent = 'Añadiendo...';

    const title = groupTaskTitle.value.trim();
    const description = groupTaskDesc.value.trim();
    const assignedTo = groupTaskAssignee.value; 
    const file = groupTaskFile.files[0];

    let fileUrl = null;
    let fileNameStr = null;

    try {
        if (file) {
            const fileExt = file.name.split('.').pop();
            const uniqueName = `group_${currentGroup.id}_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('group-files').upload(uniqueName, file);
            if (uploadError) throw new Error('No se pudo subir el archivo adjunto.');

            const { data: pUrl } = supabase.storage.from('group-files').getPublicUrl(uniqueName);
            fileUrl = pUrl.publicUrl;
            fileNameStr = file.name;
        }

        const { error: insErr } = await supabase.from('group_tasks').insert([{
            group_id: currentGroup.id,
            title: title,
            description: description || null,
            assigned_to: assignedTo,
            created_by: currentUserId,
            file_url: fileUrl,
            file_name: fileNameStr,
            is_completed: false
        }]);

        if (insErr) throw insErr;

        showToast('¡Tarea añadida con éxito!', 'success');
        groupTaskForm.reset();
        groupFileNamePreview.textContent = 'Ningún archivo...';
        loadGroupTasks();
    } catch (err) { showToast(err.message, 'error'); }
    finally {
        addGroupTaskBtn.disabled = false;
        addGroupTaskBtn.textContent = 'Añadir Tarea al Grupo';
    }
});

// --- LÓGICA DEL MODAL DE BORRADO DE TAREAS ---
cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    taskToDeleteId = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!taskToDeleteId) return;

    try {
        const { error: delErr } = await supabase.from('group_tasks').delete().eq('id', taskToDeleteId);
        if (delErr) throw delErr;
        
        showToast('Tarea eliminada', 'success');
        loadGroupTasks(); 
    } catch (err) {
        showToast('Error al borrar la tarea: ' + err.message, 'error');
    } finally {
        deleteModal.classList.add('hidden');
        taskToDeleteId = null;
    }
});

// --- LÓGICA DEL MODAL DE BORRADO DE GRUPOS COMPLETOS ---
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
        // 1. Limpieza de Tareas: Eliminamos todas las tareas del grupo
        const { error: taskErr } = await supabase.from('group_tasks').delete().eq('group_id', currentGroup.id);
        if (taskErr) throw taskErr;

        // 2. Limpieza de Miembros: Eliminamos las relaciones en la tabla cruzada
        const { error: membersErr } = await supabase.from('group_members').delete().eq('group_id', currentGroup.id);
        if (membersErr) throw membersErr;

        // 3. Borrado de la entidad raíz: Eliminamos el grupo definitivo
        const { error: groupErr } = await supabase.from('groups').delete().eq('id', currentGroup.id);
        if (groupErr) throw groupErr;

        showToast('Grupo y todos sus datos eliminados por completo', 'success');
        deleteGroupModal.classList.add('hidden');

        // Resetear la selección actual y ocultar panel de detalles
        currentGroup = null;
        groupDetailPanel.classList.add('hidden');
        noGroupSelectedPanel.classList.remove('hidden');

        // Refrescar el árbol de grupos lateral
        loadGroups();
    } catch (err) {
        showToast('Error al eliminar el grupo: ' + err.message, 'error');
    } finally {
        confirmDeleteGroupBtn.disabled = false;
        confirmDeleteGroupBtn.textContent = 'Sí, eliminar de raíz';
    }
});

// --- LÓGICA DEL MODAL DE EXPULSAR MIEMBRO ---
cancelKickBtn.addEventListener('click', () => {
    kickMemberModal.classList.add('hidden');
    userIdToKick = null;
});

confirmKickBtn.addEventListener('click', async () => {
    if (!userIdToKick || !currentGroup) return;

    confirmKickBtn.disabled = true;
    confirmKickBtn.textContent = 'Expulsando...';

    try {
        // Borramos la relación usuario-grupo en Supabase
        const { error: kickErr } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', currentGroup.id)
            .eq('user_id', userIdToKick);

        if (kickErr) throw kickErr;

        showToast('Miembro expulsado del grupo', 'success');
        kickMemberModal.classList.add('hidden');

        // Recargamos los datos y refrescamos la interfaz al instante
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
    const uId = await checkAuthAndLoadProfile();
    if (uId) loadGroups();
});