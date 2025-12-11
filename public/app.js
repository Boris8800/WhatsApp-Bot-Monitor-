$(document).ready(function() {
    const socket = io();
    let currentGroupConfig = null;
    let qrCode = null;
    let qrTimer = null;
    let uptimeInterval = null;
    let startTime = Date.now();
    let charts = {};

    // Configurar Toastr
    toastr.options = {
        positionClass: "toast-top-right",
        timeOut: 4000,
        closeButton: true,
        progressBar: true,
        preventDuplicates: true,
        newestOnTop: true,
        showEasing: "swing",
        hideEasing: "linear",
        showMethod: "fadeIn",
        hideMethod: "fadeOut"
    };

    // ==================== SOCKET EVENTS ====================
    socket.on('connect', () => {
        console.log('Conectado al servidor');
        updateStatus('connected');
        updateDiagnostic('server', 'ok', 'Conectado');
        updateDiagnostic('socket', 'ok', 'Conectado');
        toastr.success('Conectado al servidor', 'Conexión Exitosa');
        startUptime();
    });

    function updateDiagnostic(type, status, text) {
        let selector, item;
        switch(type) {
            case 'server':
                selector = '#serverStatus';
                item = $(selector).parent().parent();
                break;
            case 'whatsapp':
                selector = '#waStatus';
                item = $(selector).parent().parent();
                break;
            case 'socket':
                selector = '#socketStatus';
                item = $(selector).parent().parent();
                break;
        }
        
        if (selector && $(selector).length) {
            $(selector).text(text);
            item.removeClass('status-ok status-error status-warning');
            item.addClass('status-' + status);
        }
    }

    socket.on('disconnect', () => {
        console.log('Desconectado del servidor');
        updateStatus('disconnected');
        toastr.error('Desconectado del servidor', 'Conexión Perdida');
        stopUptime();
    });

    // WhatsApp connection events
    socket.on('wa-connecting', function(data) {
        updateWhatsAppStatus('connecting', data?.message || 'Conectando...');
        updateDiagnostic('whatsapp', 'warning', 'Conectando...');
    });

    socket.on('wa-qr', function() {
        updateWhatsAppStatus('disconnected', 'Esperando QR');
    });

    socket.on('authenticated', function() {
        updateWhatsAppStatus('connecting', 'Autenticado');
        toastr.success('WhatsApp autenticado', '✓ Éxito');
    });

    socket.on('wa-ready', function() {
        updateWhatsAppStatus('connected', 'Conectado');
        updateDiagnostic('whatsapp', 'ok', 'Conectado ✓');
        toastr.success('WhatsApp Web conectado', '✓ Online');
    });

    socket.on('wa-disconnected', function(reason) {
        updateWhatsAppStatus('disconnected', 'Desconectado');
        updateDiagnostic('whatsapp', 'error', 'Desconectado');
        toastr.error('WhatsApp desconectado: ' + (reason || 'Sin razón'), 'Desconectado');
    });

    socket.on('auth_failure', function(msg) {
        updateWhatsAppStatus('disconnected', 'Error Auth');
        toastr.error('Error de autenticación: ' + msg, 'Error');
    });

    function updateWhatsAppStatus(state, text) {
        const statusEl = $('#whatsappStatus');
        const textEl = $('#waConnectionState');
        
        // Remove all state classes
        statusEl.removeClass('wa-connected wa-disconnected wa-connecting wa-error');
        
        // Add new state class
        statusEl.addClass('wa-' + state);
        
        // Update text
        textEl.text(text);
        
        // Animate
        statusEl.addClass('animate__animated animate__pulse');
        setTimeout(() => statusEl.removeClass('animate__animated animate__pulse'), 600);
        
        // No auto-reconnect - usuario debe hacerlo manualmente
    }
    
    // Reconnect WhatsApp function
    function reconnectWhatsApp() {
        const btn = $('#reconnectBtn');
        const btnLarge = $('#reconnectLargeBtn');
        btn.addClass('spinning');
        btnLarge.addClass('spinning');
        
        $.post('/api/reconnect-whatsapp', function(response) {
            if (response.success) {
                toastr.info('Intentando reconectar WhatsApp...', 'Reconectando');
                updateWhatsAppStatus('connecting', 'Reconectando...');
            } else {
                toastr.error(response.message || 'No se pudo reconectar', 'Error');
                updateWhatsAppStatus('error', 'Error');
            }
        }).fail(function() {
            toastr.error('Error al intentar reconectar', 'Error');
            updateWhatsAppStatus('error', 'Error');
        }).always(function() {
            setTimeout(() => {
                btn.removeClass('spinning');
                btnLarge.removeClass('spinning');
            }, 1000);
        });
    }
    
    // Manual reconnect button
    $('#reconnectBtn').click(function() {
        reconnectWhatsApp();
    });

    // Botón de reconexión grande
    $('#reconnectLargeBtn').click(function() {
        reconnectWhatsApp();
    });

    socket.on('qr', (qr) => {
        console.log('\ud83d\udce1 Evento QR recibido desde el servidor');
        console.log('Longitud del QR:', qr ? qr.length : 0);
        if (!qr) {
            console.error('QR vac\u00edo recibido');
            toastr.error('C\u00f3digo QR vac\u00edo', 'Error');
            return;
        }
        showQRModal(qr);
        startQRTimer();
    });

    socket.on('authenticated', () => {
        toastr.success('WhatsApp autenticado correctamente', '✓ Autenticado');
        $('#qrModal').removeClass('active');
        updateStatus('authenticated');
        stopQRTimer();
        confetti();
    });

    socket.on('auth_failure', (msg) => {
        toastr.error('Error de autenticación: ' + msg, 'Error');
        updateStatus('auth_failed');
        stopQRTimer();
    });

    socket.on('config', (config) => {
        updateConfigUI(config);
    });

    socket.on('chats-loaded', (groups) => {
        updateAvailableGroups(groups);
        toastr.info(groups.length + ' groups loaded', 'Available Groups');
    });

    socket.on('available-groups', (groups) => {
        updateAvailableGroups(groups);
    });

    socket.on('new-group-message', (data) => {
        handleNewMessage(data);
    });

    socket.on('stats', (stats) => {
        updateStats(stats);
    });

    socket.on('stats-update', (stats) => {
        updateStats(stats);
        updateCharts(stats);
    });

    socket.on('group-added', (group) => {
        toastr.success('Grupo "' + group.name + '" agregado al monitoreo', 'Grupo Agregado');
        addMonitoredGroup(group);
        updateMonitoringBadge();
    });

    socket.on('group-removed', (groupId) => {
        toastr.info('Grupo eliminado del monitoreo', 'Grupo Eliminado');
        removeMonitoredGroup(groupId);
        updateMonitoringBadge();
    });

    socket.on('group-updated', (data) => {
        toastr.success('Configuración del grupo actualizada', 'Actualizado');
        updateMonitoredGroup(data.groupId, data.updates);
    });

    // ==================== UI FUNCTIONS ====================
    function updateStatus(status) {
        const statusDot = $('#botStatus .status-dot');
        const statusText = $('#botStatus span:last');
        
        switch(status) {
            case 'connected':
                statusDot.addClass('connected pulse').removeClass('disconnected');
                statusText.html('Bot: <strong>Conectado</strong>');
                break;
            case 'disconnected':
                statusDot.addClass('disconnected').removeClass('connected pulse');
                statusText.html('Bot: <strong>Desconectado</strong>');
                break;
            case 'authenticated':
                statusDot.addClass('connected pulse');
                statusText.html('Bot: <strong>Autenticado</strong>');
                break;
            case 'auth_failed':
                statusDot.addClass('disconnected').removeClass('connected pulse');
                statusText.html('Bot: <strong>Error de autenticación</strong>');
                break;
        }
    }

    function showQRModal(qr) {
        const modal = $('#qrModal');
        const container = $('#qrcodeContainer');
        
        container.empty();
        
        const canvas = document.createElement('canvas');
        container.append(canvas);
        
        QRCode.toCanvas(canvas, qr, {
            width: 280,
            margin: 2,
            color: {
                dark: '#667eea',
                light: '#ffffff'
            }
        }, function(error) {
            if (error) {
                console.error('Error generando QR:', error);
                container.html('<p class="text-danger">Error generando código QR</p>');
                toastr.error('No se pudo generar el código QR', 'Error');
            }
        });
        
        modal.addClass('active');
    }

    function startQRTimer() {
        let timeLeft = 60;
        $('#qrTimer').text(timeLeft);
        
        qrTimer = setInterval(() => {
            timeLeft--;
            $('#qrTimer').text(timeLeft);
            
            if (timeLeft <= 0) {
                stopQRTimer();
                toastr.warning('El código QR ha expirado. Generando uno nuevo...', 'QR Expirado');
            }
        }, 1000);
    }

    function stopQRTimer() {
        if (qrTimer) {
            clearInterval(qrTimer);
            qrTimer = null;
        }
    }

    function startUptime() {
        startTime = Date.now();
        uptimeInterval = setInterval(updateUptime, 1000);
    }

    function stopUptime() {
        if (uptimeInterval) {
            clearInterval(uptimeInterval);
            uptimeInterval = null;
        }
    }

    function updateUptime() {
        const elapsed = Date.now() - startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        $('#uptime').text(
            String(hours).padStart(2, '0') + ':' + 
            String(minutes).padStart(2, '0') + ':' + 
            String(seconds).padStart(2, '0')
        );
    }

    function updateConfigUI(config) {
        $('#botActive').prop('checked', config.botActive);
        $('#readOnly').prop('checked', config.readOnly);
        $('#keywords').val(config.keywords.join(', '));
        $('#minFare').val(config.minFare);
        
        const emailsText = config.emails.map(e => e.user + ',' + e.pass).join('\n');
        $('#emails').val(emailsText);
    }

    function updateAvailableGroups(groups) {
        const container = $('#availableGroups');
        
        if (!groups || groups.length === 0) {
            container.html('\
                <div class="empty-state animate__animated animate__fadeIn">\
                    <div class="empty-icon">\
                        <i class="fas fa-users fa-3x"></i>\
                    </div>\
                    <h4>No hay grupos disponibles</h4>\
                    <p>Conecta WhatsApp para ver los grupos</p>\
                </div>\
            ');
            return;
        }

        let html = '';
        groups.forEach((group, index) => {
            html += '\
                <div class="group-card card animate__animated animate__fadeInUp" \
                     data-group-id="' + group.id + '"\
                     style="animation-delay: ' + (index * 0.05) + 's">\
                    <div class="group-card-header">\
                        <div class="group-avatar">\
                            <i class="fas fa-users"></i>\
                        </div>\
                        <div class="group-info">\
                            <h4>' + escapeHtml(group.name) + '</h4>\
                            <p class="group-meta">\
                                <i class="fas fa-user-friends"></i> ' + (group.participants || 0) + ' participantes\
                            </p>\
                        </div>\
                    </div>\
                    <div class="group-card-body">\
                        <p class="group-id"><small>' + group.id + '</small></p>\
                    </div>\
                    <div class="group-actions">\
                        <button class="btn btn-monitoring" data-action="monitor">\
                            <i class="fas fa-eye"></i> Monitorear\
                        </button>\
                    </div>\
                </div>\
            ';
        });
        
        container.html(html);
        $('#groupsStatus span:last').html('Grupos: <strong>' + groups.length + '</strong>');
        attachGroupActions();
        
        socket.emit('request-monitored-groups');
    }

    function addMonitoredGroup(group) {
        const container = $('#monitoredGroups');
        const currentGroups = container.find('.monitored-card').length;
        
        if (currentGroups === 0) {
            container.empty();
        }
        
        const html = '\
            <div class="monitored-card card animate__animated animate__fadeInUp" data-group-id="' + group.id + '">\
                <div class="monitored-header">\
                    <div class="monitored-title">\
                        <div class="group-avatar-sm">\
                            <i class="fas fa-users"></i>\
                        </div>\
                        <div>\
                            <h4>' + escapeHtml(group.name) + '</h4>\
                            <span class="monitored-id"><small>' + group.id + '</small></span>\
                        </div>\
                    </div>\
                    <div class="monitored-status">\
                        <span class="status-badge ' + (group.enabled ? 'active' : 'inactive') + '">\
                            <i class="fas fa-circle"></i>\
                            ' + (group.enabled ? 'Activo' : 'Inactivo') + '\
                        </span>\
                    </div>\
                </div>\
                <div class="monitored-body">\
                    <div class="monitored-stats">\
                        <div class="stat">\
                            <div class="stat-icon">\
                                <i class="fas fa-comments"></i>\
                            </div>\
                            <div>\
                                <span class="stat-label">Total</span>\
                                <span class="stat-value">' + (group.stats?.totalMessages || 0) + '</span>\
                            </div>\
                        </div>\
                        <div class="stat">\
                            <div class="stat-icon warning">\
                                <i class="fas fa-filter"></i>\
                            </div>\
                            <div>\
                                <span class="stat-label">Filtrados</span>\
                                <span class="stat-value">' + (group.stats?.filteredMessages || 0) + '</span>\
                            </div>\
                        </div>\
                        <div class="stat">\
                            <div class="stat-icon info">\
                                <i class="fas fa-clock"></i>\
                            </div>\
                            <div>\
                                <span class="stat-label">Última Actividad</span>\
                                <span class="stat-value-small">Nunca</span>\
                            </div>\
                        </div>\
                    </div>\
                    <div class="monitored-config">\
                        <div class="config-item">\
                            <i class="fas fa-key"></i>\
                            <div>\
                                <label>Palabras Clave:</label>\
                                <span class="config-value">Usando configuración global</span>\
                            </div>\
                        </div>\
                        <div class="config-item">\
                            <i class="fas fa-pound-sign"></i>\
                            <div>\
                                <label>Tarifa Mínima:</label>\
                                <span class="config-value">£' + (group.minFare || $('#minFare').val()) + '</span>\
                            </div>\
                        </div>\
                    </div>\
                </div>\
                <div class="monitored-actions">\
                    <button class="btn btn-view-logs btn-sm" data-action="view-logs" title="Ver logs">\
                        <i class="fas fa-list"></i> Logs\
                    </button>\
                    <button class="btn btn-export btn-sm" data-action="export" title="Exportar datos">\
                        <i class="fas fa-download"></i> Exportar\
                    </button>\
                    <button class="btn btn-config btn-sm" data-action="configure" title="Configurar">\
                        <i class="fas fa-cog"></i>\
                    </button>\
                    <button class="btn btn-remove btn-sm" data-action="remove" title="Eliminar">\
                        <i class="fas fa-trash"></i>\
                    </button>\
                </div>\
            </div>\
        ';
        
        container.append(html);
        attachMonitoredGroupActions();
    }

    function removeMonitoredGroup(groupId) {
        $('.monitored-card[data-group-id="' + groupId + '"]')
            .addClass('animate__animated animate__fadeOutRight')
            .one('animationend', function() {
                $(this).remove();
                
                const count = $('#monitoredGroups .monitored-card').length;
                
                if (count === 0) {
                    $('#monitoredGroups').html('\
                        <div class="empty-state animate__animated animate__fadeIn">\
                            <div class="empty-icon">\
                                <i class="fas fa-eye-slash fa-3x"></i>\
                            </div>\
                            <h4>No hay grupos monitoreados</h4>\
                            <p>Selecciona grupos para monitorear en la pestaña "Grupos"</p>\
                        </div>\
                    ');
                }
            });
        
        $('.group-card[data-group-id="' + groupId + '"] .btn-monitoring')
            .removeClass('monitoring')
            .html('<i class="fas fa-eye"></i> Monitorear')
            .attr('data-action', 'monitor');
        
        $('.group-card[data-group-id="' + groupId + '"] .btn-config').remove();
    }

    function updateMonitoredGroup(groupId, updates) {
        const card = $('.monitored-card[data-group-id="' + groupId + '"]');
        
        if (updates.enabled !== undefined) {
            card.find('.status-badge')
                .toggleClass('active', updates.enabled)
                .toggleClass('inactive', !updates.enabled)
                .html('<i class="fas fa-circle"></i> ' + (updates.enabled ? 'Activo' : 'Inactivo'));
        }
        
        if (updates.customKeywords) {
            card.find('.config-item:first .config-value').text(
                updates.customKeywords.join(', ') || 'Usando configuración global'
            );
        }
        
        if (updates.minFare !== undefined) {
            card.find('.config-item:last .config-value').text('£' + updates.minFare);
        }
        
        card.addClass('animate__animated animate__pulse')
            .one('animationend', function() {
                $(this).removeClass('animate__animated animate__pulse');
            });
    }

    function handleNewMessage(data) {
        animateNumber($('#totalMessagesStat'), parseInt($('#totalMessagesStat').text()) + 1);
        animateNumber($('#filteredMessagesStat'), parseInt($('#filteredMessagesStat').text()) + 1);
        
        const totalMsg = parseInt($('#messagesStatus span:last strong').text() || 0) + 1;
        $('#messagesStatus span:last').html('Mensajes: <strong>' + totalMsg + '</strong>');
        
        if (data.fare) {
            toastr.success(
                '£' + data.fare + ' encontrado en ' + data.groupName,
                '💰 Nueva Tarifa',
                { timeOut: 5000 }
            );
        } else {
            toastr.info(
                'Palabra clave encontrada en ' + data.groupName,
                '🔍 Mensaje Filtrado',
                { timeOut: 4000 }
            );
        }
        
        updateQuickStats();
    }

    function updateStats(stats) {
        animateNumber($('#totalMessagesStat'), stats.totalMessages || 0);
        animateNumber($('#filteredMessagesStat'), stats.filteredMessages || 0);
        animateNumber($('#monitoredGroupsStat'), stats.monitoredGroups || $('#monitoredCount').text());
        animateNumber($('#activeTodayStat'), stats.activeToday || 0);
        
        $('#messagesStatus span:last').html('Mensajes: <strong>' + (stats.totalMessages || 0) + '</strong>');
        
        updateQuickStats(stats);
    }

    function updateQuickStats(stats) {
        const total = parseInt($('#totalMessagesStat').text()) || 0;
        const filtered = parseInt($('#filteredMessagesStat').text()) || 0;
        const rate = total > 0 ? ((filtered / total) * 100).toFixed(1) : 0;
        
        animateNumber($('#quickActiveToday'), stats?.activeToday || 0);
        animateNumber($('#quickFilteredToday'), filtered);
        $('#quickFilterRate').text(rate + '%');
    }

    function animateNumber(element, targetValue) {
        const currentValue = parseInt(element.text()) || 0;
        const duration = 500;
        const steps = 20;
        const increment = (targetValue - currentValue) / steps;
        let current = currentValue;
        let step = 0;
        
        const timer = setInterval(() => {
            step++;
            current += increment;
            element.text(Math.round(current));
            
            if (step >= steps) {
                clearInterval(timer);
                element.text(targetValue);
            }
        }, duration / steps);
    }

    function updateMonitoringBadge() {
        const count = $('#monitoredGroups .monitored-card').length;
        $('#monitoredCount').text(count);
        $('#monitoringBadge').text(count);
        $('#monitoredGroupsStat').text(count);
    }

    // ==================== CHARTS ====================
    function initCharts() {
        const activityCtx = document.getElementById('activityChart');
        if (activityCtx) {
            charts.activity = new Chart(activityCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Mensajes',
                        data: [],
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        const distributionCtx = document.getElementById('distributionChart');
        if (distributionCtx) {
            charts.distribution = new Chart(distributionCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Filtrados', 'No Filtrados'],
                    datasets: [{
                        data: [0, 0],
                        backgroundColor: ['#667eea', '#e5e7eb']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    function updateCharts(stats) {
        if (charts.distribution && stats) {
            const total = stats.totalMessages || 0;
            const filtered = stats.filteredMessages || 0;
            charts.distribution.data.datasets[0].data = [filtered, total - filtered];
            charts.distribution.update();
        }
    }

    // ==================== EVENT HANDLERS ====================
    function attachGroupActions() {
        $('.group-actions button').off('click').on('click', function() {
            const button = $(this);
            const card = button.closest('.group-card');
            const groupId = card.data('group-id');
            const groupName = card.find('h4').text();
            const action = button.data('action');
            
            console.log('🔘 Botón clickeado:', action, groupName, groupId);
            
            switch(action) {
                case 'monitor':
                    button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Procesando...');
                    
                    console.log('📤 Enviando solicitud para monitorear:', groupId);
                    
                    $.post('/api/monitor-group', {
                        groupId: groupId,
                        groupName: groupName
                    }, function(response) {
                        console.log('📥 Respuesta del servidor:', response);
                        if (response.success) {
                            button
                                .addClass('monitoring')
                                .html('<i class="fas fa-eye-slash"></i> Dejar de Monitorear')
                                .attr('data-action', 'unmonitor')
                                .prop('disabled', false);
                                
                            if (!card.find('.btn-config').length) {
                                button.after('\
                                    <button class="btn btn-config" data-action="configure">\
                                        <i class="fas fa-cog"></i>\
                                    </button>\
                                ');
                                attachGroupActions();
                            }
                        } else {
                            console.error('❌ Error:', response.message);
                            button.prop('disabled', false).html('<i class="fas fa-eye"></i> Monitorear');
                            toastr.error('No se pudo agregar el grupo', 'Error');
                        }
                    }).fail(function() {
                        button.prop('disabled', false).html('<i class="fas fa-eye"></i> Monitorear');
                        toastr.error('Error de conexión', 'Error');
                    });
                    break;
                    
                case 'unmonitor':
                    if (confirm('¿Dejar de monitorear el grupo "' + groupName + '"?')) {
                        button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
                        
                        $.post('/api/unmonitor-group', {
                            groupId: groupId
                        }, function(response) {
                            if (response.success) {
                                button
                                    .removeClass('monitoring')
                                    .html('<i class="fas fa-eye"></i> Monitorear')
                                    .attr('data-action', 'monitor')
                                    .prop('disabled', false);
                                    
                                card.find('.btn-config').remove();
                            } else {
                                button.prop('disabled', false);
                                toastr.error('No se pudo eliminar el grupo', 'Error');
                            }
                        }).fail(function() {
                            button.prop('disabled', false);
                            toastr.error('Error de conexión', 'Error');
                        });
                    }
                    break;
                    
                case 'configure':
                    configureGroup(groupId, groupName);
                    break;
            }
        });
    }

    function attachMonitoredGroupActions() {
        console.log('🔗 Adjuntando eventos a grupos monitoreados');
        $('.monitored-actions button').off('click').on('click', function() {
            const button = $(this);
            const card = button.closest('.monitored-card');
            const groupId = card.data('group-id');
            const groupName = card.find('h4').text();
            const action = button.data('action');
            
            console.log('🔘 Acción en grupo monitoreado:', action, groupName);
            
            switch(action) {
                case 'view-logs':
                    $('[data-tab="logs"]').click();
                    $('#logGroupSelect').val(groupId).change();
                    break;
                    
                case 'export':
                    window.open('/api/export-group/' + groupId + '?format=json', '_blank');
                    toastr.success('Exportando datos de "' + groupName + '"', 'Exportando');
                    break;
                    
                case 'configure':
                    configureGroup(groupId, groupName);
                    break;
                    
                case 'remove':
                    console.log('🗑️ Intentando eliminar grupo:', groupName);
                    if (confirm('¿Eliminar el grupo "' + groupName + '" del monitoreo?')) {
                        console.log('✅ Usuario confirmó eliminación');
                        $.post('/api/unmonitor-group', {
                            groupId: groupId
                        }, function(response) {
                            console.log('📥 Respuesta de eliminación:', response);
                            if (response.success) {
                                toastr.success('Grupo eliminado', 'Éxito');
                            } else {
                                toastr.error(response.message || 'Error al eliminar', 'Error');
                            }
                        }).fail(function(err) {
                            console.error('❌ Error en petición:', err);
                            toastr.error('Error de conexión', 'Error');
                        });
                    } else {
                        console.log('❌ Usuario canceló eliminación');
                    }
                    break;
            }
        });
    }

    function configureGroup(groupId, groupName) {
        $.get('/api/monitored-groups', function(response) {
            if (response.success) {
                const group = response.groups.find(g => g.id === groupId) || {};
                
                $('#configGroupId').val(groupId);
                $('#configGroupName').val(groupName);
                $('#configGroupEnabled').prop('checked', group.enabled !== false);
                $('#configGroupKeywords').val((group.customKeywords || []).join(', '));
                $('#configGroupMinFare').val(group.minFare || $('#minFare').val());
                
                $('#groupConfigModal').addClass('active');
            }
        }).fail(function() {
            toastr.error('No se pudo cargar la configuración', 'Error');
        });
    }

    // ==================== FORM EVENTS ====================
    // ==================== QUICK CONFIG CHANGE DETECTION ====================
    let quickConfigChanged = false;
    const originalQuickConfig = {
        botActive: $('#botActive').prop('checked'),
        readOnly: $('#readOnly').prop('checked')
    };

    function checkQuickConfigChanges() {
        const currentConfig = {
            botActive: $('#botActive').prop('checked'),
            readOnly: $('#readOnly').prop('checked')
        };

        quickConfigChanged = JSON.stringify(currentConfig) !== JSON.stringify(originalQuickConfig);

        if (quickConfigChanged) {
            $('#configStatus').show().addClass('animate__animated animate__fadeIn');
            $('#applyConfig').prop('disabled', false);
        } else {
            $('#configStatus').hide();
            $('#applyConfig').prop('disabled', true);
        }
    }

    // Monitor quick config toggles
    $('#botActive, #readOnly').change(function() {
        checkQuickConfigChanges();
        
        // Visual feedback on toggle
        const card = $(this).closest('.config-toggle-card');
        card.addClass('animate__animated animate__pulse');
        setTimeout(() => card.removeClass('animate__animated animate__pulse'), 600);
    });

    // Apply quick config button
    $('#applyConfig').click(function() {
        const button = $(this);
        button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Aplicando...');
        
        const quickConfig = {
            botActive: $('#botActive').prop('checked'),
            readOnly: $('#readOnly').prop('checked')
        };
        
        $.post('/api/save-quick-config', quickConfig, function(response) {
            if (response.success) {
                toastr.success('Configuración rápida aplicada', '✓ Aplicado');
                // Update original config to reset change detection
                originalQuickConfig.botActive = quickConfig.botActive;
                originalQuickConfig.readOnly = quickConfig.readOnly;
                quickConfigChanged = false;
                $('#configStatus').hide();
                
                // Animate all config cards
                $('.config-toggle-card').addClass('animate__animated animate__tada');
                setTimeout(() => $('.config-toggle-card').removeClass('animate__animated animate__tada'), 1000);
            } else {
                toastr.error('No se pudo aplicar la configuración', 'Error');
            }
        }).fail(function() {
            toastr.error('Error de conexión', 'Error');
        }).always(function() {
            button.prop('disabled', false).html('<i class="fas fa-check"></i> Aplicar');
        });
    });

    // Full config save (includes keywords, minFare, emails)
    $('#saveConfig').click(function() {
        const button = $(this);
        button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Guardando...');
        
        const emails = $('#emails').val().split('\n')
            .map(line => {
                const parts = line.split(',');
                const user = parts[0];
                const pass = parts[1];
                return user && pass ? { user: user.trim(), pass: pass.trim() } : null;
            })
            .filter(e => e);
        
        const config = {
            botActive: $('#botActive').prop('checked'),
            readOnly: $('#readOnly').prop('checked'),
            keywords: $('#keywords').val().split(',').map(k => k.trim()).filter(k => k),
            minFare: parseInt($('#minFare').val()) || 100,
            emails: emails
        };
        
        $.post('/api/save-config', config, function(response) {
            if (response.success) {
                toastr.success('Configuración guardada correctamente', '✓ Guardado');
                // Update quick config baseline when full save happens
                originalQuickConfig.botActive = config.botActive;
                originalQuickConfig.readOnly = config.readOnly;
                quickConfigChanged = false;
                $('#configStatus').hide();
            } else {
                toastr.error('No se pudo guardar la configuración', 'Error');
            }
        }).fail(function() {
            toastr.error('Error de conexión', 'Error');
        }).always(function() {
            button.prop('disabled', false).html('<i class="fas fa-save"></i> Guardar Cambios');
        });
    });

    $('#groupConfigForm').submit(function(e) {
        e.preventDefault();
        
        const button = $(this).find('button[type="submit"]');
        button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Guardando...');
        
        const updates = {
            enabled: $('#configGroupEnabled').prop('checked'),
            customKeywords: $('#configGroupKeywords').val().split(',').map(k => k.trim()).filter(k => k),
            minFare: parseInt($('#configGroupMinFare').val()) || $('#minFare').val()
        };
        
        $.post('/api/update-group-config', {
            groupId: $('#configGroupId').val(),
            updates: updates
        }, function(response) {
            if (response.success) {
                $('#groupConfigModal').removeClass('active');
                toastr.success('Configuración actualizada', '✓ Guardado');
            } else {
                toastr.error('No se pudo actualizar', 'Error');
            }
        }).fail(function() {
            toastr.error('Error de conexión', 'Error');
        }).always(function() {
            button.prop('disabled', false).html('<i class="fas fa-save"></i> Guardar Configuración');
        });
    });

    // ==================== TABS ====================
    $('.tab-btn').click(function() {
        const tab = $(this).data('tab');
        
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');
        
        $('.tab-pane').removeClass('active');
        $('#tab-' + tab).addClass('active');
        
        if (tab === 'stats' && !charts.activity) {
            setTimeout(initCharts, 100);
        }
    });

    // ==================== FILTERS ====================
    $('.filter-chip').click(function() {
        $('.filter-chip').removeClass('active');
        $(this).addClass('active');
        
        const filter = $(this).data('filter');
        const cards = $('.group-card');
        
        switch(filter) {
            case 'all':
                cards.show();
                break;
            case 'monitored':
                cards.hide();
                cards.has('.btn-monitoring.monitoring').show();
                break;
            case 'unmonitored':
                cards.hide();
                cards.not(':has(.btn-monitoring.monitoring)').show();
                break;
        }
    });

    // ==================== MODALS ====================
    $('.close-modal').click(function() {
        $(this).closest('.modal').removeClass('active');
    });

    $(window).click(function(e) {
        if ($(e.target).hasClass('modal')) {
            $('.modal').removeClass('active');
        }
    });

    // ==================== HEADER ACTIONS ====================
    $('#refreshBtn').click(function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        
        socket.emit('request-chats');
        socket.emit('request-stats');
        
        setTimeout(() => {
            icon.removeClass('fa-spin');
            toastr.success('Datos actualizados', 'Actualizado');
        }, 1000);
    });

    $('#refreshLogs').click(function() {
        const groupId = $('#logGroupSelect').val();
        if (!groupId) {
            toastr.warning('Selecciona un grupo primero', 'Logs');
            return;
        }
        loadGroupLogs(groupId);
    });
    
    $('#logGroupSelect').change(function() {
        const groupId = $(this).val();
        if (groupId) {
            loadGroupLogs(groupId);
        } else {
            $('#logsContainer').html('\
                <div class="log-placeholder">\
                    <i class="fas fa-file-alt fa-2x"></i>\
                    <p>Selecciona un grupo para ver sus logs</p>\
                </div>\
            ');
        }
    });
    
    function loadGroupLogs(groupId) {
        console.log('📥 Loading group logs:', groupId);
        toastr.info('Loading logs...', 'Logs');
        
        $.get('/api/group-logs/' + groupId, function(response) {
            console.log('📦 Logs received:', response);
            
            if (response.success && response.logs && response.logs.length > 0) {
                let html = '<div class="logs-list">';
                
                // Invertir para mostrar los más recientes primero
                const sortedLogs = response.logs.reverse();
                sortedLogs.forEach(function(log) {
                    const date = new Date(log.timestamp);
                    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                    const fareHtml = log.fare ? '<span class="log-fare">£' + log.fare + '</span>' : '';
                    const keywordsHtml = log.keywordsFound && log.keywordsFound.length > 0 
                        ? '<div class="log-keywords"><i class="fas fa-tags"></i> ' + log.keywordsFound.join(', ') + '</div>'
                        : '';
                    
                    // Indicador de mensaje multimedia
                    const mediaIcon = log.hasMedia && log.mediaType !== 'chat'
                        ? '<span class="badge badge-info" style="margin-left:5px"><i class="fas fa-image"></i> Multimedia</span>'
                        : '';
                    
                    html += '\
                        <div class="log-entry card animate__animated animate__fadeIn">\
                            <div class="log-header">\
                                <div class="log-info">\
                                    <i class="fas fa-user"></i>\
                                    <strong>' + escapeHtml(log.contact) + '</strong>\
                                    ' + fareHtml + mediaIcon + '\
                                </div>\
                                <div class="log-date">\
                                    <i class="fas fa-clock"></i> ' + dateStr + '\
                                </div>\
                            </div>\
                            <div class="log-body">\
                                <p>' + escapeHtml(log.text) + '</p>\
                                ' + keywordsHtml + '\
                            </div>\
                        </div>\
                    ';
                });
                
                html += '</div>';
                $('#logsContainer').html(html);
                toastr.success(response.logs.length + ' messages loaded', 'Logs');
            } else {
                $('#logsContainer').html('\
                    <div class="log-placeholder">\
                        <i class="fas fa-inbox fa-2x"></i>\
                        <p>No filtered messages in this group</p>\
                    </div>\
                ');
                toastr.info('No hay logs para este grupo', 'Logs');
            }
        }).fail(function() {
            toastr.error('Error al cargar los logs', 'Error');
            $('#logsContainer').html('\
                <div class="log-placeholder">\
                    <i class="fas fa-exclamation-triangle fa-2x"></i>\
                    <p>Error al cargar los logs</p>\
                </div>\
            ');
        });
    }
    
    $('#viewAllMessages').click(function() {
        const groupId = $('#logGroupSelect').val();
        if (!groupId) {
            toastr.warning('Selecciona un grupo primero', 'Mensajes');
            return;
        }
        loadAllGroupMessages(groupId);
    });
    
    function loadAllGroupMessages(groupId) {
        const groupName = $('#logGroupSelect option:selected').text();
        console.log('📥 Loading ALL messages from group:', groupId);
        
        const button = $('#viewAllMessages');
        button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Cargando...');
        
        toastr.info('Getting group messages...', 'Mensajes');
        
        $.get('/api/group-all-messages/' + groupId + '?limit=100', function(response) {
            button.prop('disabled', false).html('<i class="fas fa-comments"></i> Ver Todos los Mensajes');
            console.log('📦 Messages received:', response);
            
            if (response.success && response.messages && response.messages.length > 0) {
                let html = '<div class="logs-list">';
                html += '<div class="log-header-title"><h3><i class="fas fa-comments"></i> Last ' + response.total + ' messages from "' + groupName + '"</h3></div>';
                
                // Most recent messages first
                const sortedMessages = response.messages.reverse();
                sortedMessages.forEach(function(msg) {
                    const date = new Date(msg.timestamp);
                    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                    const typeIcon = msg.hasMedia ? '<i class="fas fa-paperclip"></i>' : '';
                    const forwardedBadge = msg.isForwarded ? '<span class="forwarded-badge">Reenviado</span>' : '';
                    const mediaBadge = msg.hasMedia && msg.type !== 'chat' ? '<span class="badge badge-info"><i class="fas fa-image"></i> ' + msg.type + '</span>' : '';
                    
                    html += '\
                        <div class="log-entry message-entry card animate__animated animate__fadeIn">\
                            <div class="log-header">\
                                <div class="log-info">\
                                    <i class="fas fa-user-circle"></i>\
                                    <strong>' + escapeHtml(msg.fromName) + '</strong>\
                                    ' + typeIcon + '\
                                    ' + forwardedBadge + '\
                                    ' + mediaBadge + '\
                                </div>\
                                <div class="log-date">\
                                    <i class="fas fa-clock"></i> ' + dateStr + '\
                                </div>\
                            </div>\
                            <div class="log-body">\
                                <p>' + escapeHtml(msg.body || '[Multimedia message without caption]') + '</p>\
                            </div>\
                        </div>\
                    ';
                });
                
                html += '</div>';
                $('#logsContainer').html(html);
                toastr.success(response.total + ' messages loaded', 'Messages');
            } else if (response.success && response.messages.length === 0) {
                $('#logsContainer').html('\
                    <div class="log-placeholder">\
                        <i class="fas fa-inbox fa-2x"></i>\
                        <p>No messages in this group</p>\
                    </div>\
                ');
                toastr.info('No messages', 'Messages');
            } else {
                $('#logsContainer').html('\
                    <div class="log-placeholder">\
                        <i class="fas fa-exclamation-triangle fa-2x"></i>\
                        <p>' + (response.message || 'Error loading messages') + '</p>\
                    </div>\
                ');
                toastr.warning(response.message || 'Could not load messages', 'Messages');
            }
        }).fail(function(err) {
            button.prop('disabled', false).html('<i class="fas fa-comments"></i> Ver Todos los Mensajes');
            console.error('❌ Error:', err);
            toastr.error('Error loading messages', 'Error');
            $('#logsContainer').html('\
                <div class="log-placeholder">\
                    <i class="fas fa-exclamation-triangle fa-2x"></i>\
                    <p>Error de conexión</p>\
                </div>\
            ');
        });
    }

    $('#clearLogs').click(function() {
        if (confirm('¿Limpiar todos los logs mostrados?')) {
            $('#logsContainer').empty().html('\
                <div class="log-placeholder">\
                    <i class="fas fa-check-circle fa-2x"></i>\
                    <p>Logs limpiados</p>\
                </div>\
            ');
            toastr.info('Logs limpiados', 'Limpieza');
        }
    });

    // ==================== HELPER FUNCTIONS ====================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function confetti() {
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const colors = ['#667eea', '#10b981', '#f59e0b', '#ef4444'];
                $('<div>')
                    .css({
                        position: 'fixed',
                        top: '20%',
                        left: Math.random() * 100 + '%',
                        width: '10px',
                        height: '10px',
                        background: colors[Math.floor(Math.random() * 4)],
                        borderRadius: '50%',
                        opacity: 1,
                        zIndex: 9999
                    })
                    .appendTo('body')
                    .animate({
                        top: '100%',
                        opacity: 0
                    }, 2000, function() {
                        $(this).remove();
                    });
            }, i * 50);
        }
    }

    // ==================== INITIALIZATION ====================
    socket.emit('request-chats');
    socket.emit('request-stats');
    
    // Cargar grupos monitoreados al inicio
    $.get('/api/monitored-groups', function(response) {
        console.log('📥 Grupos monitoreados cargados:', response);
        if (response.success && response.groups) {
            $('#monitoredGroups').empty();
            response.groups.forEach(function(group) {
                addMonitoredGroup(group);
            });
            console.log('✅ ' + response.groups.length + ' grupos monitoreados cargados');
        }
    }).fail(function(err) {
        console.error('❌ Error al cargar grupos monitoreados:', err);
        toastr.warning('No se pudieron cargar los grupos monitoreados', 'Advertencia');
    });
    
    setInterval(() => {
        socket.emit('request-stats');
    }, 30000);
    
    console.log('WhatsApp Bot Monitor initialized ✓');
});
