<p align="center"><img src="https://github.com/s2iz/Telegram-FaucetBot/blob/main/assests/FaucetBot.png?raw=true" width="750"></p>
<p align="center"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white&link=https%3A%2F%2Fnodejs.org%2Fen%2Fdownload"><img src="https://img.shields.io/badge/JavaScript-f7df1e?style=for-the-badge&logo=javascript&logoColor=black&logoSize=auto" alt="shields"><img src="https://img.shields.io/badge/Telebot-2ca5e0?style=for-the-badge&logo=telegram&logoColor=white&logoSize=auto" alt="shields"><img src="https://img.shields.io/badge/version-1.0-white?style=for-the-badge&labelColor=black&logo=adobefonts&logoColor=white" alt="shields"></p>

<h2>📸 Bot Showcase</h2>

[![Watch the video](https://img.youtube.com/vi/LbtZRAkBgSU/maxresdefault.jpg)](https://youtu.be/LbtZRAkBgSU)
  <p align="center"> - Click on photo to open showcase videos - </p>

<h2>🧐 Features</h2>

Here are some of the bot's best features:

*   💰 Automated Faucet System: Users claim free points every hour with customizable rewards and cooldown periods.
*   ⭐ Premium Memberships: Four-tier system (Bronze, Silver, Gold, Lifetime) with reward multipliers up to 10x.
*   📢 Channel Subscription: Mandatory channel joining with customizable bonus rewards for new subscribers.
*   👥 Referral Program: Automatic bonus distribution for inviting friends with tracking system.
*   💸 Withdrawal Management: User requests with admin approval/rejection system.
*   👑 Admin Control Panel: Comprehensive dashboard to manage users, broadcast messages, distribute airdrops, control channels, and configure all settings.
*   💾 Auto-Backup System: Hourly automatic backups with manual download capability.
*   🔒 User Management: Ban/unban functionality with blacklist system.
*   📊 Live Statistics: Real-time tracking of users, balances, claims, and referrals.
*   🎯 Modern Interface: Inline buttons for seamless user experience.

# <h2>🕹 Bot Commands</h2>

| Command | Description | Access |
| --- | --- | --- |
| `/start` | Start the bot and show menu | Everyone |
| `/admin` | Show admin control panel | Admin |
| `/backup` | Create manual backup | Admin |
| `/download_backup` | Download backup file | Admin |
| `/setfaucet amount` | Set faucet amount | Admin |
| `/setcooldown minutes` | Set claim cooldown in minutes | Admin |
| `/setminwithdraw amount` | Set minimum withdrawal amount | Admin |
| `/setrefbonus amount` | Set referral bonus amount | Admin |
| `/ban id` | Ban a user | Admin |
| `/unban id` | Unban a user | Admin |
| `/removechannel @oSHOWo` | Remove required channel | Admin |

## Project Structure

```
Telegram-FaucetBot/
├── assests/
│   └── FaucetBot.png      # Project image
├── index.js      #  Bot index file
├── bot_data.json      # Bot data file
└── READNE.md      # Project ReadMe file
```

## ⚙️ Configuration

The bot is configured through the `index.js` file:

```javascript
Line#11 const BOT_TOKEN = 'Bot token';
Line#12 const ADMIN_IDS = [bot admin id];
```

<h2>🛠️ Installation Steps:</h2>

1. Install node.js from [here](https://nodejs.org/en/download)

2. Download [Telegram FaucetBot](https://github.com/s2iz/Telegram-FaucetBot/archive/refs/heads/main.zip) & unzip files

3. get package.json file

```
npm init -y
```

4. install packages</p>

```
npm install node-telegram-bot-api
```
5. run the bot</p>

```
node index.js
```

## 📜 License

> [!NOTE]
> This project is licensed under the MIT License - see the LICENSE file for details.

> [!WARNING]
> This project is 100% free and no one has the right to sell it.

## 👨‍💻 Credits

* Developed with 💜 by [Abdelrahman](https://guns.lol/33/) 
