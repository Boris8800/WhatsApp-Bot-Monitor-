#!/bin/bash

PROJECT_DIR=~/whatsapp-group-monitor
cd $PROJECT_DIR

show_menu() {
    clear
    echo "╔══════════════════════════════════════════════╗"
    echo "║    WhatsApp Group Monitor - Maintenance      ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║ 1. Ver estado del bot                        ║"
    echo "║ 2. Ver logs en tiempo real                   ║"
    echo "║ 3. Reiniciar bot                             ║"
    echo "║ 4. Detener bot                               ║"
    echo "║ 5. Ver grupos monitoreados                   ║"
    echo "║ 6. Backup de datos                           ║"
    echo "║ 7. Limpiar logs                              ║"
    echo "║ 8. Actualizar dependencias                   ║"
    echo "║ 9. Ver estadísticas                          ║"
    echo "║ 10. Reparar permisos                         ║"
    echo "║ 11. Salir                                    ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    read -p "Selecciona una opción [1-11]: " choice
    return $choice
}

while true; do
    show_menu
    choice=$?
    
    case $choice in
        1)
            echo "📊 Estado del bot:"
            echo "══════════════════════════════════════════════"
            pm2 status whatsapp-group-monitor
            echo ""
            read -p "Presiona Enter para continuar..."
            ;;
        2)
            echo "📝 Mostrando logs (Ctrl+C para salir):"
            echo "══════════════════════════════════════════════"
            pm2 logs whatsapp-group-monitor --lines 50
            ;;
        3)
            echo "🔄 Reiniciando bot..."
            pm2 restart whatsapp-group-monitor
            echo "✅ Bot reiniciado"
            sleep 2
            ;;
        4)
            echo "⏸️  Deteniendo bot..."
            pm2 stop whatsapp-group-monitor
            echo "✅ Bot detenido"
            sleep 2
            ;;
        5)
            echo "👥 Grupos monitoreados:"
            echo "══════════════════════════════════════════════"
            if [ -f "data/groups/monitored.json" ]; then
                jq '.monitoredGroups[] | "\(.name) (\(.id))"' data/groups/monitored.json
            else
                echo "No hay grupos monitoreados"
            fi
            echo ""
            read -p "Presiona Enter para continuar..."
            ;;
        6)
            echo "💾 Creando backup..."
            BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).tar.gz"
            tar -czf "$BACKUP_FILE" *.js views/ public/ config.json data/ logs/
            echo "✅ Backup creado: $BACKUP_FILE"
            sleep 2
            ;;
        7)
            echo "🧹 Limpiando logs..."
            rm -f logs/*.log logs/groups/*.log
            echo "{}" > logs/stats.json
            echo "✅ Logs limpiados"
            sleep 2
            ;;
        8)
            echo "📦 Actualizando dependencias..."
            npm update
            echo "✅ Dependencias actualizadas"
            sleep 2
            ;;
        9)
            echo "📈 Estadísticas:"
            echo "══════════════════════════════════════════════"
            if [ -f "logs/stats.json" ]; then
                cat logs/stats.json | jq .
            else
                echo "No hay estadísticas disponibles"
            fi
            echo ""
            read -p "Presiona Enter para continuar..."
            ;;
        10)
            echo "🔧 Reparando permisos..."
            chmod -R 755 .
            chown -R $USER:$USER .
            echo "✅ Permisos reparados"
            sleep 2
            ;;
        11)
            echo "👋 Saliendo..."
            exit 0
            ;;
        *)
            echo "❌ Opción inválida"
            sleep 1
            ;;
    esac
done
