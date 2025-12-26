// Telegram Faucet Bot - Complete System
// Install: npm install node-telegram-bot-api

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const BOT_TOKEN = '6728150395:AAG8FtHRKdwlbFT00X8gEXM9ZZeWcegsoRs';
const ADMIN_IDS = [6324455737];
const BACKUP_INTERVAL = 3600000; // Backup every 1 hour
const DATA_FILE = path.join(__dirname, 'bot_data.json');

// Initialize Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-Memory Database
let users = {};
let blacklist = new Set();
let withdrawalRequests = {};
let membershipRequests = {};
let broadcastMode = {};
let airdropMode = {};
let addChannelMode = {};
let manualMembershipMode = {};
let requiredChannels = []; // Format: [{channel: '@Channel', bonus: 100}]
let membershipPlans = {
  'bronze': { name: 'Bronze', price: 1000, duration: 2592000000, benefits: 'Double faucet rewards' }, // 30 days
  'silver': { name: 'Silver', price: 2500, duration: 7776000000, benefits: 'Triple faucet + Priority support' }, // 90 days
  'gold': { name: 'Gold', price: 5000, duration: 31536000000, benefits: '5x faucet + VIP status' }, // 365 days
  'lifetime': { name: 'Lifetime', price: 10000, duration: -1, benefits: '10x faucet + Lifetime VIP' } // Unlimited
};
let settings = {
  faucetAmount: 100,
  claimCooldown: 3600000,
  referralBonus: 50,
  minWithdraw: 1000,
  botEnabled: true
};

// Load Data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      users = data.users || {};
      blacklist = new Set(data.blacklist || []);
      withdrawalRequests = data.withdrawalRequests || {};
      membershipRequests = data.membershipRequests || {};
      requiredChannels = data.requiredChannels || [];
      settings = data.settings || settings;
      console.log('✅ Data loaded from backup');
    }
  } catch (error) {
    console.error('❌ Error loading data:', error.message);
  }
}

// Save Data (Backup)
function saveData() {
  try {
    const data = {
      users,
      blacklist: Array.from(blacklist),
      withdrawalRequests,
      membershipRequests,
      requiredChannels,
      settings,
      lastBackup: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Backup saved successfully');
  } catch (error) {
    console.error('❌ Error saving data:', error.message);
  }
}

// Auto Backup
setInterval(() => {
  saveData();
}, BACKUP_INTERVAL);

// Utility Functions
const isAdmin = (userId) => ADMIN_IDS.includes(userId);
const isBlacklisted = (userId) => blacklist.has(userId);
const formatNumber = (num) => num.toLocaleString('en-US');

const getUserData = (userId) => {
  if (!users[userId]) {
    users[userId] = {
      id: userId,
      balance: 0,
      totalClaimed: 0,
      referrals: 0,
      lastClaim: 0,
      joined: Date.now(),
      username: '',
      firstName: '',
      hasReferrer: false,
      membership: null,
      channelBonusesClaimed: []
    };
  }
  return users[userId];
};

// Check if membership is active
function hasMembership(userId) {
  const user = users[userId];
  if (!user || !user.membership) return false;
  
  if (user.membership.expiresAt === -1) return true;
  if (user.membership.expiresAt > Date.now()) return true;
  
  user.membership = null;
  return false;
}

// Get faucet multiplier
function getFaucetMultiplier(userId) {
  if (!hasMembership(userId)) return 1;
  
  const plan = users[userId].membership.plan;
  const multipliers = {
    'bronze': 2,
    'silver': 3,
    'gold': 5,
    'lifetime': 10
  };
  return multipliers[plan] || 1;
}

// Check if user joined required channels
async function checkMembership(userId) {
  for (const channelObj of requiredChannels) {
    try {
      const member = await bot.getChatMember(channelObj.channel, userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
  return true;
}

// Send membership required message
async function sendMembershipRequired(chatId) {
  const keyboard = {
    inline_keyboard: [
      ...requiredChannels.map(ch => [{
        text: `📢 Join ${ch.channel}${ch.bonus > 0 ? ` (+${ch.bonus} bonus)` : ''}`,
        url: `https://t.me/${ch.channel.replace('@', '')}`
      }]),
      [{
        text: '✅ I Joined',
        callback_data: 'check_membership'
      }]
    ]
  };
  
  await bot.sendMessage(chatId, 
    '⚠️ You must join our channels first!\n\n' +
    'Click the buttons below to join, then click "I Joined"',
    { reply_markup: keyboard }
  );
}

// Main Menu
function getMainMenu(userId) {
  const user = getUserData(userId);
  const membershipStatus = hasMembership(userId) 
    ? `⭐ ${users[userId].membership.plan.toUpperCase()}` 
    : '👤 Free';
  
  return {
    inline_keyboard: [
      [
        { text: '💰 Wallet', callback_data: 'wallet' },
        { text: '🎁 Faucet', callback_data: 'faucet' }
      ],
      [
        { text: '👥 Referrals', callback_data: 'referrals' },
        { text: '📊 Stats', callback_data: 'stats' }
      ],
      [
        { text: `⭐ Membership (${membershipStatus})`, callback_data: 'membership_menu' }
      ],
      [
        { text: '💸 Withdraw', callback_data: 'withdraw' },
        { text: '❓ Help', callback_data: 'help' }
      ]
    ]
  };
}

// Admin Menu
function getAdminMenu() {
  return {
    inline_keyboard: [
      [
        { text: '👥 Users', callback_data: 'admin_users' },
        { text: '📢 Broadcast', callback_data: 'admin_broadcast' }
      ],
      [
        { text: '💎 Airdrop', callback_data: 'admin_airdrop' },
        { text: '🚫 Blacklist', callback_data: 'admin_blacklist' }
      ],
      [
        { text: '💸 Withdrawals', callback_data: 'admin_withdrawals' },
        { text: '⭐ Memberships', callback_data: 'admin_memberships' }
      ],
      [
        { text: '📢 Channels', callback_data: 'admin_channels' },
        { text: '⚙️ Settings', callback_data: 'admin_settings' }
      ],
      [
        { text: '📊 Bot Stats', callback_data: 'admin_stats' },
        { text: `${settings.botEnabled ? '🔴 Stop' : '🟢 Start'} Bot`, callback_data: 'toggle_bot' }
      ],
      [
        { text: '🔙 Back to Main', callback_data: 'main_menu' }
      ]
    ]
  };
}

// Membership Menu
function getMembershipMenu(userId) {
  const user = getUserData(userId);
  let buttons = [];
  
  if (hasMembership(userId)) {
    const membership = user.membership;
    const expiryText = membership.expiresAt === -1 
      ? 'Never expires' 
      : `Expires: ${new Date(membership.expiresAt).toLocaleDateString()}`;
    
    buttons.push([{ 
      text: `✅ Active: ${membershipPlans[membership.plan].name} - ${expiryText}`, 
      callback_data: 'current_membership' 
    }]);
  }
  
  for (const [key, plan] of Object.entries(membershipPlans)) {
    const durationText = plan.duration === -1 ? 'Lifetime' : `${plan.duration / 86400000} days`;
    buttons.push([{ 
      text: `${plan.name} - ${plan.price} pts (${durationText})`, 
      callback_data: `buy_membership_${key}` 
    }]);
  }
  
  buttons.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);
  
  return { inline_keyboard: buttons };
}

// Start Command
bot.onText(/\/start(.*)/, async (msg, match) => {
  const userId = msg.from.id;
  const username = msg.from.username || 'User';
  const firstName = msg.from.first_name || 'User';
  
  if (isBlacklisted(userId)) {
    return bot.sendMessage(userId, '❌ You are banned from using this bot.');
  }

  if (!settings.botEnabled && !isAdmin(userId)) {
    return bot.sendMessage(userId, '⚠️ Bot is currently under maintenance. Please try again later.');
  }

  // Check membership - ALWAYS CHECK
  if (requiredChannels.length > 0) {
    const isMember = await checkMembership(userId);
    if (!isMember) {
      return sendMembershipRequired(userId);
    }
  }

  const user = getUserData(userId);
  user.username = username;
  user.firstName = firstName;

  // Check for unclaimed channel bonuses
  let newBonuses = 0;
  for (const ch of requiredChannels) {
    if (ch.bonus > 0 && !user.channelBonusesClaimed.includes(ch.channel)) {
      user.balance += ch.bonus;
      newBonuses += ch.bonus;
      user.channelBonusesClaimed.push(ch.channel);
    }
  }

  // Handle referral
  const refCode = match[1].trim();
  if (refCode && refCode !== '' && !user.hasReferrer) {
    const referrerId = parseInt(refCode);
    if (referrerId !== userId && users[referrerId]) {
      users[referrerId].balance += settings.referralBonus;
      users[referrerId].referrals += 1;
      user.hasReferrer = true;
      bot.sendMessage(referrerId, `🎉 New referral! +${settings.referralBonus} points`);
    }
  }

  const membershipStatus = hasMembership(userId) 
    ? `⭐ ${users[userId].membership.plan.toUpperCase()} Member` 
    : '👤 Free User';

  let welcomeMsg = 
    `🌟 Welcome to Faucet Bot!\n\n` +
    `Hello ${firstName}!\n` +
    `Collect free points every hour and exchange them later.\n\n` +
    `💰 Your Balance: ${formatNumber(user.balance)} points\n` +
    `${membershipStatus}\n`;
  
  if (newBonuses > 0) {
    welcomeMsg += `\n🎁 You received ${newBonuses} bonus points!\n`;
  }
  
  welcomeMsg += `\n🎁 Collect free points from faucet\n` +
    `👥 Get referral rewards\n\n` +
    `Use buttons below to start! 👇`;

  saveData();

  await bot.sendMessage(userId, welcomeMsg, { 
    reply_markup: getMainMenu(userId)
  });
});

// Admin Command
bot.onText(/\/admin/, async (msg) => {
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    return bot.sendMessage(userId, '❌ You do not have admin permissions.');
  }

  const statsMsg = 
    `👑 Admin Control Panel\n\n` +
    `📊 Quick Stats:\n` +
    `👥 Total Users: ${Object.keys(users).length}\n` +
    `🚫 Blacklisted: ${blacklist.size}\n` +
    `💰 Faucet Amount: ${settings.faucetAmount}\n` +
    `⏱ Cooldown: ${settings.claimCooldown / 60000} minutes\n` +
    `🔄 Bot Status: ${settings.botEnabled ? '✅ Running' : '❌ Stopped'}`;

  await bot.sendMessage(userId, statsMsg, { 
    reply_markup: getAdminMenu()
  });
});

// Handle Callback Queries
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Check if bot is enabled
  if (!settings.botEnabled && !isAdmin(userId) && data !== 'check_membership') {
    await bot.answerCallbackQuery(query.id, { 
      text: '⚠️ Bot is currently under maintenance.',
      show_alert: true
    });
    return;
  }

  // Check membership for non-admin actions
  if (!isAdmin(userId) && data !== 'check_membership') {
    if (requiredChannels.length > 0) {
      const isMember = await checkMembership(userId);
      if (!isMember) {
        await bot.answerCallbackQuery(query.id, { 
          text: '⚠️ Please join required channels first!',
          show_alert: true
        });
        return sendMembershipRequired(chatId);
      }
    }
  }

  const user = getUserData(userId);

  // Check Membership
  if (data === 'check_membership') {
    const isMember = await checkMembership(userId);
    if (isMember) {
      let totalBonus = 0;
      for (const ch of requiredChannels) {
        if (ch.bonus > 0 && !user.channelBonusesClaimed.includes(ch.channel)) {
          user.balance += ch.bonus;
          totalBonus += ch.bonus;
          user.channelBonusesClaimed.push(ch.channel);
        }
      }
      
      await bot.answerCallbackQuery(query.id, { text: '✅ Verified!' });
      bot.deleteMessage(chatId, messageId);
      
      let msg = `🎉 Welcome! You can now use the bot.`;
      if (totalBonus > 0) {
        msg += `\n\n💰 You received ${totalBonus} bonus points for joining!`;
      }
      msg += `\n\nUse /start to begin!`;
      
      bot.sendMessage(chatId, msg);
    } else {
      await bot.answerCallbackQuery(query.id, { 
        text: '❌ Please join all channels first!',
        show_alert: true
      });
    }
    return;
  }

  // Toggle Bot
  if (data === 'toggle_bot' && isAdmin(userId)) {
    settings.botEnabled = !settings.botEnabled;
    saveData();
    
    await bot.answerCallbackQuery(query.id, { 
      text: `✅ Bot is now ${settings.botEnabled ? 'enabled' : 'disabled'}!` 
    });
    
    const statsMsg = 
      `👑 Admin Control Panel\n\n` +
      `📊 Quick Stats:\n` +
      `👥 Total Users: ${Object.keys(users).length}\n` +
      `🚫 Blacklisted: ${blacklist.size}\n` +
      `💰 Faucet Amount: ${settings.faucetAmount}\n` +
      `⏱ Cooldown: ${settings.claimCooldown / 60000} minutes\n` +
      `🔄 Bot Status: ${settings.botEnabled ? '✅ Running' : '❌ Stopped'}`;

    await bot.editMessageText(statsMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getAdminMenu()
    });
    return;
  }

  // Main Menu
  if (data === 'main_menu') {
    await bot.editMessageText('🏠 Main Menu - Choose an option:', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getMainMenu(userId)
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Wallet
  if (data === 'wallet') {
    const membershipInfo = hasMembership(userId) 
      ? `\n⭐ Membership: ${users[userId].membership.plan.toUpperCase()}\n   Expires: ${users[userId].membership.expiresAt === -1 ? 'Never' : new Date(users[userId].membership.expiresAt).toLocaleDateString()}`
      : '';
    
    const walletMsg = 
      `💰 Your Wallet\n\n` +
      `Current Balance: ${formatNumber(user.balance)} points\n` +
      `📊 Total Claimed: ${formatNumber(user.totalClaimed)} points\n` +
      `👥 Your Referrals: ${user.referrals}${membershipInfo}\n` +
      `📅 Joined: ${new Date(user.joined).toLocaleDateString('en')}`;
    
    await bot.editMessageText(walletMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Faucet
  if (data === 'faucet') {
    const now = Date.now();
    const timeSinceLastClaim = now - user.lastClaim;

    if (timeSinceLastClaim < settings.claimCooldown) {
      const timeLeft = settings.claimCooldown - timeSinceLastClaim;
      const minutes = Math.ceil(timeLeft / 60000);
      await bot.answerCallbackQuery(query.id, { 
        text: `⏰ Come back in ${minutes} minutes!`,
        show_alert: true
      });
      return;
    }

    const multiplier = getFaucetMultiplier(userId);
    const claimAmount = settings.faucetAmount * multiplier;
    
    user.balance += claimAmount;
    user.totalClaimed += claimAmount;
    user.lastClaim = now;

    const claimMsg = 
      `🎉 Claim Successful!\n\n` +
      `💰 You received: ${claimAmount} points${multiplier > 1 ? ` (${multiplier}x boost!)` : ''}\n` +
      `💼 New Balance: ${formatNumber(user.balance)} points\n\n` +
      `⏰ Come back in 1 hour to claim again!`;

    await bot.editMessageText(claimMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]]
      }
    });
    
    saveData();
    return bot.answerCallbackQuery(query.id, { text: '✅ Claimed!' });
  }

  // Referrals
  if (data === 'referrals') {
    const botUsername = (await bot.getMe()).username;
    const refLink = `https://t.me/${botUsername}?start=${userId}`;
    const refMsg = 
      `👥 Referral System\n\n` +
      `Your Referral Link:\n${refLink}\n\n` +
      `📊 Your Stats:\n` +
      `• Your Referrals: ${user.referrals}\n` +
      `• Earnings from Referrals: ${user.referrals * settings.referralBonus} points\n\n` +
      `💡 Get ${settings.referralBonus} points for each friend!`;

    await bot.editMessageText(refMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Share Link', url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}` }],
          [{ text: '🔙 Back', callback_data: 'main_menu' }]
        ]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Stats
  if (data === 'stats') {
    const totalUsers = Object.keys(users).length;
    const totalBalance = Object.values(users).reduce((sum, u) => sum + u.balance, 0);
    const statsMsg = 
      `📊 Bot Statistics\n\n` +
      `👥 Total Users: ${totalUsers}\n` +
      `💰 Total Points Distributed: ${formatNumber(totalBalance)}\n` +
      `🎁 Faucet Amount: ${settings.faucetAmount} points\n` +
      `⏱ Cooldown: ${settings.claimCooldown / 60000} minutes\n` +
      `🔄 Bot Status: ${settings.botEnabled ? '✅ Running' : '❌ Stopped'}`;

    await bot.editMessageText(statsMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Membership Menu
  if (data === 'membership_menu') {
    let msg = `⭐ Membership Plans\n\n`;
    
    if (hasMembership(userId)) {
      const membership = user.membership;
      const plan = membershipPlans[membership.plan];
      const expiryText = membership.expiresAt === -1 
        ? 'Never' 
        : new Date(membership.expiresAt).toLocaleDateString();
      
      msg += `✅ Current: ${plan.name}\nExpires: ${expiryText}\nBenefits: ${plan.benefits}\n\n`;
    }
    
    msg += `Choose a plan to upgrade:\n`;
    for (const [key, plan] of Object.entries(membershipPlans)) {
      const duration = plan.duration === -1 ? 'Lifetime' : `${plan.duration / 86400000} days`;
      msg += `\n${plan.name} - ${plan.price} pts (${duration})\n${plan.benefits}`;
    }

    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getMembershipMenu(userId)
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Buy Membership
  if (data.startsWith('buy_membership_')) {
    const planKey = data.replace('buy_membership_', '');
    const plan = membershipPlans[planKey];
    
    if (!plan) return bot.answerCallbackQuery(query.id, { text: '❌ Invalid plan' });
    
    const confirmMsg = 
      `⭐ Confirm Purchase\n\n` +
      `Plan: ${plan.name}\n` +
      `Price: ${plan.price} points\n` +
      `Duration: ${plan.duration === -1 ? 'Lifetime' : `${plan.duration / 86400000} days`}\n` +
      `Benefits: ${plan.benefits}\n\n` +
      `Your Balance: ${formatNumber(user.balance)} points\n\n` +
      `Do you want to purchase?`;

    await bot.editMessageText(confirmMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm', callback_data: `confirm_membership_${planKey}` },
            { text: '❌ Cancel', callback_data: 'membership_menu' }
          ]
        ]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Confirm Membership Purchase
  if (data.startsWith('confirm_membership_')) {
    const planKey = data.replace('confirm_membership_', '');
    const plan = membershipPlans[planKey];
    
    if (user.balance < plan.price) {
      await bot.answerCallbackQuery(query.id, { 
        text: `❌ Insufficient balance. Need ${plan.price} points.`,
        show_alert: true
      });
      return;
    }

    user.balance -= plan.price;
    const expiresAt = plan.duration === -1 ? -1 : Date.now() + plan.duration;
    user.membership = { plan: planKey, expiresAt };
    
    saveData();

    const successMsg = 
      `🎉 Membership Activated!\n\n` +
      `Plan: ${plan.name}\n` +
      `Expires: ${expiresAt === -1 ? 'Never' : new Date(expiresAt).toLocaleDateString()}\n` +
      `Benefits: ${plan.benefits}\n\n` +
      `Enjoy your premium features!`;

    await bot.editMessageText(successMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back to Main', callback_data: 'main_menu' }]]
      }
    });
    return bot.answerCallbackQuery(query.id, { text: '✅ Success!' });
  }

  // Withdraw
  if (data === 'withdraw') {
    if (user.balance < settings.minWithdraw) {
      await bot.answerCallbackQuery(query.id, { 
        text: `❌ Minimum withdrawal is ${settings.minWithdraw} points. Your balance: ${user.balance}`,
        show_alert: true
      });
      return;
    }

    const withdrawMsg = 
      `💸 Withdrawal Request\n\n` +
      `Your Balance: ${formatNumber(user.balance)} points\n` +
      `Minimum: ${settings.minWithdraw} points\n\n` +
      `Please send the amount you want to withdraw:`;

    await bot.editMessageText(withdrawMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Cancel', callback_data: 'main_menu' }]]
      }
    });
    
    users[userId].waitingForWithdraw = true;
    return bot.answerCallbackQuery(query.id);
  }

  // Help
  if (data === 'help') {
    const helpMsg = 
      `❓ How to Use the Bot\n\n` +
      `🎁 Faucet: Collect free points every hour\n` +
      `👥 Referrals: Get rewards for inviting friends\n` +
      `💰 Wallet: Track your balance and stats\n` +
      `⭐ Membership: Get premium benefits\n` +
      `💸 Withdraw: Withdraw points after reaching minimum\n\n` +
      `For support: @YourAdminUsername`;

    await bot.editMessageText(helpMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // ===== ADMIN SECTION =====
  
  if (!isAdmin(userId)) {
    return bot.answerCallbackQuery(query.id, { text: '❌ Admin only!' });
  }

  // Admin - Users
  if (data === 'admin_users') {
    const usersList = Object.values(users)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)
      .map((u, i) => {
        const memberTag = hasMembership(u.id) ? ' ⭐' : '';
        return `${i + 1}. ${u.firstName}${memberTag} - ${formatNumber(u.balance)} pts`;
      })
      .join('\n');
    
    const usersMsg = `👥 Top 10 Users:\n\n${usersList}`;
    
    await bot.editMessageText(usersMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'admin' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

// Admin - Broadcast
  if (data === 'admin_broadcast') {
    broadcastMode[userId] = true;
    
    await bot.editMessageText(
      '📢 Broadcast Mode\n\nSend the message you want to broadcast to all users:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin' }]]
        }
      }
    );
    return bot.answerCallbackQuery(query.id);
  }

  // Admin - Airdrop
  if (data === 'admin_airdrop') {
    airdropMode[userId] = true;
    
    await bot.editMessageText(
      '💎 Airdrop Mode\n\nSend the amount you want to distribute to all users:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin' }]]
        }
      }
    );
    return bot.answerCallbackQuery(query.id);
  }

  // Admin - Channels
  if (data === 'admin_channels') {
    let channelsMsg = '📢 Required Channels Management\n\n';
    
    if (requiredChannels.length === 0) {
      channelsMsg += 'No required channels set.\n\n';
    } else {
      channelsMsg += 'Current Channels:\n';
      requiredChannels.forEach((ch, i) => {
        channelsMsg += `${i + 1}. ${ch.channel} (Bonus: ${ch.bonus} pts)\n`;
      });
      channelsMsg += '\n';
    }
    
    channelsMsg += 'Commands:\n';
    channelsMsg += '/addchannel - Add new channel\n';
    channelsMsg += '/removechannel @channel - Remove channel';

    await bot.editMessageText(channelsMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Add Channel', callback_data: 'add_channel_mode' }],
          [{ text: '🔙 Back', callback_data: 'admin' }]
        ]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Add Channel Mode
  if (data === 'add_channel_mode') {
    addChannelMode[userId] = true;
    
    await bot.editMessageText(
      '➕ Add Channel Mode\n\n' +
      'Send in format: @ChannelUsername bonus\n' +
      'Example: @MyChannel 100\n\n' +
      'Bonus is optional (default 0)',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_channels' }]]
        }
      }
    );
    return bot.answerCallbackQuery(query.id);
  }

  // Admin - Blacklist
  if (data === 'admin_blacklist') {
    const blacklistMsg = blacklist.size > 0 
      ? `🚫 Blacklisted Users:\n${Array.from(blacklist).join('\n')}\n\nUse /ban [user_id] or /unban [user_id]`
      : '✅ No blacklisted users\n\nUse /ban [user_id] to ban';
    
    await bot.editMessageText(blacklistMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'admin' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Admin - Memberships
  if (data === 'admin_memberships') {
    const requests = Object.entries(membershipRequests);
    
    if (requests.length === 0) {
      await bot.editMessageText('⭐ No pending membership requests\n\nUse /givemembership to manually grant', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Give Membership', callback_data: 'manual_membership_mode' }],
            [{ text: '🔙 Back', callback_data: 'admin' }]
          ]
        }
      });
      return bot.answerCallbackQuery(query.id);
    }

    const buttons = requests.map(([reqUserId, req]) => [
      { 
        text: `${req.firstName} - ${req.planName}`, 
        callback_data: `view_membership_${reqUserId}` 
      }
    ]);
    buttons.push([{ text: '➕ Give Membership', callback_data: 'manual_membership_mode' }]);
    buttons.push([{ text: '🔙 Back', callback_data: 'admin' }]);

    await bot.editMessageText(`⭐ Pending Membership Requests (${requests.length}):`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: buttons }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Manual Membership Mode
  if (data === 'manual_membership_mode') {
    manualMembershipMode[userId] = true;
    
    await bot.editMessageText(
      '➕ Manual Membership Grant\n\n' +
      'Send in format: user_id plan_key duration_days\n' +
      'Example: 123456789 gold 365\n' +
      'Use -1 for lifetime\n\n' +
      'Available plans: bronze, silver, gold, lifetime',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_memberships' }]]
        }
      }
    );
    return bot.answerCallbackQuery(query.id);
  }

  // View Membership Request
  if (data.startsWith('view_membership_')) {
    const reqUserId = data.replace('view_membership_', '');
    const req = membershipRequests[reqUserId];
    
    if (!req) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Request not found' });
      return;
    }

    const membershipMsg = 
      `⭐ Membership Request\n\n` +
      `User: ${req.firstName} (@${req.username || 'none'})\n` +
      `ID: ${reqUserId}\n` +
      `Plan: ${req.planName}\n` +
      `Date: ${new Date(req.timestamp).toLocaleString()}`;

    await bot.editMessageText(membershipMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_membership_${reqUserId}` },
            { text: '❌ Reject', callback_data: `reject_membership_${reqUserId}` }
          ],
          [{ text: '🔙 Back', callback_data: 'admin_memberships' }]
        ]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Approve Membership Request
  if (data.startsWith('approve_membership_')) {
    const reqUserId = data.replace('approve_membership_', '');
    const req = membershipRequests[reqUserId];
    
    if (req) {
      const plan = membershipPlans[req.planKey];
      const expiresAt = plan.duration === -1 ? -1 : Date.now() + plan.duration;
      users[reqUserId].membership = { plan: req.planKey, expiresAt };
      delete membershipRequests[reqUserId];
      
      saveData();
      
      bot.sendMessage(reqUserId, 
        `🎉 Your membership request has been approved!\n\n` +
        `Plan: ${plan.name}\n` +
        `Expires: ${expiresAt === -1 ? 'Never' : new Date(expiresAt).toLocaleDateString()}\n` +
        `Benefits: ${plan.benefits}`
      );
      
      await bot.answerCallbackQuery(query.id, { text: '✅ Approved!' });
      
      bot.editMessageText('✅ Membership request approved!', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Memberships', callback_data: 'admin_memberships' }]]
        }
      });
    }
    return;
  }

  // Reject Membership Request
  if (data.startsWith('reject_membership_')) {
    const reqUserId = data.replace('reject_membership_', '');
    const req = membershipRequests[reqUserId];
    
    if (req) {
      delete membershipRequests[reqUserId];
      saveData();
      
      bot.sendMessage(reqUserId, 
        `❌ Your membership request for ${req.planName} has been rejected.`
      );
      
      await bot.answerCallbackQuery(query.id, { text: '❌ Rejected!' });
      
      bot.editMessageText('❌ Membership request rejected!', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Memberships', callback_data: 'admin_memberships' }]]
        }
      });
    }
    return;
  }

  // Admin - Withdrawals
  if (data === 'admin_withdrawals') {
    const withdrawals = Object.entries(withdrawalRequests);
    
    if (withdrawals.length === 0) {
      await bot.editMessageText('💸 No pending withdrawal requests', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: 'admin' }]]
        }
      });
      return bot.answerCallbackQuery(query.id);
    }

    const buttons = withdrawals.map(([reqUserId, req]) => [
      { 
        text: `${req.firstName} - ${req.amount} pts`, 
        callback_data: `view_withdraw_${reqUserId}` 
      }
    ]);
    buttons.push([{ text: '🔙 Back', callback_data: 'admin' }]);

    await bot.editMessageText(`💸 Pending Withdrawals (${withdrawals.length}):`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: buttons }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // View Withdrawal
  if (data.startsWith('view_withdraw_')) {
    const reqUserId = data.replace('view_withdraw_', '');
    const req = withdrawalRequests[reqUserId];
    
    if (!req) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Request not found' });
      return;
    }

    const withdrawMsg = 
      `💸 Withdrawal Request\n\n` +
      `User: ${req.firstName} (@${req.username || 'none'})\n` +
      `ID: ${reqUserId}\n` +
      `Amount: ${formatNumber(req.amount)} points\n` +
      `Date: ${new Date(req.timestamp).toLocaleString()}`;

    await bot.editMessageText(withdrawMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_withdraw_${reqUserId}` },
            { text: '❌ Reject', callback_data: `reject_withdraw_${reqUserId}` }
          ],
          [{ text: '🔙 Back', callback_data: 'admin_withdrawals' }]
        ]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Approve Withdrawal
  if (data.startsWith('approve_withdraw_')) {
    const reqUserId = data.replace('approve_withdraw_', '');
    const req = withdrawalRequests[reqUserId];
    
    if (req) {
      users[reqUserId].balance -= req.amount;
      delete withdrawalRequests[reqUserId];
      saveData();
      
      bot.sendMessage(reqUserId, 
        `✅ Your withdrawal request of ${formatNumber(req.amount)} points has been approved!`
      );
      
      await bot.answerCallbackQuery(query.id, { text: '✅ Approved!' });
      
      bot.editMessageText('✅ Withdrawal approved!', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Withdrawals', callback_data: 'admin_withdrawals' }]]
        }
      });
    }
    return;
  }

  // Reject Withdrawal
  if (data.startsWith('reject_withdraw_')) {
    const reqUserId = data.replace('reject_withdraw_', '');
    const req = withdrawalRequests[reqUserId];
    
    if (req) {
      delete withdrawalRequests[reqUserId];
      saveData();
      
      bot.sendMessage(reqUserId, 
        `❌ Your withdrawal request of ${formatNumber(req.amount)} points has been rejected.`
      );
      
      await bot.answerCallbackQuery(query.id, { text: '❌ Rejected!' });
      
      bot.editMessageText('❌ Withdrawal rejected!', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back to Withdrawals', callback_data: 'admin_withdrawals' }]]
        }
      });
    }
    return;
  }

  // Admin - Settings
  if (data === 'admin_settings') {
    const settingsMsg = 
      `⚙️ Bot Settings\n\n` +
      `💰 Faucet Amount: ${settings.faucetAmount}\n` +
      `⏱ Cooldown: ${settings.claimCooldown / 60000} minutes\n` +
      `🎁 Referral Bonus: ${settings.referralBonus}\n` +
      `💸 Min Withdraw: ${settings.minWithdraw}\n` +
      `🔄 Bot Status: ${settings.botEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
      `Commands:\n` +
      `/setfaucet [amount]\n` +
      `/setcooldown [minutes]\n` +
      `/setminwithdraw [amount]\n` +
      `/setrefbonus [amount]`;

    await bot.editMessageText(settingsMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'admin' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Admin - Bot Stats
  if (data === 'admin_stats') {
    const totalUsers = Object.keys(users).length;
    const totalBalance = Object.values(users).reduce((sum, u) => sum + u.balance, 0);
    const totalClaimed = Object.values(users).reduce((sum, u) => sum + u.totalClaimed, 0);
    const totalRefs = Object.values(users).reduce((sum, u) => sum + u.referrals, 0);
    const premiumUsers = Object.values(users).filter(u => hasMembership(u.id)).length;
    
    const adminStatsMsg = 
      `📊 Comprehensive Statistics\n\n` +
      `👥 Total Users: ${totalUsers}\n` +
      `⭐ Premium Members: ${premiumUsers}\n` +
      `💰 Total Balances: ${formatNumber(totalBalance)}\n` +
      `🎁 Total Claimed: ${formatNumber(totalClaimed)}\n` +
      `👥 Total Referrals: ${totalRefs}\n` +
      `🚫 Blacklisted: ${blacklist.size}\n` +
      `💸 Pending Withdrawals: ${Object.keys(withdrawalRequests).length}\n` +
      `⭐ Pending Memberships: ${Object.keys(membershipRequests).length}\n` +
      `📢 Required Channels: ${requiredChannels.length}`;

    await bot.editMessageText(adminStatsMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'admin' }]]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // Admin Main Menu
  if (data === 'admin') {
    const statsMsg = 
      `👑 Admin Control Panel\n\n` +
      `📊 Quick Stats:\n` +
      `👥 Total Users: ${Object.keys(users).length}\n` +
      `🚫 Blacklisted: ${blacklist.size}\n` +
      `💰 Faucet Amount: ${settings.faucetAmount}\n` +
      `⏱ Cooldown: ${settings.claimCooldown / 60000} minutes\n` +
      `🔄 Bot Status: ${settings.botEnabled ? '✅ Running' : '❌ Stopped'}`;

    await bot.editMessageText(statsMsg, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getAdminMenu()
    });
    return bot.answerCallbackQuery(query.id);
  }

  bot.answerCallbackQuery(query.id);
});

// Handle Text Messages
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const userId = msg.from.id;
  const text = msg.text;
  
  if (isBlacklisted(userId)) {
    return bot.sendMessage(userId, '❌ You are banned from using this bot.');
  }

  if (!settings.botEnabled && !isAdmin(userId)) {
    return bot.sendMessage(userId, '⚠️ Bot is currently under maintenance.');
  }

  const user = getUserData(userId);

  // Handle withdrawal amount input
  if (user.waitingForWithdraw) {
    const amount = parseInt(text);
    
    if (isNaN(amount) || amount < settings.minWithdraw) {
      return bot.sendMessage(userId, 
        `❌ Invalid amount. Minimum is ${settings.minWithdraw} points.`
      );
    }
    
    if (amount > user.balance) {
      return bot.sendMessage(userId, 
        `❌ Insufficient balance. You have ${formatNumber(user.balance)} points.`
      );
    }

    withdrawalRequests[userId] = {
      userId: userId,
      username: user.username,
      firstName: user.firstName,
      amount: amount,
      timestamp: Date.now()
    };

    user.waitingForWithdraw = false;
    saveData();

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, 
          `💸 New Withdrawal Request!\n\n` +
          `User: ${user.firstName} (@${user.username || 'none'})\n` +
          `ID: ${userId}\n` +
          `Amount: ${formatNumber(amount)} points\n\n` +
          `Use /admin to manage requests.`
        );
      } catch (e) {
        console.error('Error notifying admin:', e.message);
      }
    }

    return bot.sendMessage(userId, 
      `✅ Withdrawal request submitted!\n\n` +
      `Amount: ${formatNumber(amount)} points\n` +
      `Your request is pending admin approval.`,
      { reply_markup: getMainMenu(userId) }
    );
  }

  // Admin modes
  if (isAdmin(userId)) {
    // Broadcast mode
    if (broadcastMode[userId]) {
      delete broadcastMode[userId];
      
      let sent = 0;
      let failed = 0;
      
      bot.sendMessage(userId, '📢 Broadcasting... Please wait.');
      
      for (const uid of Object.keys(users)) {
        try {
          await bot.sendMessage(uid, `📢 Message from Admin:\n\n${text}`);
          sent++;
          console.log(`✅ Broadcast sent to user ${uid}`);
        } catch (e) {
          failed++;
          console.error(`❌ Failed to send to user ${uid}:`, e.message);
        }
      }
      
      return bot.sendMessage(userId, 
        `✅ Broadcast complete!\n\n` +
        `✅ Sent: ${sent}\n` +
        `❌ Failed: ${failed}`,
        { reply_markup: getAdminMenu() }
      );
    }

    // Airdrop mode
    if (airdropMode[userId]) {
      delete airdropMode[userId];
      
      const amount = parseInt(text);
      
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(userId, '❌ Invalid amount. Please enter a positive number.');
      }

      let sent = 0;
      let failed = 0;
      
      bot.sendMessage(userId, '💎 Distributing airdrop... Please wait.');
      
      for (const user of Object.values(users)) {
        try {
          user.balance += amount;
          await bot.sendMessage(user.id, 
            `🎉 Congratulations! You received ${amount} points from airdrop!`
          );
          sent++;
          console.log(`✅ Airdrop sent to user ${user.id}: ${amount} points`);
        } catch (e) {
          failed++;
          console.error(`❌ Failed to airdrop to user ${user.id}:`, e.message);
        }
      }
      
      saveData();
      
      return bot.sendMessage(userId, 
        `✅ Airdrop complete!\n\n` +
        `💎 Amount per user: ${amount} points\n` +
        `✅ Distributed to: ${sent} users\n` +
        `❌ Failed: ${failed}`,
        { reply_markup: getAdminMenu() }
      );
    }

    // Add Channel mode
    if (addChannelMode[userId]) {
      delete addChannelMode[userId];
      
      const parts = text.trim().split(' ');
      const channel = parts[0];
      const bonus = parseInt(parts[1]) || 0;
      
      if (!channel.startsWith('@')) {
        return bot.sendMessage(userId, '❌ Channel must start with @');
      }

      if (requiredChannels.find(ch => ch.channel === channel)) {
        return bot.sendMessage(userId, '❌ Channel already in list');
      }

      requiredChannels.push({ channel, bonus });
      saveData();
      
      return bot.sendMessage(userId, 
        `✅ Channel added successfully!\n\n` +
        `Channel: ${channel}\n` +
        `Bonus: ${bonus} points`,
        { reply_markup: getAdminMenu() }
      );
    }

    // Manual Membership mode
    if (manualMembershipMode[userId]) {
      delete manualMembershipMode[userId];
      
      const parts = text.trim().split(' ');
      if (parts.length !== 3) {
        return bot.sendMessage(userId, '❌ Invalid format. Use: user_id plan_key duration_days');
      }

      const targetUserId = parseInt(parts[0]);
      const planKey = parts[1];
      const durationDays = parseInt(parts[2]);

      if (isNaN(targetUserId) || !membershipPlans[planKey] || isNaN(durationDays)) {
        return bot.sendMessage(userId, '❌ Invalid parameters');
      }

      if (!users[targetUserId]) {
        return bot.sendMessage(userId, '❌ User not found');
      }

      const expiresAt = durationDays === -1 ? -1 : Date.now() + (durationDays * 86400000);
      users[targetUserId].membership = { plan: planKey, expiresAt };
      
      saveData();

      const plan = membershipPlans[planKey];
      bot.sendMessage(targetUserId, 
        `🎉 You have been granted a membership!\n\n` +
        `Plan: ${plan.name}\n` +
        `Expires: ${expiresAt === -1 ? 'Never' : new Date(expiresAt).toLocaleDateString()}\n` +
        `Benefits: ${plan.benefits}`
      );

      return bot.sendMessage(userId, 
        `✅ Membership granted!\n\n` +
        `User: ${users[targetUserId].firstName}\n` +
        `Plan: ${plan.name}\n` +
        `Duration: ${durationDays === -1 ? 'Lifetime' : `${durationDays} days`}`,
        { reply_markup: getAdminMenu() }
      );
    }
  }
});

// Admin Commands
bot.onText(/\/setfaucet (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  settings.faucetAmount = parseInt(match[1]);
  saveData();
  await bot.sendMessage(userId, `✅ Faucet amount set to ${settings.faucetAmount} points`);
});

bot.onText(/\/setcooldown (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  settings.claimCooldown = parseInt(match[1]) * 60000;
  saveData();
  await bot.sendMessage(userId, `✅ Cooldown set to ${match[1]} minutes`);
});

bot.onText(/\/setminwithdraw (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  settings.minWithdraw = parseInt(match[1]);
  saveData();
  await bot.sendMessage(userId, `✅ Minimum withdrawal set to ${settings.minWithdraw} points`);
});

bot.onText(/\/setrefbonus (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  settings.referralBonus = parseInt(match[1]);
  saveData();
  await bot.sendMessage(userId, `✅ Referral bonus set to ${settings.referralBonus} points`);
});

bot.onText(/\/ban (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  const targetId = parseInt(match[1]);
  blacklist.add(targetId);
  saveData();
  await bot.sendMessage(userId, `✅ User ${targetId} has been banned`);
});

bot.onText(/\/unban (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  const targetId = parseInt(match[1]);
  blacklist.delete(targetId);
  saveData();
  await bot.sendMessage(userId, `✅ User ${targetId} has been unbanned`);
});

bot.onText(/\/removechannel (@\w+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  const channel = match[1];
  const index = requiredChannels.findIndex(ch => ch.channel === channel);
  
  if (index === -1) {
    return await bot.sendMessage(userId, '❌ Channel not found');
  }

  requiredChannels.splice(index, 1);
  saveData();
  await bot.sendMessage(userId, `✅ Channel ${channel} removed`);
});

bot.onText(/\/backup/, async (msg) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  saveData();
  await bot.sendMessage(userId, '✅ Manual backup completed!');
});

bot.onText(/\/download_backup/, async (msg) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;
  
  try {
    await bot.sendDocument(userId, DATA_FILE, {}, {
      filename: `backup_${Date.now()}.json`,
      contentType: 'application/json'
    });
  } catch (error) {
    await bot.sendMessage(userId, '❌ Error sending backup file');
  }
});

// Error Handler
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Load data on start
loadData();

console.log('┏━━━━━━━━━┫Telegram-FaucetBot┣━━━━━━━━┓');
console.log('┃                                     ┃');
console.log('┃    Telegram Faucet Bot Started!!    ┃');
console.log('┃    Earn Free Crypto Daily System    ┃');
console.log('┃    User (/start) - Admin (/admin)   ┃');
console.log('┃                                     ┃');
console.log('┗━━━━━━━━━━━━━━━┫@s2iz┣━━━━━━━━━━━━━━━┛');
