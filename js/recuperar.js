import { supabase } from './supabase.js';

const recoveryForm = document.getElementById('recovery-form');
const recoveryEmailInput = document.getElementById('recovery-email');
const recoveryBtn = document.getElementById('recovery-btn');
const toastNotification = document.getElementById('toast-notification');

// --- SISTEMA DE NOTIFICACIONES TOAST ---
function showToast(message, type) {
    toastNotification.textContent = message;
    toastNotification.className = `toast show ${type}`;
    setTimeout(() => { 
        toastNotification.classList.remove('show'); 
    }, 3500);
}

// --- GESTIÓN DE ENVÍO DE CORREO DE RECUPERACIÓN ---
recoveryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = recoveryEmailInput.value.trim();
    
    recoveryBtn.disabled = true;
    recoveryBtn.textContent = 'Enviando...';

    try {
        // Solicitamos a Supabase el envío del correo de recuperación
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://gestordetareastfgraulsanromanduran.netlify.app/actualizar-password.html'
        });

        if (error) throw error;

        showToast('¡Correo de recuperación enviado con éxito! Revisa tu bandeja.', 'success');
        recoveryEmailInput.value = '';

    } catch (err) {
        // Si el correo no existe o hay un fallo de red, mostramos el mensaje de error correspondiente
        showToast(err.message || 'No se pudo procesar la solicitud.', 'error');
    } finally {
        recoveryBtn.disabled = false;
        recoveryBtn.textContent = 'Enviar Enlace';
    }
});