# WhatsApp Bot - Group Monitor

WhatsApp group monitoring bot that filters messages by keywords and fares. Works in read-only mode.

## 🌟 Features

- ✅ **Read-Only Mode**: Doesn't send messages, only monitors
- 🔍 **Intelligent Filtering**: Searches for keywords and specific fares
- 📱 **Web Interface**: Responsive control panel with real-time Socket.IO
- 📊 **Statistics**: Visualization of monitored groups and activity
- 💾 **Persistent Logs**: Saves important messages to JSON files
- 🖼️ **Multimedia Support**: Detects and processes image/video captions
- 📤 **Export**: Exports logs in JSON or CSV format
- 🔄 **Auto-Reconnect**: Automatically reconnects if connection is lost

## 📋 Requirements

- Node.js 16+
- Google Chrome (for Puppeteer)
- PM2 (recommended for production)

## 🚀 Installation

1. **Clone the repository**
```bash
git clone <repo-url>
cd whatsapp-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure the bot**
```bash
cp config.example.json config.json
```

Edit `config.json` with your preferences:
- `keywords`: Array of keywords to search for (e.g., ["fare", "£"])
- `minFare`: Minimum fare for alerts (e.g., 100)
- `botActive`: true to enable monitoring
- `readOnly`: true for read-only mode (recommended)

4. **Create directory structure**
```bash
mkdir -p data/contacts data/exports data/groups logs/groups
```

5. **Create monitored groups file**
```bash
echo '{"monitoredGroups":[],"groupSettings":{}}' > data/groups/monitored.json
```

## ▶️ Usage

### Development
```bash
node index.js
```

### Production (with PM2)
```bash
pm2 start index.js --name whatsapp-bot
pm2 save
pm2 startup
```

### Access the web interface
Open your browser at: `http://localhost:3002`

## 🔐 First Connection

1. Start the bot
2. Open the web interface
3. Scan the QR code with WhatsApp (WhatsApp > Settings > Linked Devices)
4. The bot will connect automatically

## 📱 Using the Web Interface

### Main Panel
- **System Status**: WhatsApp connection, available groups, monitored groups
- **Add Groups**: Select WhatsApp groups to monitor
- **Configuration**: Adjust keywords, minimum fare, notifications

### Logs and Messages
- **View Filtered Logs**: Shows only messages matching your filters
- **View All Messages**: Gets the last 100 messages from the group
- **Export**: Download logs in JSON or CSV

### Management
- **Delete Groups**: Stop monitoring specific groups
- **Clear Logs**: Delete saved message history

## 📁 Project Structure

```
whatsapp-bot/
├── index.js              # Main server
├── config.json           # Bot configuration (not included in git)
├── package.json          # Dependencies
├── public/
│   ├── app.js           # Frontend JavaScript
│   └── style.css        # Styles
├── views/
│   └── index.ejs        # HTML Template
├── data/
│   └── groups/
│       └── monitored.json  # Monitored groups
└── logs/
    └── groups/          # Logs by group
```

## 🔧 Advanced Configuration

### Keywords and Filters
Edit `config.json`:
```json
{
  "keywords": ["fare", "£", "price", "cost"],
  "minFare": 100,
  "botActive": true,
  "readOnly": true
}
```

### Per-Group Configuration
The web interface allows you to configure:
- Specific keywords per group
- Different minimum fare per group
- Activity statistics

## 🛠️ Maintenance

### View PM2 logs
```bash
pm2 logs whatsapp-bot
```

### Restart the bot
```bash
pm2 restart whatsapp-bot
```

### Stop the bot
```bash
pm2 stop whatsapp-bot
```

### Clear session (if connection issues)
```bash
pm2 stop whatsapp-bot
rm -rf .wwebjs_auth .wwebjs_cache
pm2 start whatsapp-bot
```

## 🐛 Troubleshooting

### Bot won't connect
1. Verify Chrome is installed
2. Delete `.wwebjs_auth` and `.wwebjs_cache`
3. Scan the QR code again

### Not detecting multimedia messages
- The bot extracts captions from images/videos
- If the image has no text (caption), it won't be processed

### Groups don't appear
- Wait for WhatsApp to sync (may take 30-60 seconds)
- Verify the bot has access to the groups

## 🔒 Security

- **Read-Only Mode**: The bot cannot send messages
- **Local Data**: All information is saved locally
- **No External Connection**: Doesn't send data to external servers
- **Private Session**: Authentication files are in `.gitignore`

## 📝 Notes

- The bot must remain connected to monitor messages in real-time
- Logs are automatically saved when matches are found
- The web interface updates in real-time with Socket.IO
- Works with up to 42+ groups simultaneously

## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## 📄 License

MIT License - Use freely for personal or commercial projects.

## ⚠️ Disclaimer

This bot is for educational and personal use. Make sure to comply with WhatsApp's terms of service and local privacy laws when monitoring conversations.
