// ==========================================================
// MS Haydarov Bot — Majburiy obuna + Referal tizimi
// Bot API 9.4: tugma rangi (style) va custom emoji (icon_custom_emoji_id)
// ==========================================================
require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ---------------------- SOZLAMALAR ----------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN .env faylida topilmadi!');
  process.exit(1);
}

// Majburiy obuna kanallari — bot ikkalasida ham ADMIN bo'lishi SHART
const CHANNELS = [
  {
    label: '1-kanal: Matematika milliy sertifikatim',
    url: process.env.CHANNEL_1_LINK || 'https://t.me/Matematika_milliysertifikatim',
    chatId: process.env.CHANNEL_1 || '@Matematika_milliysertifikatim',
    style: 'primary', // ko'k
    emojiId: process.env.EMOJI_BLUE_ID || '5424998072323185646',
  },
  {
    label: '2-kanal: Talim Talaba',
    url: process.env.CHANNEL_2_LINK || 'https://t.me/talimtalaba',
    chatId: process.env.CHANNEL_2 || '@talimtalaba',
    style: 'success', // yashil
    emojiId: process.env.EMOJI_GREEN_ID || '5451880684945708278',
  },
];

const CONFIRM_STYLE = 'danger'; // qizil
const CONFIRM_EMOJI_ID = process.env.EMOJI_RED_ID || '5273805757396031980';

// Referal uchun kerakli odamlar soni
const REQUIRED_REFERRALS = parseInt(process.env.REQUIRED_REFERRALS || '5', 10);

// Maxsus guruh havolalari (vergul bilan ajratilgan, bir nechtasi bo'lishi mumkin)
const GROUP_LINKS = (process.env.GROUP_LINKS || 'https://t.me/+xxxxxxxxxxxx')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Webhook uchun (Render'da ishlatiladi)
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

// ---------------------- MA'LUMOTLAR BAZASI (JSON fayl) ----------------------
// ESLATMA: Render'ning bepul tarifida disk vaqtinchalik — qayta deploy/restart
// bo'lganda users.json tozalanib ketishi mumkin. Doimiy saqlash uchun Render
// Disk ulash yoki MongoDB Atlas (bepul) kabi haqiqiy bazaga o'tish tavsiya etiladi.
const DB_PATH = path.join(__dirname, 'data', 'users.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify({ users: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error("DB o'qishda xatolik:", e.message);
    return { users: {} };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('DB yozishda xatolik:', e.message);
  }
}

function getUser(db, userId) {
  const id = String(userId);
  if (!db.users[id]) {
    db.users[id] = {
      invitedBy: null,
      invitedCount: 0,
      verified: false,
      groupLinkSent: false,
      joinedAt: new Date().toISOString(),
    };
  }
  return db.users[id];
}

function pickGroupLink() {
  if (GROUP_LINKS.length === 1) return GROUP_LINKS[0];
  return GROUP_LINKS[Math.floor(Math.random() * GROUP_LINKS.length)];
}

// ---------------------- BOT ----------------------
const bot = new Telegraf(BOT_TOKEN);

// Har bir kanalda a'zolikni tekshirish
async function isMemberOfChannel(ctx, chatId, userId) {
  try {
    const member = await ctx.telegram.getChatMember(chatId, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) {
    console.error('getChatMember xatolik (' + chatId + '), bot admin emasmi?:', e.message);
    return false; // xatolik bo'lsa xavfsizlik uchun "a'zo emas" deb hisoblanadi
  }
}

async function isSubscribedToAll(ctx, userId) {
  for (const ch of CHANNELS) {
    const ok = await isMemberOfChannel(ctx, ch.chatId, userId);
    if (!ok) return false;
  }
  return true;
}

// Obuna klaviaturasi — Bot API 9.4: style (rang) + icon_custom_emoji_id
function buildSubscribeKeyboard() {
  const rows = CHANNELS.map((ch) => [
    {
      text: ch.label,
      url: ch.url,
      style: ch.style,
      icon_custom_emoji_id: ch.emojiId,
    },
  ]);
  rows.push([
    {
      text: 'Tasdiqlash',
      callback_data: 'check_sub',
      style: CONFIRM_STYLE,
      icon_custom_emoji_id: CONFIRM_EMOJI_ID,
    },
  ]);
  return { inline_keyboard: rows };
}

function subscribeMessageText() {
  return (
    "Assalomu alaykum! 👋\n\n" +
    "Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling, " +
    'so\'ng "Tasdiqlash" tugmasini bosing:'
  );
}

async function sendReferralInfo(ctx, userId, db) {
  const user = getUser(db, userId);
  const me = await ctx.telegram.getMe();
  const refLink = 'https://t.me/' + me.username + '?start=' + userId;

  const text =
    '✅ Tasdiqlandingiz!\n\n' +
    '📎 Sizning referal havolangiz:\n' + refLink + '\n\n' +
    '👥 Taklif qilingan do\'stlar: ' + user.invitedCount + '/' + REQUIRED_REFERRALS + '\n\n' +
    "Havolani do'stlaringizga yuboring — " + REQUIRED_REFERRALS + ' ta odam taklif qilsangiz, ' +
    'maxsus yopiq guruhga havola olasiz!';

  await ctx.reply(text);
}

async function creditReferrerIfNeeded(ctx, db, user, userId) {
  if (!user.invitedBy) return;
  const referrer = getUser(db, user.invitedBy);
  referrer.invitedCount += 1;
  saveDB(db);

  try {
    await ctx.telegram.sendMessage(
      user.invitedBy,
      "🎉 Sizning havolangiz orqali yangi foydalanuvchi qo'shildi!\n" +
      'Jami taklif qilinganlar: ' + referrer.invitedCount + '/' + REQUIRED_REFERRALS
    );

    if (referrer.invitedCount >= REQUIRED_REFERRALS && !referrer.groupLinkSent) {
      referrer.groupLinkSent = true;
      saveDB(db);
      const link = pickGroupLink();
      await ctx.telegram.sendMessage(
        user.invitedBy,
        '🎉 Tabriklaymiz! Siz ' + REQUIRED_REFERRALS + " ta do'stingizni taklif qildingiz.\n\n" +
        '👉 Maxsus yopiq guruhga qo\'shiling:\n' + link
      );
    }
  } catch (e) {
    console.error("Referrerga xabar yuborib bo'lmadi:", e.message);
  }
}

// ---------------------- HANDLERLAR ----------------------

bot.start(async (ctx) => {
  const db = loadDB();
  const userId = ctx.from.id;
  const user = getUser(db, userId);

  // Referal parametrini o'qish: /start <referrerId>
  const payload = ctx.startPayload;
  if (payload && /^\d+$/.test(payload)) {
    const referrerId = payload;
    if (referrerId !== String(userId) && !user.invitedBy) {
      user.invitedBy = referrerId;
    }
  }
  saveDB(db);

  const subscribed = await isSubscribedToAll(ctx, userId);
  if (!subscribed) {
    await ctx.reply(subscribeMessageText(), {
      reply_markup: buildSubscribeKeyboard(),
    });
    return;
  }

  const firstTime = !user.verified;
  user.verified = true;
  saveDB(db);

  if (firstTime) {
    await creditReferrerIfNeeded(ctx, db, user, userId);
  }
  await sendReferralInfo(ctx, userId, db);
});

bot.action('check_sub', async (ctx) => {
  const db = loadDB();
  const userId = ctx.from.id;
  const user = getUser(db, userId);

  const subscribed = await isSubscribedToAll(ctx, userId);
  if (!subscribed) {
    await ctx.answerCbQuery("❌ Siz hali barcha kanallarga obuna bo'lmadingiz!", {
      show_alert: true,
    });
    return;
  }

  await ctx.answerCbQuery('✅ Obuna tasdiqlandi!');

  const firstTimeConfirm = !user.verified;
  user.verified = true;
  saveDB(db);

  if (firstTimeConfirm) {
    await creditReferrerIfNeeded(ctx, db, user, userId);
  }

  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch (e) {
    // e'tiborsiz qoldiramiz
  }

  await sendReferralInfo(ctx, userId, db);
});

bot.command('mystats', async (ctx) => {
  const db = loadDB();
  const user = getUser(db, ctx.from.id);
  await ctx.reply(
    '📊 Statistikangiz:\n' +
    "Taklif qilinganlar: " + user.invitedCount + '/' + REQUIRED_REFERRALS
  );
});

bot.catch((err, ctx) => {
  console.error('Xatolik yuz berdi (update ' + ctx.updateType + '):', err);
});

// ---------------------- ISHGA TUSHIRISH ----------------------
if (WEBHOOK_URL) {
  // Render (production) — webhook rejimi
  const app = express();
  app.use(express.json());

  const secretPath = '/webhook/' + BOT_TOKEN;
  app.use(bot.webhookCallback(secretPath));

  app.get('/', (req, res) => res.send('MS Haydarov Bot ishlayapti ✅'));

  app.listen(PORT, async () => {
    await bot.telegram.setWebhook(WEBHOOK_URL + secretPath);
    console.log('✅ Server ' + PORT + '-portda ishga tushdi');
    console.log('✅ Webhook o\'rnatildi: ' + WEBHOOK_URL + secretPath);
  });
} else {
  // Lokal rejim — polling
  bot.launch().then(() => {
    console.log('✅ MS Haydarov bot polling rejimida ishga tushdi (lokal)');
  });
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
