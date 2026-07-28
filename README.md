# MS Haydarov Bot

Majburiy obuna + referal tizimli Telegram bot (Telegraf + Express).
Tugmalar rangi va custom emoji **Bot API 9.4** imkoniyatlari orqali ishlaydi.

## 1. Botni sozlash

1. [@BotFather](https://t.me/BotFather) orqali bot yarating, tokenni oling.
2. Botni **ikkala kanalga ham admin** qilib qo'shing (a'zolikni tekshirish uchun shart):
   - `@Matematika_milliysertifikatim`
   - `@talimtalaba`
3. Maxsus yopiq guruh(lar) yarating va taklif havolasini oling (`https://t.me/+...`).
4. **Muhim:** tugmalarda custom emoji ko'rinishi uchun **bot egasining
   Telegram Premium obunasi** bo'lishi kerak (yoki bot Fragment orqali
   qo'shimcha username sotib olgan bo'lishi kerak). Aks holda tugmalar rangi
   ishlaydi, lekin custom emoji ko'rinmasligi mumkin.

## 2. GitHub'ga yuklash

```bash
cd ms-haydarov-bot
git init
git add .
git commit -m "MS Haydarov bot - boshlang'ich versiya"
git branch -M main
git remote add origin https://github.com/FOYDALANUVCHI_NOMI/REPO_NOMI.git
git push -u origin main
```

`node_modules` va `.env` `.gitignore` orqali yuklanmaydi — bu to'g'ri.

## 3. Render'ga deploy qilish

1. [render.com](https://render.com) da ro'yxatdan o'ting, GitHub akkauntingizni ulang.
2. **New + → Web Service** tanlang, repo'ni tanlang.
3. Sozlamalar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (boshlash uchun yetarli)
4. **Environment** bo'limida `.env.example` dagi barcha o'zgaruvchilarni qo'shing:
   - `BOT_TOKEN`
   - `CHANNEL_1`, `CHANNEL_2`
   - `CHANNEL_1_LINK`, `CHANNEL_2_LINK`
   - `EMOJI_BLUE_ID`, `EMOJI_GREEN_ID`, `EMOJI_RED_ID`
   - `REQUIRED_REFERRALS`
   - `GROUP_LINKS`
   - `WEBHOOK_URL` — **birinchi deploydan keyin** Render bergan URL manzilini shu yerga yozing (masalan `https://ms-haydarov-bot.onrender.com`), so'ng qayta deploy qiling.
5. **Create Web Service** bosing — Render avtomatik build va deploy qiladi.

## 4. Tekshirish

Deploy tugagach, botga `/start` yozing. Kanallarga obuna bo'lmagan bo'lsangiz,
ko'k, yashil va qizil rangdagi tugmalar bilan obuna talab qilinadi. Obuna
bo'lgach "Tasdiqlash" tugmasi orqali tekshiriladi va referal havolangiz beriladi.

## Muhim eslatmalar

- **Rangli tugma va custom emoji** Bot API 9.4 orqali ishlaydi (`style`:
  primary/success/danger, `icon_custom_emoji_id`). Custom emoji faqat bot
  egasida Telegram Premium bo'lsa to'liq ko'rinadi.
- **Ma'lumotlar saqlash:** `data/users.json` fayli Render'ning bepul tarifida
  **doimiy emas** — qayta deploy yoki uyqu holatidan chiqishda tozalanishi
  mumkin. Foydalanuvchilar sonini doimiy saqlash uchun:
  - Render Dashboard → **Disks** bo'limidan doimiy disk ulang, YOKI
  - Keyinchalik MongoDB Atlas (bepul) kabi haqiqiy bazaga o'tkazish tavsiya
    etiladi — aytsangiz shu qismini ham qo'shib beraman.
- Bot **kanallarga admin bo'lishi shart**, aks holda a'zolikni tekshira olmaydi.
- `GROUP_LINKS` ga bir nechta guruh havolasini vergul bilan qo'shsangiz, bot
  ulardan tasodifiy birini yuboradi (bitta havola bersangiz — doim o'shani).
- `/mystats` buyrug'i orqali foydalanuvchi o'z referal sonini ko'ra oladi.
