import { supabase } from './supabase.js';

const updatePasswordForm = document.getElementById('update-password-form');
const newPasswordInput = document.getElementById('new-password');
const confirmNewPasswordInput = document.getElementById('confirm-new-password');
const updateBtn = document.getElementById('update-btn');
const toastNotification = document.getElementById('toast-notification');

// --- SISTEMA DE NOTIFICACIONES TOAST ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { 
        toastNotification.classList.remove('show'); 
    }, 3500);
}

// --- VALIDAR SESIÓN DE RECUPERACIÓN AL CARGAR LA PÁGINA ---
window.addEventListener('DOMContentLoaded', async () => {
    // Supabase procesa automáticamente el token de la URL (hash) al cargar
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        showToast('El enlace de recuperación es inválido o ha caducado.', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3500);
    }
});

// --- GESTIÓN DE ACTUALIZACIÓN DE CONTRASEÑA ---
updatePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmNewPasswordInput.value.trim();

    if (newPassword !== confirmPassword) {
        showToast('Las contraseñas no coinciden.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres.', 'error');
        return;
    }

    updateBtn.disabled = true;
    updateBtn.textContent = 'Actualizando...';

    try {
        // Actualizamos la contraseña del usuario autenticado mediante el token temporal
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        showToast('¡Contraseña actualizada con éxito! Redirigiendo...', 'success');
        
        // Redirigimos al usuario al dashboard tras un breve instante
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);

    } catch (err) {
        showToast(err.message || 'Error al actualizar la contraseña.', 'error');
        updateBtn.disabled = false;
        updateBtn.textContent = 'Actualizar Contraseña';
    }
});