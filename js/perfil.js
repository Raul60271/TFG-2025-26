import { supabase } from './supabase.js';

// --- REFERENCIAS HTML ---
const displayUsername = document.getElementById('display-username');
const displayEmail = document.getElementById('display-email');

// Referencias del Avatar
const avatarPreview = document.getElementById('avatar-preview');
const avatarPlaceholder = document.getElementById('avatar-placeholder');

const statTotalTasks = document.getElementById('stat-total-tasks');
const statCompletedTasks = document.getElementById('stat-completed-tasks');

// Modal de Edición
const editModal = document.getElementById('edit-profile-modal');
const openEditBtn = document.getElementById('open-edit-modal-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editForm = document.getElementById('edit-profile-form');
const editUsernameInput = document.getElementById('edit-username');
const editPasswordInput = document.getElementById('edit-password');
const editAvatarInput = document.getElementById('edit-avatar');
const saveBtn = document.getElementById('save-btn');

// Modal de Borrado
const deleteModal = document.getElementById('delete-account-modal');
const openDeleteBtn = document.getElementById('open-delete-account-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-account');
const confirmDeleteBtn = document.getElementById('confirm-delete-account');

const toastNotification = document.getElementById('toast-notification');

let currentUserId = null;
let currentAvatarUrl = null;

// --- SISTEMA DE NOTIFICACIONES ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { toastNotification.classList.remove('show'); }, 4000);
}

// --- 1. CARGAR DATOS DEL USUARIO Y ESTADÍSTICAS ---
async function loadProfileData() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!session || sessionError) {
        window.location.href = 'index.html';
        return;
    }

    currentUserId = session.user.id;
    displayEmail.textContent = session.user.email;

    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('username, profile_picture_url')
        .eq('id', currentUserId)
        .single();

    if (userData && !userError) {
        displayUsername.textContent = userData.username;
        editUsernameInput.value = userData.username; 
        
        if (userData.profile_picture_url) {
            currentAvatarUrl = userData.profile_picture_url;
            avatarPreview.src = currentAvatarUrl;
            avatarPreview.classList.remove('hidden');
            avatarPlaceholder.classList.add('hidden');
        } else {
            avatarPlaceholder.textContent = userData.username.charAt(0);
            avatarPreview.classList.add('hidden');
            avatarPlaceholder.classList.remove('hidden');
        }
    }

    const { count: totalTasks } = await supabase
        .from('personal_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUserId);
    
    const { count: completedTasks } = await supabase
        .from('personal_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUserId)
        .eq('is_completed', true);

    statTotalTasks.textContent = totalTasks || 0;
    statCompletedTasks.textContent = completedTasks || 0;
}

// --- 2. CONTROL DEL MODAL DE EDICIÓN ---
openEditBtn.addEventListener('click', () => {
    editUsernameInput.value = displayUsername.textContent; 
    editPasswordInput.value = '';
    editModal.classList.remove('hidden');
});

cancelEditBtn.addEventListener('click', () => {
    editModal.classList.add('hidden');
});

// --- 3. GUARDAR CAMBIOS DE PERFIL ---
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = 'Guardando...';
    saveBtn.disabled = true;

    const newUsername = editUsernameInput.value.trim();
    const newPassword = editPasswordInput.value;
    const newAvatarFile = editAvatarInput.files[0];

    let updatedAvatarUrl = currentAvatarUrl;

    try {
        if (newAvatarFile) {
            const fileExt = newAvatarFile.name.split('.').pop();
            const fileName = `${currentUserId}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, newAvatarFile, { upsert: true });

            if (uploadError) throw new Error('No se pudo subir la imagen.');

            const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);
            
            updatedAvatarUrl = publicUrlData.publicUrl;
        }

        const { error: dbUpdateError } = await supabase
            .from('users')
            .update({ 
                username: newUsername,
                profile_picture_url: updatedAvatarUrl
            })
            .eq('id', currentUserId);

        if (dbUpdateError) {
            if (dbUpdateError.message.includes('unique constraint')) {
                throw new Error('Ese nombre de usuario ya está ocupado.');
            } else {
                throw new Error('Error al actualizar el perfil público.');
            }
        }

        if (newPassword && newPassword.length >= 6) {
            const { error: authUpdateError } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (authUpdateError) throw new Error('Error al cambiar la contraseña.');
        }

        showToast('¡Perfil actualizado con éxito!', 'success');
        
        displayUsername.textContent = newUsername;
        if (updatedAvatarUrl) {
            avatarPreview.src = updatedAvatarUrl;
            avatarPreview.classList.remove('hidden');
            avatarPlaceholder.classList.add('hidden');
        } else {
            avatarPlaceholder.textContent = newUsername.charAt(0);
            avatarPreview.classList.add('hidden');
            avatarPlaceholder.classList.remove('hidden');
        }
        
        editModal.classList.add('hidden'); 
        editAvatarInput.value = ''; 

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        saveBtn.textContent = originalBtnText;
        saveBtn.disabled = false;
    }
});

// --- 4. CONTROL DEL MODAL DE BORRADO DE CUENTA (ACTUALIZADO) ---
openDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.remove('hidden');
});

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
});

confirmDeleteBtn.addEventListener('click', async () => {
    confirmDeleteBtn.textContent = 'Borrando...';
    confirmDeleteBtn.disabled = true;

    try {
        // Llamada a la función RPC de SQL para borrar el usuario de auth.users
        const { error: deleteError } = await supabase.rpc('delete_my_user');

        if (deleteError) throw new Error('No se pudo eliminar la cuenta del sistema.');

        // Cerramos sesión después del borrado
        await supabase.auth.signOut();
        window.location.href = 'index.html';

    } catch (error) {
        console.error(error);
        showToast('Error al borrar la cuenta: ' + error.message, 'error');
        confirmDeleteBtn.textContent = 'Sí, borrar cuenta';
        confirmDeleteBtn.disabled = false;
        deleteModal.classList.add('hidden');
    }
});

// --- INICIALIZACIÓN ---
window.addEventListener('DOMContentLoaded', loadProfileData);