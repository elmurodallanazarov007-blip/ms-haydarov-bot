// ==========================================================
// MS Haydarov Bot — Majburiy obuna + Referal tizimi
// Bot API 9.4: tugma rangi (style) va custom emoji (icon_custom_emoji_id)
// Ma'lumotlar bazasi: MongoDB Atlas (doimiy saqlash, Render uxlab/qayta
// tirilganda yoki qayta deploy bo'lganda ham ma'lumotlar yo'qolmaydi)
// ==========================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const express = require('express');
const { MongoClient } = require('mongodb');

// Rasmlar shu papkadan olinadi: /rasmlar/<fayl_nomi>
// (loyihaning index.js bilan bir joyida "rasmlar" nomli papka yarating va
// rasmlarni shu nomlar bilan joylashtiring)
const IMAGES_DIR = path.join(__dirname, 'rasmlar');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rasm + HTML matn (caption) bilan xabar yuboradi. Agar rasm fayli
// topilmasa (hali qo'yilmagan bo'lsa), oddiy matnli xabar yuboradi —
// bot rasm yo'qligi sababli yiqilib qolmaydi. Tarmoqdagi vaqtinchalik
// xatoliklar (masalan "socket hang up") uchun bir necha marta qayta
// urinib ko'radi, faqat shundan keyin matnga o'tadi.
async function sendStyled(ctx, imageFileName, htmlCaption, extraOptions) {
  const imgPath = path.join(IMAGES_DIR, imageFileName);
  const opts = extraOptions || {};
  if (fs.existsSync(imgPath)) {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await ctx.replyWithPhoto(
          { source: fs.createReadStream(imgPath) },
          { caption: htmlCaption, parse_mode: 'HTML', ...opts }
        );
        return;
      } catch (e) {
        console.error(
          'Rasm yuborib bo\'lmadi (' + imageFileName + '), urinish ' +
          attempt + '/' + MAX_ATTEMPTS + ':', e.message
        );
        if (attempt < MAX_ATTEMPTS) {
          await delay(1000 * attempt); // 1s, keyin 2s kutib qayta urinadi
        }
        // oxirgi urinishdan keyin ham bo'lmasa, pastga tushib matn yuboriladi
      }
    }
  }
  await ctx.replyWithHTML(htmlCaption, opts);
}

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

// Instagram sahifasi — MUHIM: Telegram Bot API orqali Instagram'dagi
// obunani (follow'ni) TEKSHIRISH IMKONI YO'Q. getChatMember faqat
// Telegram kanallari/guruhlari uchun ishlaydi, Instagram uchun bunday
// API yo'q. Shu sababli bu tugma foydalanuvchiga ko'rsatiladi va
// "majburiy" sifatida talab qilinadi, lekin bot buni avtomatik
// tasdiqlay olmaydi — foydalanuvchi "Tasdiqlash" bosganda faqat
// Telegram kanallari tekshiriladi.
const INSTAGRAM_LINK = process.env.INSTAGRAM_LINK ||
  'https://www.instagram.com/matematika_ms_?igsh=d2Q0czZscGprMXZ5';
const INSTAGRAM_LABEL = '📸 Instagram sahifamiz';
const INSTAGRAM_STYLE = 'danger'; // qizil (shaffof)
const INSTAGRAM_EMOJI_ID = process.env.EMOJI_INSTAGRAM_ID || '5226905513387631634';

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
// keepAlive + uzunroq timeout — ba'zi hostinglarda (masalan Render) rasm
// kabi kattaroq fayllarni yuborayotganda vaqti-vaqti bilan chiqadigan
// "socket hang up" xatoligini kamaytirish uchun.
const https = require('https');
const telegramAgent = new https.Agent({ keepAlive: true, timeout: 60000 });

const bot = new Telegraf(BOT_TOKEN, {
  telegram: { agent: telegramAgent },
  handlerTimeout: 90_000,
});

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
      text: INSTAGRAM_LABEL,
      url: INSTAGRAM_LINK,
      style: INSTAGRAM_STYLE,
      icon_custom_emoji_id: INSTAGRAM_EMOJI_ID,
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
    "Botdan foydalanish uchun quyidagi kanallarga va Instagram sahifamizga " +
    "obuna bo'ling, so'ng \"Tasdiqlash\" tugmasini bosing:"
  );
}

// Premium custom emojilar (foydalanuvchi tomonidan berilgan ID'lar).
// Bot API 9.4 talab qiladigan tarzda <tg-emoji emoji-id="..."> orqali
// HTML parse_mode bilan yuboriladi.
const REF_EMOJI = {
  party: '5461151367559141950',   // 🎉
  check: '5206607081334906820',   // ✅
  star: '5247133031235329609',    // 🌟
  rocket: '5145427681680032825',  // 🚀
  boom: '5406683434124859552',    // 💥
  target: '5364040533498932357',  // 🎯
  fire: '5224607267797606837',    // 🔥
  sparkles: '5325547803936572038',// ✨
  exclaim: '5447644880824181073', // ❗️
  down: '5406745015365943482',    // 👇
  paperclip: '5271604874419647061', // 📎
  people: '5319106456799158575',  // 👥
};

function tgEmoji(key, emoji) {
  const id = REF_EMOJI[key];
  return id ? '<tg-emoji emoji-id="' + id + '">' + emoji + '</tg-emoji>' : emoji;
}

// "Havolani olish" tugmasi — intro xabari ostida chiqadi, bosilganda
// referal havola xabari (statistika bilan) yuboriladi. style ko'rsatilmasa
// tugma shaffof (standart kulrang) bo'lib chiqadi.
const GET_LINK_BUTTON_TEXT = 'Havolani olish';
const GET_LINK_CALLBACK = 'get_ref_link';
const GET_LINK_EMOJI_ID = '5271604874419647061';

function buildGetLinkKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: GET_LINK_BUTTON_TEXT,
          callback_data: GET_LINK_CALLBACK,
          style: 'success',
          icon_custom_emoji_id: GET_LINK_EMOJI_ID,
        },
      ],
    ],
  };
}

async function sendReferralIntro(ctx, userId) {
  const introText =
    tgEmoji('party', '🎉') + ' Tabriklaymiz, obuna tasdiqlandi!\n\n' +
    tgEmoji('check', '✅') + " Matematikadan A+ olish uchun bepul tayyorlanish imkoniyati sizda!\n" +
    tgEmoji('star', '🌟') + " Har bir yangi do'st taklif qilsangiz — bonus ball beriladi!\n" +
    tgEmoji('rocket', '🚀') + ' Har bir taklif sizni sertifikatga yaqinlashtiradi!\n' +
    tgEmoji('boom', '💥') + " Do'stingiz botga kirib, kanallarga a'zo bo'lsa — +1 ball avto qo'shiladi!\n" +
    tgEmoji('target', '🎯') + ' ' + REQUIRED_REFERRALS + " ta matematik do'st taklif qilsangiz:\n" +
    tgEmoji('fire', '🔥') + " Bot sizga avtomatik tarzda Yopiq guruh havolasini beradi!\n" +
    tgEmoji('sparkles', '✨') + " Imkoniyatni qo'ldan boy bermang!";

  await sendStyled(ctx, 'referral-intro.jpg', introText, {
    reply_markup: buildGetLinkKeyboard(),
  });
}

async function sendReferralLinkInfo(ctx, userId) {
  const user = await getUser(userId);
  const me = await ctx.telegram.getMe();
  const refLink = 'https://t.me/' + me.username + '?start=' + userId;

  const linkText =
    tgEmoji('paperclip', '📎') + ' Sizning referal havolangiz:\n' + refLink;

  const statsText =
    tgEmoji('people', '👥') + ' Taklif qilingan do\'stlar: ' + user.invitedCount + '/' + REQUIRED_REFERRALS;

  const warnText =
    tgEmoji('exclaim', '⚠️') + " Muhim: ball olish uchun do'stingiz botga kirib, majburiy kanallarga a'zo bo'lishi kerak.";

  const ctaText =
    tgEmoji('down', '👇') + " Havolani do'stlaringizga hozir yuboring!";

  const infoText =
    linkText + '\n\n' +
    statsText + '\n\n' +
    warnText + '\n' +
    ctaText;

  await sendStyled(ctx, 'referal-havolangiz.jpg', infoText);
}

// Har bir qism alohida xabar sifatida yuboriladi (kelajakda har biriga
// alohida rasm biriktirish uchun ham shu tarzda qulay).
async function sendReferralInfo(ctx, userId) {
  await sendReferralIntro(ctx, userId);
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

bot.action(GET_LINK_CALLBACK, async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  try {
    await ctx.deleteMessage();
  } catch (e) {
    console.error("Intro xabarini o'chirib bo'lmadi:", e.message);
    // O'chirib bo'lmasa ham (masalan 48 soatdan o'tgan bo'lsa), davom etamiz
  }

  await sendReferralLinkInfo(ctx, userId);
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
