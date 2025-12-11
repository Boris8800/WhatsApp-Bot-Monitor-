const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'groups', 'monitored.json');
const CONTACTS_FILE = path.join(__dirname, 'data', 'contacts', 'contacts.json');
const EXPORTS_DIR = path.join(__dirname, 'data', 'exports');

// Asegurar que existen los directorios
fs.ensureDirSync(path.dirname(GROUPS_FILE));
fs.ensureDirSync(path.dirname(CONTACTS_FILE));
fs.ensureDirSync(EXPORTS_DIR);

// --- Funciones de configuración ---
function loadConfig() {
    if(fs.existsSync(CONFIG_FILE)){
        return JSON.parse(fs.readFileSync(CONFIG_FILE,'utf-8'));
    } else {
        return { 
            emails: [], 
            botActive: true,
            readOnly: true,
            keywords: ["fare", "£", "tarifa", "precio"],
            minFare: 100,
            monitorAllGroups: false,
            specificGroups: [],
            scanInterval: 60000,
            maxLogsPerGroup: 1000,
            exportFormat: "json",
            notificationSound: true,
            autoBackup: true
        };
    }
}

function saveConfig(config){
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadGroupsConfig() {
    if(fs.existsSync(GROUPS_FILE)){
        return JSON.parse(fs.readFileSync(GROUPS_FILE,'utf-8'));
    } else {
        return {
            monitoredGroups: [],
            ignoredGroups: [],
            groupSettings: {},
            lastScan: null
        };
    }
}

function saveGroupsConfig(groupsConfig){
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groupsConfig, null, 2));
}

// --- Inicializar Express y Socket.io ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname,'public')));
app.set('view engine','ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let config = loadConfig();
let groupsConfig = loadGroupsConfig();
let allChats = [];
let availableGroups = [];
let whatsappReady = false;

// --- Middleware para API ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// --- Rutas de la API ---

// Página principal
app.get('/', (req, res) => {
    const stats = loadStats();
    res.render('index', { 
        config, 
        groupsConfig, 
        stats,
        availableGroups: availableGroups.slice(0, 50) // Limitar para no saturar
    });
});

// Obtener todos los chats disponibles
app.get('/api/chats', async (req, res) => {
    try {
        res.json({
            success: true,
            chats: availableGroups,
            total: availableGroups.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar grupos por nombre
app.get('/api/search-groups', async (req, res) => {
    const query = req.query.q?.toLowerCase() || '';
    const filtered = availableGroups.filter(group => 
        group.name.toLowerCase().includes(query) ||
        group.id.toLowerCase().includes(query)
    );
    res.json({ success: true, groups: filtered });
});

// Obtener grupos monitoreados
app.get('/api/monitored-groups', (req, res) => {
    res.json({
        success: true,
        groups: groupsConfig.monitoredGroups,
        settings: groupsConfig.groupSettings
    });
});

// Agregar grupo a monitoreo
app.post('/api/monitor-group', async (req, res) => {
    try {
        const { groupId, groupName, customKeywords, minFare } = req.body;
        
        console.log('📥 Request to monitor group:', groupId, groupName);
        
        if (!groupsConfig.monitoredGroups.find(g => g.id === groupId)) {
            const groupConfig = {
                id: groupId,
                name: groupName,
                added: new Date().toISOString(),
                customKeywords: customKeywords || [],
                minFare: minFare || config.minFare,
                enabled: true,
                stats: {
                    totalMessages: 0,
                    filteredMessages: 0,
                    lastActivity: null
                }
            };
            
            groupsConfig.monitoredGroups.push(groupConfig);
            groupsConfig.groupSettings[groupId] = groupConfig;
            saveGroupsConfig(groupsConfig);
            
            console.log('✅ Group added to monitoring:', groupName);
            io.emit('group-added', groupConfig);
            
            res.json({
                success: true,
                message: 'Group added successfully',
                group: groupConfig
            });
        } else {
            console.log('⚠️  Group already monitored:', groupName);
            res.json({ success: false, message: 'El grupo ya está siendo monitoreado' });
        }
    } catch (error) {
        console.error('❌ Error adding group:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Eliminar grupo de monitoreo
app.post('/api/unmonitor-group', (req, res) => {
    try {
        const { groupId } = req.body;
        
        console.log('📥 Request to stop monitoring group:', groupId);
        
        const groupBefore = groupsConfig.monitoredGroups.find(g => g.id === groupId);
        
        groupsConfig.monitoredGroups = groupsConfig.monitoredGroups.filter(g => g.id !== groupId);
        delete groupsConfig.groupSettings[groupId];
        saveGroupsConfig(groupsConfig);
        
        console.log('✅ Group removed from monitoring:', groupBefore?.name || groupId);
        io.emit('group-removed', groupId);
        
        res.json({ 
            success: true, 
            message: 'Group removed from monitoring'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar configuración de grupo
app.post('/api/update-group-config', (req, res) => {
    try {
        const { groupId, updates } = req.body;
        
        const groupIndex = groupsConfig.monitoredGroups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
            groupsConfig.monitoredGroups[groupIndex] = {
                ...groupsConfig.monitoredGroups[groupIndex],
                ...updates
            };
            
            if (groupsConfig.groupSettings[groupId]) {
                groupsConfig.groupSettings[groupId] = {
                    ...groupsConfig.groupSettings[groupId],
                    ...updates
                };
            }
            
            saveGroupsConfig(groupsConfig);
            io.emit('group-updated', { groupId, updates });
            
            res.json({ success: true, message: 'Configuración actualizada' });
        } else {
            res.json({ success: false, message: 'Group not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener logs de un grupo específico
app.get('/api/group-logs/:groupId', (req, res) => {
    try {
        const groupId = req.params.groupId;
        const logFile = path.join(__dirname, 'logs', 'groups', `${groupId}.log`);
        
        let logs = [];
        if (fs.existsSync(logFile)) {
            logs = fs.readFileSync(logFile, 'utf-8').split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .reverse()
                .slice(0, 100);
        }
        
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Exportar datos de grupo
app.get('/api/export-group/:groupId', (req, res) => {
    try {
        const groupId = req.params.groupId;
        const format = req.query.format || 'json';
        const group = groupsConfig.monitoredGroups.find(g => g.id === groupId);
        
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }
        
        const logFile = path.join(__dirname, 'logs', 'groups', `${groupId}.log`);
        let logs = [];
        
        if (fs.existsSync(logFile)) {
            logs = fs.readFileSync(logFile, 'utf-8').split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        }
        
        const exportData = {
            group: group,
            logs: logs,
            exportDate: new Date().toISOString(),
            totalLogs: logs.length
        };
        
        let filename = '';
        let content = '';
        
        if (format === 'json') {
            filename = `group_${groupId}_${Date.now()}.json`;
            content = JSON.stringify(exportData, null, 2);
            res.header('Content-Type', 'application/json');
        } else if (format === 'csv') {
            filename = `group_${groupId}_${Date.now()}.csv`;
            content = 'Fecha,Mensaje,Usuario,Tarifa\n';
            logs.forEach(log => {
                const date = new Date(log.timestamp).toLocaleString();
                const message = log.text.replace(/,/g, ';');
                const user = log.contact.replace(/,/g, ';');
                const fare = log.fare || '';
                content += `${date},"${message}","${user}","${fare}"\n`;
            });
            res.header('Content-Type', 'text/csv');
        }
        
        res.header('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get ALL messages from a group (not just filtered)
app.get('/api/group-all-messages/:groupId', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const limit = parseInt(req.query.limit) || 50;
        
        console.log('📥 Request to get all group messages:', groupId);
        
        if (!client || !whatsappReady) {
            return res.json({ success: false, message: 'WhatsApp is not connected' });
        }
        
        const chat = await client.getChatById(groupId);
        
        if (!chat) {
            return res.json({ success: false, message: 'Group not found' });
        }
        
        // Get the last messages from the group
        const messages = await chat.fetchMessages({ limit: limit });
        
        const formattedMessages = messages.map((msg) => {
            // Extraer nombre del autor sin usar getContact() que está fallando
            let fromName = 'Desconocido';
            try {
                fromName = msg._data.notifyName || msg._data.from?.split('@')[0] || msg.author?.split('@')[0] || 'Desconocido';
            } catch (e) {
                fromName = msg.author?.split('@')[0] || 'Desconocido';
            }
            
            return {
                id: msg.id._serialized,
                from: msg.from,
                fromName: fromName,
                body: msg.body,
                timestamp: msg.timestamp * 1000,
                hasMedia: msg.hasMedia,
                type: msg.type,
                isForwarded: msg.isForwarded
            };
        });
        
        console.log('✅ Messages obtained:', formattedMessages.length);
        res.json({ success: true, messages: formattedMessages, total: formattedMessages.length });
        
    } catch (error) {
        console.error('❌ Error getting messages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Guardar configuración global
app.post('/api/save-config', (req, res) => {
    try {
        // Convertir valores al tipo correcto
        const newConfig = { ...req.body };
        if (newConfig.minFare) newConfig.minFare = parseInt(newConfig.minFare);
        if (newConfig.botActive !== undefined) newConfig.botActive = newConfig.botActive === 'true' || newConfig.botActive === true;
        if (newConfig.readOnly !== undefined) newConfig.readOnly = newConfig.readOnly === 'true' || newConfig.readOnly === true;
        if (newConfig.monitorAllGroups !== undefined) newConfig.monitorAllGroups = newConfig.monitorAllGroups === 'true' || newConfig.monitorAllGroups === true;
        if (newConfig.scanInterval) newConfig.scanInterval = parseInt(newConfig.scanInterval);
        if (newConfig.maxLogsPerGroup) newConfig.maxLogsPerGroup = parseInt(newConfig.maxLogsPerGroup);
        
        config = { ...config, ...newConfig };
        saveConfig(config);
        io.emit('config-updated', config);
        res.json({ success: true, message: 'Configuración guardada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Guardar configuración rápida (solo toggles principales)
app.post('/api/save-quick-config', (req, res) => {
    try {
        const { botActive, readOnly } = req.body;
        config.botActive = botActive;
        config.readOnly = readOnly;
        saveConfig(config);
        io.emit('config-updated', config);
        io.emit('quick-config-applied', { botActive, readOnly });
        res.json({ success: true, message: 'Configuración rápida aplicada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reconectar WhatsApp
app.post('/api/reconnect-whatsapp', async (req, res) => {
    try {
        console.log('🔄 Attempting to reconnect WhatsApp...');
        
        if (client && client.pupPage) {
            // Intentar reinicializar la conexión
            await client.initialize();
            io.emit('wa-connecting', { message: 'Reconectando...' });
            res.json({ success: true, message: 'Intentando reconectar' });
        } else {
            res.json({ success: false, message: 'Client not available' });
        }
    } catch (error) {
        console.error('Error reconnecting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estadísticas
function loadStats() {
    const statsFile = path.join(__dirname, 'logs', 'stats.json');
    if (fs.existsSync(statsFile)) {
        return JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    }
    return {
        totalMessages: 0,
        filteredMessages: 0,
        monitoredGroups: 0,
        activeToday: 0,
        lastUpdate: new Date().toISOString()
    };
}

// --- Funciones del bot ---
function sendEmailAlert(subject, text, groupName = '') {
    if (config.emails.length === 0) return;
    
    const fullSubject = groupName ? `[${groupName}] ${subject}` : subject;
    
    config.emails.forEach(email => {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: email.user, pass: email.pass }
        });
        
        transporter.sendMail({ 
            from: email.user, 
            to: email.user, 
            subject: fullSubject, 
            text: text 
        }, (err) => {
            if(err) console.log('Error enviando email:', err);
        });
    });
}

function checkKeywords(text, customKeywords = []) {
    const allKeywords = [...config.keywords, ...customKeywords];
    const lowerText = text.toLowerCase();
    return allKeywords.some(keyword => 
        lowerText.includes(keyword.toLowerCase())
    );
}

function saveGroupLog(groupId, logData) {
    const groupLogDir = path.join(__dirname, 'logs', 'groups');
    fs.ensureDirSync(groupLogDir);
    
    const logFile = path.join(groupLogDir, `${groupId}.log`);
    logData.timestamp = new Date().toISOString();
    
    fs.appendFileSync(logFile, JSON.stringify(logData) + '\n');
    
    // Limitar tamaño del log
    if (config.maxLogsPerGroup > 0) {
        const logs = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim());
        if (logs.length > config.maxLogsPerGroup) {
            const trimmedLogs = logs.slice(-config.maxLogsPerGroup);
            fs.writeFileSync(logFile, trimmedLogs.join('\n') + '\n');
        }
    }
}

// Configuración del cliente WhatsApp
console.log('🔧 Initializing WhatsApp client...');
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, '.wwebjs_auth')
    }),
    puppeteer: { 
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ],
        timeout: 120000
    },
    qrMaxRetries: 10,
    qrTimeoutMs: 120000,
    authTimeoutMs: 120000,
    restartOnAuthFail: true,
    takeoverOnConflict: false,
    takeoverTimeoutMs: 0
});
console.log('✅ WhatsApp client created');

// Disable message sending
client.sendMessage = function() {
    console.log('⚠️  Read-only mode - Cannot send messages');
    return Promise.reject('Modo solo lectura activado');
};

// Eventos del cliente
console.log('📡 Registering client events...');

client.on('loading_screen', (percent, message) => {
    console.log('⏳ Loading WhatsApp Web:', percent, message);
    io.emit('wa-connecting', { percent, message });
});

client.on('qr', qr => {
    console.log('📱 QR Code generated');
    console.log('🔗 QR length:', qr.length);
    console.log('📺 Generating QR in terminal...');
    qrcode.generate(qr, { small: true });
    console.log('📡 Sending QR to web clients...');
    io.emit('qr', qr);
    io.emit('wa-qr');
    console.log('✅ QR emitted successfully');
});

client.on('ready', async () => {
    console.log('✅ Read-only bot ready');
    console.log('📊 Mode: Read Only');
    whatsappReady = true;
    io.emit('wa-ready');
    
    // Cargar todos los chats disponibles
    allChats = await client.getChats();
    availableGroups = allChats
        .filter(chat => chat.isGroup)
        .map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            participants: chat.participants?.length || 0,
            timestamp: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : null
        }));
    
    console.log(`📁 Available groups: ${availableGroups.length}`);
    io.emit('chats-loaded', availableGroups);
    
    // Escanear grupos periódicamente
    setInterval(async () => {
        try {
            const currentChats = await client.getChats();
            const currentGroups = currentChats
                .filter(chat => chat.isGroup)
                .map(chat => chat.id._serialized);
            
            // Buscar nuevos grupos
            const newGroups = currentGroups.filter(groupId => 
                !availableGroups.some(g => g.id === groupId)
            );
            
            if (newGroups.length > 0) {
                console.log(`🆕 Nuevos grupos detectados: ${newGroups.length}`);
                availableGroups = currentChats
                    .filter(chat => chat.isGroup)
                    .map(chat => ({
                        id: chat.id._serialized,
                        name: chat.name,
                        participants: chat.participants?.length || 0,
                        timestamp: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : null
                    }));
                io.emit('chats-updated', availableGroups);
            }
        } catch (error) {
            console.error('Error escaneando grupos:', error);
        }
    }, config.scanInterval);
});

client.on('authenticated', () => {
    console.log('🔐 Authenticated successfully');
    io.emit('authenticated', true);
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
    io.emit('auth_failure', msg);
});

client.on('disconnected', (reason) => {
    console.log('⚠️  WhatsApp desconectado:', reason);
    whatsappReady = false;
    io.emit('wa-disconnected', reason);
    
    // Intentar reconectar después de 10 segundos si no es un logout manual
    if (reason !== 'LOGOUT' && reason !== 'NAVIGATION') {
        console.log('🔄 Reconectando en 10 segundos...');
        setTimeout(async () => {
            try {
                console.log('🔄 Attempting to reinitialize...');
                await client.initialize();
            } catch (err) {
                console.error('❌ Error reconnecting:', err.message);
            }
        }, 10000);
    }
});

client.on('change_state', state => {
    console.log('🔄 Cambio de estado WhatsApp:', state);
    if (state === 'CONNECTED') {
        io.emit('wa-ready');
    } else if (state === 'OPENING') {
        io.emit('wa-connecting', { message: 'Abriendo conexión' });
    } else if (state === 'CONFLICT' || state === 'UNPAIRED') {
        console.log('⚠️  Estado problemático detectado:', state);
        io.emit('wa-disconnected', state);
    }
});

// Main message handler
client.on('message', async message => {
    if (!config.botActive || !config.readOnly) return;
    
    try {
        const chat = await message.getChat();
        
        // Verificar si es un grupo
        if (!chat.isGroup) {
            // Si no se monitorean chats individuales, salir
            if (!config.monitorAllGroups && groupsConfig.monitoredGroups.length === 0) return;
        } else {
            // Verificar si el grupo está siendo monitoreado
            const isMonitored = groupsConfig.monitoredGroups.some(g => g.id === chat.id._serialized);
            
            if (!config.monitorAllGroups && !isMonitored) {
                return; // Ignorar grupos no monitoreados
            }
            
            // Obtener configuración específica del grupo
            const groupConfig = groupsConfig.groupSettings[chat.id._serialized] || {};
            const groupKeywords = groupConfig.customKeywords || [];
            
            // Process message (including multimedia captions)
            let text = message.body || '';
            
            // Si es mensaje multimedia, intentar obtener el caption
            if (message.hasMedia && message.type !== 'chat') {
                try {
                    // In multimedia messages, the caption is in _data.caption
                    const caption = message._data?.caption || '';
                    if (caption.trim()) {
                        text = caption;
                        console.log('📷 Multimedia message with caption detected:', caption.substring(0, 50) + '...');
                    } else {
                        console.log('📷 Multimedia message without caption (image/video only)');
                        return; // No text to analyze
                    }
                } catch (e) {
                    console.log('⚠️ Error getting multimedia caption:', e.message);
                    return;
                }
            }
            
            if (!text.trim()) return;
            
            const contact = await message.getContact();
            const hasKeywords = checkKeywords(text, groupKeywords);
            
            let shouldAlert = false;
            let alertType = '';
            
            if (hasKeywords) {
                shouldAlert = true;
                alertType = 'keyword_match';
            }
            
            if (shouldAlert) {
                const logData = {
                    groupId: chat.id._serialized,
                    groupName: chat.name,
                    contact: contact.pushname || contact.number || 'Desconocido',
                    contactNumber: message.from,
                    text: text,
                    alertType: alertType,
                    hasMedia: message.hasMedia || false,
                    mediaType: message.type || 'chat',
                    keywordsFound: config.keywords.filter(k => 
                        text.toLowerCase().includes(k.toLowerCase())
                    ).concat(groupKeywords.filter(k => 
                        text.toLowerCase().includes(k.toLowerCase())
                    ))
                };
                
                // Guardar log del grupo
                saveGroupLog(chat.id._serialized, logData);
                
                // Actualizar estadísticas del grupo
                if (groupConfig.stats) {
                    groupConfig.stats.totalMessages = (groupConfig.stats.totalMessages || 0) + 1;
                    groupConfig.stats.filteredMessages = (groupConfig.stats.filteredMessages || 0) + 1;
                    groupConfig.stats.lastActivity = new Date().toISOString();
                    groupsConfig.groupSettings[chat.id._serialized] = groupConfig;
                    
                    // Actualizar en la lista principal
                    const mainGroupIndex = groupsConfig.monitoredGroups.findIndex(
                        g => g.id === chat.id._serialized
                    );
                    if (mainGroupIndex !== -1) {
                        groupsConfig.monitoredGroups[mainGroupIndex] = groupConfig;
                    }
                    
                    saveGroupsConfig(groupsConfig);
                }
                
                // Enviar notificación
                const alertText = `\n═══════════════════════════════\n` +
                                 `📅 ${new Date().toLocaleString()}\n` +
                                 `👥 Group: ${chat.name}\n` +
                                 `👤 De: ${contact.pushname || contact.number || 'Desconocido'}\n` +
                                 `💰 Tarifa: ${fare ? '£' + fare : 'No especificada'}\n` +
                                 `💬 Mensaje:\n${text}\n` +
                                 `═══════════════════════════════\n`;
                
                console.log(alertText);
                
                // Enviar email si está configurado
                if (config.emails.length > 0 && groupConfig.enabled !== false) {
                    const subject = fare ? `Alerta: £${fare} en ${chat.name}` : `Palabra clave en ${chat.name}`;
                    sendEmailAlert(subject, alertText, chat.name);
                }
                
                // Enviar a web en tiempo real
                io.emit('new-group-message', {
                    ...logData,
                    alertText: alertText,
                    timestamp: new Date().toISOString()
                });
                
                // Actualizar estadísticas globales
                const stats = loadStats();
                stats.totalMessages = (stats.totalMessages || 0) + 1;
                stats.filteredMessages = (stats.filteredMessages || 0) + 1;
                stats.lastUpdate = new Date().toISOString();
                fs.writeFileSync(
                    path.join(__dirname, 'logs', 'stats.json'),
                    JSON.stringify(stats, null, 2)
                );
                
                io.emit('stats-update', stats);
            }
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

client.on('disconnected', (reason) => {
    console.log('🔌 Bot desconectado:', reason);
    io.emit('wa-disconnected', { reason });
});

// Manejadores de errores globales
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  Promesa rechazada sin manejar:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada:', error);
});

client.on('remote_session_saved', () => {
    console.log('💾 Sesión remota guardada');
});

// Inicializar cliente
console.log('🚀 Starting WhatsApp connection...');
console.log('📍 Using Chromium:', puppeteer.executablePath());
client.initialize()
    .then(() => {
        console.log('✅ Client initialized successfully');
    })
    .catch(err => {
        console.error('❌ Error al inicializar WhatsApp:', err.message);
        console.error('📋 Stack:', err.stack);
        io.emit('wa-error', { message: err.message });
        
        // Reintentar después de 30 segundos
        setTimeout(() => {
            console.log('🔄 Reintentando inicialización...');
            client.initialize().catch(console.error);
        }, 30000);
    });

// --- Socket.io para comunicación en tiempo real ---
io.on('connection', socket => {
    console.log('👤 Web client connected');
    
    socket.emit('config', config);
    socket.emit('groups-config', groupsConfig);
    socket.emit('stats', loadStats());
    socket.emit('available-groups', availableGroups.slice(0, 50));
    
    // Enviar estado actual de WhatsApp
    setTimeout(() => {
        try {
            if (whatsappReady) {
                socket.emit('wa-ready');
                console.log('📤 State sent to client: READY');
            } else {
                socket.emit('wa-connecting', { message: 'Inicializando...' });
                console.log('📤 State sent to client: CONNECTING');
            }
        } catch (err) {
            socket.emit('wa-connecting', { message: 'Cargando estado...' });
        }
    }, 500);
    
    socket.on('request-chats', () => {
        socket.emit('chats-loaded', availableGroups);
    });
    
    socket.on('disconnect', () => {
        console.log('👤 Cliente web desconectado');
    });
});

// --- Iniciar servidor web ---
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
    console.log(`🌐 Web server: http://localhost:${PORT}`);
    console.log(`🔧 Puerto: ${PORT}`);
    console.log(`📁 Data directory: ${__dirname}/data`);
    console.log(`📝 Group logs: ${__dirname}/logs/groups/`);
});
