# WhatsApp Bot - Group Monitor

Bot de monitoreo de grupos de WhatsApp que filtra mensajes por palabras clave y tarifas. Funciona en modo solo lectura.

## 🌟 Características

- ✅ **Modo Solo Lectura**: No envía mensajes, solo monitorea
- 🔍 **Filtrado Inteligente**: Busca palabras clave y tarifas específicas
- 📱 **Interfaz Web**: Panel de control responsive con Socket.IO en tiempo real
- 📊 **Estadísticas**: Visualización de grupos monitoreados y actividad
- 💾 **Logs Persistentes**: Guarda mensajes importantes en archivos JSON
- 🖼️ **Soporte Multimedia**: Detecta y procesa captions de imágenes/videos
- 📤 **Exportación**: Exporta logs en formato JSON o CSV
- 🔄 **Auto-Reconexión**: Se reconecta automáticamente si pierde conexión

## 📋 Requisitos

- Node.js 16+
- Google Chrome (para Puppeteer)
- PM2 (recomendado para producción)

## 🚀 Instalación

1. **Clonar el repositorio**
```bash
git clone <repo-url>
cd whatsapp-bot
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar el bot**
```bash
cp config.example.json config.json
```

Edita `config.json` con tus preferencias:
- `keywords`: Array de palabras clave a buscar (ej: ["fare", "£"])
- `minFare`: Tarifa mínima para alertas (ej: 100)
- `botActive`: true para activar el monitoreo
- `readOnly`: true para modo solo lectura (recomendado)

4. **Crear estructura de directorios**
```bash
mkdir -p data/contacts data/exports data/groups logs/groups
```

5. **Crear archivo de grupos monitoreados**
```bash
echo '{"monitoredGroups":[],"groupSettings":{}}' > data/groups/monitored.json
```

## ▶️ Uso

### Desarrollo
```bash
node index.js
```

### Producción (con PM2)
```bash
pm2 start index.js --name whatsapp-bot
pm2 save
pm2 startup
```

### Acceder a la interfaz web
Abre tu navegador en: `http://localhost:3002`

## 🔐 Primera Conexión

1. Inicia el bot
2. Abre la interfaz web
3. Escanea el código QR con WhatsApp (WhatsApp > Configuración > Dispositivos vinculados)
4. El bot se conectará automáticamente

## 📱 Uso de la Interfaz Web

### Panel Principal
- **Estado del Sistema**: Conexión de WhatsApp, grupos disponibles, monitoreados
- **Agregar Grupos**: Selecciona grupos de WhatsApp para monitorear
- **Configuración**: Ajusta keywords, tarifa mínima, notificaciones

### Logs y Mensajes
- **Ver Logs Filtrados**: Muestra solo mensajes que coinciden con tus filtros
- **Ver Todos los Mensajes**: Obtiene los últimos 100 mensajes del grupo
- **Exportar**: Descarga logs en JSON o CSV

### Gestión
- **Eliminar Grupos**: Deja de monitorear grupos específicos
- **Limpiar Logs**: Borra historial de mensajes guardados

## 📁 Estructura del Proyecto

```
whatsapp-bot/
├── index.js              # Servidor principal
├── config.json           # Configuración del bot (no incluido en git)
├── package.json          # Dependencias
├── public/
│   ├── app.js           # Frontend JavaScript
│   └── style.css        # Estilos
├── views/
│   └── index.ejs        # Template HTML
├── data/
│   └── groups/
│       └── monitored.json  # Grupos monitoreados
└── logs/
    └── groups/          # Logs por grupo
```

## 🔧 Configuración Avanzada

### Keywords y Filtros
Edita `config.json`:
```json
{
  "keywords": ["fare", "£", "price", "cost"],
  "minFare": 100,
  "botActive": true,
  "readOnly": true
}
```

### Configuración por Grupo
La interfaz web permite configurar:
- Keywords específicas por grupo
- Tarifa mínima diferente por grupo
- Estadísticas de actividad

## 🛠️ Mantenimiento

### Ver logs de PM2
```bash
pm2 logs whatsapp-bot
```

### Reiniciar el bot
```bash
pm2 restart whatsapp-bot
```

### Detener el bot
```bash
pm2 stop whatsapp-bot
```

### Limpiar sesión (si hay problemas de conexión)
```bash
pm2 stop whatsapp-bot
rm -rf .wwebjs_auth .wwebjs_cache
pm2 start whatsapp-bot
```

## 🐛 Solución de Problemas

### El bot no se conecta
1. Verifica que Chrome esté instalado
2. Elimina `.wwebjs_auth` y `.wwebjs_cache`
3. Escanea nuevamente el código QR

### No detecta mensajes multimedia
- El bot extrae captions de imágenes/videos
- Si la imagen no tiene texto (caption), no será procesada

### Grupos no aparecen
- Espera a que WhatsApp sincronice (puede tardar 30-60 segundos)
- Verifica que el bot tenga acceso a los grupos

## 🔒 Seguridad

- **Modo Solo Lectura**: El bot no puede enviar mensajes
- **Datos Locales**: Toda la información se guarda localmente
- **Sin Conexión Externa**: No envía datos a servidores externos
- **Sesión Privada**: Los archivos de autenticación están en `.gitignore`

## 📝 Notas

- El bot debe permanecer conectado para monitorear mensajes en tiempo real
- Los logs se guardan automáticamente cuando hay coincidencias
- La interfaz web se actualiza en tiempo real con Socket.IO
- Funciona con hasta 42+ grupos simultáneamente

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

## 📄 Licencia

MIT License - Úsalo libremente para proyectos personales o comerciales.

## ⚠️ Disclaimer

Este bot es para uso educativo y personal. Asegúrate de cumplir con los términos de servicio de WhatsApp y las leyes locales de privacidad al monitorear conversaciones.
