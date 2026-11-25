import { supabase } from './supabase.js';

const DISMISSED_EXPIRING_KEY = 'dismissed_expiring_notifications_v1';

function formatLocalDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getTodayLocalDateStr() {
    return formatLocalDate(new Date());
}

function getTomorrowLocalDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
}

function getDismissedExpiringSet() {
    try {
        const raw = localStorage.getItem(DISMISSED_EXPIRING_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

function saveDismissedExpiringSet(setObj) {
    try {
        localStorage.setItem(DISMISSED_EXPIRING_KEY, JSON.stringify([...setObj]));
    } catch {
        // Ignorar errores de cuota
    }
}

function dismissExpiringKey(key) {
    const setObj = getDismissedExpiringSet();
    setObj.add(key);
    saveDismissedExpiringSet(setObj);
}

// --- CREAR / LIMPIAR NOTIFICACIONES PERSISTENTES ---
export async function notifyGroupAdded(targetUserId, groupId, groupName) {
    if (!targetUserId || !groupId) return;
    await supabase.from('notifications').insert([{
        user_id: targetUserId,
        group_id: groupId,
        type: 'group_added',
        title: 'Nuevo grupo',
        message: `Te han añadido al grupo "${groupName}".`
    }]);
}

export async function notifyGroupTaskAssigned(targetUserId, groupId, taskId, groupName, taskTitle) {
    if (!targetUserId || !groupId || !taskId) return;
    await supabase.from('notifications').insert([{
        user_id: targetUserId,
        group_id: groupId,
        task_id: taskId,
        type: 'group_task_assigned',
        title: `Tarea en ${groupName}`,
        message: `Se te ha asignado la tarea "${taskTitle}".`
    }]);
}

export async function deleteNotificationsForUserInGroup(userId, groupId) {
    if (!userId || !groupId) return;
    await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .eq('group_id', groupId);
}

export async function deleteNotificationsForGroup(groupId) {
    if (!groupId) return;
    await supabase
        .from('notifications')
        .delete()
        .eq('group_id', groupId);
}

// --- CARGAR Y RENDERIZAR NOTIFICACIONES EN EL PANEL LATERAL ---
export async function refreshNotificationsPanel(userId) {
    const listEl = document.getElementById('notifications-list');
    const badgeEl = document.getElementById('notifications-count-badge');
    if (!listEl || !userId) return;

    const todayStr = getTodayLocalDateStr();
    const tomorrowStr = getTomorrowLocalDateStr();
    const targetDates = [todayStr, tomorrowStr];
    const dismissedExpiring = getDismissedExpiringSet();

    // 1. Notificaciones persistentes en BD (añadido a grupo / tarea de grupo asignada)
    const { data: dbNotifications } = await supabase
        .from('notifications')
        .select('id, group_id, task_id, type, title, message, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    // 2. Tareas personales que vencen HOY o MAÑANA (si ya vencieron ayer o antes, no salen)
    const { data: personalTasks } = await supabase
        .from('personal_tasks')
        .select('id, title, due_date, is_completed')
        .eq('user_id', userId)
        .eq('is_completed', false)
        .in('due_date', targetDates);

    // 3. Tareas de grupo asignadas a mí que vencen HOY o MAÑANA
    const { data: groupTasks } = await supabase
        .from('group_tasks')
        .select('id, title, due_date, is_completed, group_id, groups(name)')
        .eq('assigned_to', userId)
        .eq('is_completed', false)
        .in('due_date', targetDates);

    const items = [];

    // Primero las que expiran HOY (mayor urgencia)
    (personalTasks || []).filter(t => t.due_date === todayStr).forEach(t => {
        const key = `personal_${t.id}_${t.due_date}`;
        if (dismissedExpiring.has(key)) return;
        items.push({
            kind: 'expiring',
            dismissKey: key,
            icon: '⚠️',
            accentColor: '#dc3545',
            title: 'Expira hoy (Personal)',
            message: `La tarea "${t.title}" vence hoy (${t.due_date}).`
        });
    });

    (groupTasks || []).filter(gt => gt.due_date === todayStr).forEach(gt => {
        const key = `group_${gt.id}_${gt.due_date}`;
        if (dismissedExpiring.has(key)) return;
        const gName = gt.groups && gt.groups.name ? gt.groups.name : 'Grupo';
        items.push({
            kind: 'expiring',
            dismissKey: key,
            icon: '⚠️',
            accentColor: '#dc3545',
            title: `Expira hoy (${gName})`,
            message: `La tarea "${gt.title}" vence hoy (${gt.due_date}).`
        });
    });

    // Luego las que expiran MAÑANA
    (personalTasks || []).filter(t => t.due_date === tomorrowStr).forEach(t => {
        const key = `personal_${t.id}_${t.due_date}`;
        if (dismissedExpiring.has(key)) return;
        items.push({
            kind: 'expiring',
            dismissKey: key,
            icon: '⏳',
            accentColor: '#fd7e14',
            title: 'Expira mañana (Personal)',
            message: `La tarea "${t.title}" vence mañana (${t.due_date}).`
        });
    });

    (groupTasks || []).filter(gt => gt.due_date === tomorrowStr).forEach(gt => {
        const key = `group_${gt.id}_${gt.due_date}`;
        if (dismissedExpiring.has(key)) return;
        const gName = gt.groups && gt.groups.name ? gt.groups.name : 'Grupo';
        items.push({
            kind: 'expiring',
            dismissKey: key,
            icon: '⏳',
            accentColor: '#fd7e14',
            title: `Expira mañana (${gName})`,
            message: `La tarea "${gt.title}" vence mañana (${gt.due_date}).`
        });
    });

    // Finalmente las notificaciones persistentes
    (dbNotifications || []).forEach(n => {
        const isGroupAdded = n.type === 'group_added';
        items.push({
            kind: 'db',
            id: n.id,
            icon: isGroupAdded ? '👥' : '📌',
            accentColor: isGroupAdded ? '#28a745' : '#007bff',
            title: n.title,
            message: n.message
        });
    });

    if (badgeEl) {
        badgeEl.textContent = String(items.length);
    }

    listEl.innerHTML = '';
    if (items.length === 0) {
        listEl.innerHTML = '<li class="empty-state" style="font-size: 13px; color: #888; text-align: center; padding: 12px 0;">No tienes notificaciones.</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'notification-item';
        li.style.borderLeftColor = item.accentColor;

        li.innerHTML = `
            <div class="notification-body">
                <div class="notification-title">${item.icon} ${item.title}</div>
                <div class="notification-message">${item.message}</div>
            </div>
            <button type="button" class="notification-delete-btn" title="Eliminar notificación">✕</button>
        `;

        const delBtn = li.querySelector('.notification-delete-btn');
        delBtn.addEventListener('click', async () => {
            delBtn.disabled = true;
            if (item.kind === 'db') {
                await supabase.from('notifications').delete().eq('id', item.id);
            } else {
                dismissExpiringKey(item.dismissKey);
            }
            await refreshNotificationsPanel(userId);
        });

        listEl.appendChild(li);
    });
}