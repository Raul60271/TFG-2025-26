import { supabase } from './supabase.js';

// --- 0. SISTEMA DE NOTIFICACIONES (TOAST) ---
const toastNotification = document.getElementById('toast-notification');

function showToast(message, type) {
    toastNotification.textContent = message;
    // Eliminamos clases anteriores y añadimos 'show' y el tipo (success o error)
    toastNotification.className = `toast show ${type}`;
    
    // Ocultar automáticamente después de 4.5 segundos
    setTimeout(() => {
        toastNotification.classList.remove('show');
    }, 4500);
}

// --- 1. REFERENCIAS A LOS ELEMENTOS DEL HTML ---
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const goToRegisterBtn = document.getElementById('go-to-register');
const goToLoginBtn = document.getElementById('go-to-login');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// --- 2. ALTERNAR ENTRE LOGIN Y REGISTRO ---
goToRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault(); 
    loginSection.classList.add('hidden');
    registerSection.classList.remove('hidden');
});

goToLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    registerSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
});

// --- 3. LÓGICA DE REGISTRO ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    // Comprobamos que las contraseñas coinciden
    if (password !== confirmPassword) {
        showToast('Las contraseñas no coinciden. Por favor, escríbelas de nuevo.', 'error');
        return;
    }

    try {
        // A. Registramos al usuario en la Autenticación de Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (authError) throw authError;

        // B. Si se registra bien, guardamos sus datos en TU tabla pública "users"
        if (authData.user) {
            const { error: dbError } = await supabase
                .from('users')
                .insert([
                    {
                        id: authData.user.id, 
                        email: email,
                        username: username
                    }
                ]);

            if (dbError) throw dbError;

            // Mensaje de éxito pulido
            showToast('¡Cuenta creada! Revisa tu bandeja de entrada y verifica tu correo para poder entrar.', 'success');
            
            // Limpiamos el formulario y volvemos a la pantalla de login
            registerForm.reset();
            registerSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error en el registro:', error);
        
        // Mensajes de error de registro optimizados
        let mensajeError = 'No hemos podido crear tu cuenta. Inténtalo más tarde.';
        
        if (error.message.includes('rate limit')) {
            mensajeError = 'Has alcanzado el límite de registros. Por favor, espera unos minutos.';
        } else if (error.message.includes('foreign key constraint') || error.message.includes('already registered')) {
            mensajeError = 'Ese correo o nombre de usuario ya pertenecen a otra cuenta.';
        } else if (error.message.includes('Password should be at least')) {
            mensajeError = 'Tu contraseña es muy corta. Usa al menos 6 caracteres.';
        } else {
            mensajeError = 'Error: ' + error.message; 
        }

        showToast(mensajeError, 'error');
    }
});

// --- 4. LÓGICA DE INICIO DE SESIÓN ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        // Iniciamos sesión con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // Si todo va bien, redirigimos al gestor de tareas
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        
        // Mensajes de error de inicio de sesión optimizados
        let mensajeError = 'Ocurrió un error al intentar iniciar sesión.';
        
        if (error.message.includes('Email not confirmed')) {
            mensajeError = 'Falta verificar tu cuenta. Busca el enlace de activación en tu correo electrónico.';
        } else if (error.message.includes('Invalid login credentials')) {
            mensajeError = 'Correo o contraseña incorrectos. Revísalos e inténtalo de nuevo.';
        } else if (error.message.includes('rate limit')) {
            mensajeError = 'Demasiados intentos fallidos. Por tu seguridad, espera unos minutos.';
        }

        showToast(mensajeError, 'error');
    }
});