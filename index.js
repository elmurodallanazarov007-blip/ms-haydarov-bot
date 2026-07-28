// ==========================================================
// MS Haydarov Bot — Majburiy obuna + Referal tizimi
// Bot API 9.4: tugma rangi (style) va custom emoji (icon_custom_emoji_id)
// Ma'lumotlar bazasi: MongoDB Atlas (doimiy saqlash, Render uxlab/qayta
// tirilganda yoki qayta deploy bo'lganda ham ma'lumotlar yo'qolmaydi)
// ==========================================================
require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const { MongoClient } = require('mongodb');
 
// ---------------------- SOZLAMALAR ----------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN .env faylida topilmadi!');
  process.exit(1);
}
 
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI .env faylida topilmadi! MongoDB Atlas connection string kerak.');
  process.exit(1);
}
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'ms_haydarov_bot';
 
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
 
// Maxsus yopiq guruh — bot shu guruhda ADMIN bo'lishi va "Invite users via
// link" huquqiga ega bo'lishi SHART. Bu yerga guruhning chat ID'si yoziladi
// (masalan -1001234567890), username emas — chunki bir martalik havola
// yaratish uchun aniq chat ID kerak.
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
 
// Webhook uchun (Render'da ishlatiladi)
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
 
// ---------------------- MA'LUMOTLAR BAZASI (MongoDB Atlas) ----------------------
let usersCollection = null;
 
async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);
  usersCollection = db.collection('users');
  // userId bo'yicha tez qidirish uchun index (allaqachon bo'lsa ham xato bermaydi)
  await usersCollection.createIndex({ userId: 1 }, { unique: true });
  console.log('✅ MongoDB Atlas ulandi (' + MONGODB_DB_NAME + ')');
}
 
// Foydalanuvchini bazadan olish, topilmasa yangisini yaratish
async function getUser(userId) {
  const id = String(userId);
  let user = await usersCollection.findOne({ userId: id });
  if (!user) {
    user = {
      userId: id,
      invitedBy: null,
      invitedCount: 0,
      verified: false,
      groupLinkSent: false,
      joinedAt: new Date().toISOString(),
    };
    await usersCollection.insertOne(user);
  }
  return user;
}
 
// Foydalanuvchi obyektini bazaga yozish (upsert)
async function saveUser(user) {
  const { _id, ...rest } = user; // _id ni o'zgartirmaslik uchun ajratamiz
  await usersCollection.updateOne(
    { userId: user.userId },
    { $set: rest },
    { upsert: true }
  );
}
 
// Har bir foydalanuvchi uchun bir martalik (faqat 1 kishi kira oladigan)
// yopiq guruh havolasi yaratadi. Bot guruhda admin bo'lishi shart.
async function createOneTimeGroupLink(ctx, userId) {
  if (!GROUP_CHAT_ID) {
    console.error('❌ GROUP_CHAT_ID .env faylida sozlanmagan!');
    return null;
  }
  try {
    const invite = await ctx.telegram.createChatInviteLink(GROUP_CHAT_ID, {
      member_limit: 1,
      name: 'referral-' + userId,
    });
    return invite.invite_link;
  } catch (e) {
    console.error("Bir martalik havola yaratib bo'lmadi:", e.message);
    return null;
  }
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
 
async function sendReferralInfo(ctx, userId) {
  const user = await getUser(userId);
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
 
async function creditReferrerIfNeeded(ctx, user, userId) {
  if (!user.invitedBy) return;
  const referrer = await getUser(user.invitedBy);
  referrer.invitedCount += 1;
  await saveUser(referrer);
 
  try {
    await ctx.telegram.sendMessage(
      user.invitedBy,
      "🎉 Sizning havolangiz orqali yangi foydalanuvchi qo'shildi!\n" +
      'Jami taklif qilinganlar: ' + referrer.invitedCount + '/' + REQUIRED_REFERRALS
    );
 
    if (referrer.invitedCount >= REQUIRED_REFERRALS && !referrer.groupLinkSent) {
      const link = await createOneTimeGroupLink(ctx, user.invitedBy);
      if (link) {
        referrer.groupLinkSent = true;
        await saveUser(referrer);
        await ctx.telegram.sendMessage(
          user.invitedBy,
          '🎉 Tabriklaymiz! Siz ' + REQUIRED_REFERRALS + " ta do'stingizni taklif qildingiz.\n\n" +
          "👉 Maxsus yopiq guruhga qo'shilish uchun shaxsan sizga mo'ljallangan " +
          "bir martalik havola:\n" + link + "\n\n" +
          "⚠️ Bu havola faqat 1 marta va faqat siz uchun ishlaydi."
        );
      } else {
        await ctx.telegram.sendMessage(
          user.invitedBy,
          '🎉 Tabriklaymiz! Siz ' + REQUIRED_REFERRALS + " ta do'stingizni taklif qildingiz, " +
          "lekin guruh havolasini yaratishda texnik xatolik yuz berdi. Administrator bilan bog'laning."
        );
      }
    }
  } catch (e) {
    console.error("Referrerga xabar yuborib bo'lmadi:", e.message);
  }
}
 
// ---------------------- HANDLERLAR ----------------------
 
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);
 
  // Referal parametrini o'qish: /start <referrerId>
  const payload = ctx.startPayload;
  if (payload && /^\d+$/.test(payload)) {
    const referrerId = payload;
    if (referrerId !== String(userId) && !user.invitedBy) {
      user.invitedBy = referrerId;
    }
  }
  await saveUser(user);
 
  const subscribed = await isSubscribedToAll(ctx, userId);
  if (!subscribed) {
    await ctx.reply(subscribeMessageText(), {
      reply_markup: buildSubscribeKeyboard(),
    });
    return;
  }
 
  const firstTime = !user.verified;
  user.verified = true;
  await saveUser(user);
 
  if (firstTime) {
    await creditReferrerIfNeeded(ctx, user, userId);
  }
  await sendReferralInfo(ctx, userId);
});
 
bot.action('check_sub', async (ctx) => {
  const userId = ctx.from.id;
  const user = await getUser(userId);
 
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
  await saveUser(user);
 
  if (firstTimeConfirm) {
    await creditReferrerIfNeeded(ctx, user, userId);
  }
 
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch (e) {
    // e'tiborsiz qoldiramiz
  }
 
  await sendReferralInfo(ctx, userId);
});
 
bot.command('mystats', async (ctx) => {
  const user = await getUser(ctx.from.id);
  await ctx.reply(
    '📊 Statistikangiz:\n' +
    "Taklif qilinganlar: " + user.invitedCount + '/' + REQUIRED_REFERRALS
  );
});
 
bot.catch((err, ctx) => {
  console.error('Xatolik yuz berdi (update ' + ctx.updateType + '):', err);
});
 
// ---------------------- ISHGA TUSHIRISH ----------------------
async function main() {
  await connectDB();
 
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
    await bot.launch();
    console.log('✅ MS Haydarov bot polling rejimida ishga tushdi (lokal)');
  }
}
 
main().catch((e) => {
  console.error('❌ Botni ishga tushirishda xatolik:', e.message);
  process.exit(1);
});
 
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
