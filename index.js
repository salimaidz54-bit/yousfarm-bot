/**
 * بوت تيليجرام احترافي - متجر مصغّر لبيع وتفعيل وتحميل تطبيق YousFarm
 * مبني بمكتبة Telegraf (رسمية ومجانية 100% - Telegram Bot API)
 */

const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const path = require('path');

// ==================== إعدادات قابلة للتعديل ====================
const CONFIG = {
  // التوكن الذي يعطيك إياه @BotFather عند إنشاء البوت
  BOT_TOKEN: '8376194718:AAF9X7by8OoDm6iMqd6UX69_0cJZ7wWZ4dg',

  // الـ Chat ID الخاص بك (صاحب المتجر) — نفسه يُستعمل كمعرّف الأدمن المخوّل برفع التطبيق
  // احصل عليه بمراسلة @userinfobot في تيليجرام
  ADMIN_CHAT_ID: '6190616202',

  APP_NAME: 'YousFarm',

  PRICES: {
    yearly: '1900 دج / السنة',
    lifetime: '3900 دج (مدى الحياة - دفعة واحدة فقط)',
  },

  PAYMENT: {
    rip: '00799999004105004122',
    methods: 'CCP أو تطبيق BaridiMob',
  },
};
// =================================================================

const bot = new Telegraf(CONFIG.BOT_TOKEN);
bot.use(session());

// ==================== تخزين دائم بسيط (ملف JSON) ====================
// يحفظ ملف التطبيق المرفوع حتى لا يُفقد عند إعادة تشغيل البوت
const STORE_PATH = path.join(__dirname, 'store.json');

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (e) {
    return { appFileId: null, appFileName: null, appVersion: null, appSizeMb: null };
  }
}

function saveStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

let store = loadStore();
// =================================================================

// تهيئة الجلسة الافتراضية لكل مستخدم
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.state) ctx.session.state = 'menu';
  return next();
});

function isAdmin(ctx) {
  return String(ctx.from.id) === String(CONFIG.ADMIN_CHAT_ID);
}

// ==================== لوحات الأزرار ====================
function mainMenuKeyboard() {
  const rows = [
    [Markup.button.callback('ℹ️ عن التطبيق', 'about')],
    [Markup.button.callback('💰 الأسعار والاشتراكات', 'pricing')],
  ];
  if (store.appFileId) {
    rows.push([Markup.button.callback('📥 تحميل التطبيق', 'download')]);
  }
  rows.push([Markup.button.callback('💳 طريقة الدفع', 'payment')]);
  rows.push([Markup.button.callback('🛒 اشترك الآن (تفعيل كامل)', 'subscribe')]);
  rows.push([Markup.button.callback('📞 التحدث مع الدعم', 'support')]);
  return Markup.inlineKeyboard(rows);
}

function backKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')]]);
}

function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'main_menu')]]);
}

// ==================== نصوص الردود ====================
function welcomeText(name) {
  return (
    `👋 أهلاً بك ${name ? '*' + name + '*' : ''} في متجر *${CONFIG.APP_NAME}*\n\n` +
    `YousFarm DZ نظام متكامل لإدارة مبيعات الدواجن، مصمم للمربين والتجار في الجزائر 🐔\n\n` +
    `اختر من القائمة أدناه 👇`
  );
}

function aboutText() {
  return (
    `ℹ️ *عن ${CONFIG.APP_NAME}*\n\n` +
    `YousFarm DZ نظام متكامل لإدارة مبيعات الدواجن، مصمم للمربين والتجار في الجزائر.

• تسجيل فواتير البيع مع حساب تلقائي للأوزان والمبالغ
• إدارة الأقفاص وعدد الدجاج والوزن الصافي
• متابعة المدفوعات والمبالغ المتبقية
• تقارير وإحصائيات مفصلة (يومية/أسبوعية/شهرية)
• طباعة مباشرة على الطابعة الحرارية (58/80mm)
• إرسال الفواتير والتقارير فوراً عبر واتساب و SMS
• يعمل دون إنترنت — بياناتك محفوظة محلياً على جهازك

واجهة بسيطة بثلاث لغات: العربية، الفرنسية، الإنجليزية.
  );
}

function pricingText() {
  return (
    `💰 *أسعار اشتراك ${CONFIG.APP_NAME}*\n\n` +
    `📅 اشتراك سنة: *${CONFIG.PRICES.yearly}*\n` +
    `♾️ اشتراك مدى الحياة: *${CONFIG.PRICES.lifetime}*`
  );
}

function paymentText() {
  return (
    `💳 *طريقة الدفع*\n\n` +
    `الدفع متاح عبر: *${CONFIG.PAYMENT.methods}*\n\n` +
    `📌 الرقم البريدي (RIP):\n\`${CONFIG.PAYMENT.rip}\`\n\n` +
    `بعد التحويل، اضغط "🛒 اشترك الآن" من القائمة لإرسال معرّف جهازك وإثبات الدفع.`
  );
}

function downloadCaptionText() {
  return (
    `📦 *${CONFIG.APP_NAME}*${store.appVersion ? ' — الإصدار ' + store.appVersion : ''}\n\n` +
    `ثبّت الملف ثم افتح التطبيق للحصول على *معرّف الجهاز* الخاص بك.\n` +
    `بعد الدفع، اضغط "🛒 اشترك الآن" لتفعيل النسخة الكاملة.`
  );
}

function noAppYetText() {
  return `⚠️ التطبيق غير متوفر للتحميل حالياً، يرجى التواصل مع الدعم.`;
}

function askDeviceIdText() {
  return (
    `🆔 من فضلك أرسل *معرّف الجهاز* الخاص بك.\n\n` +
    `تجده داخل التطبيق في شاشة التفعيل (يبدأ بـ \`YF-\`) — انسخه والصقه هنا.`
  );
}

function invalidDeviceIdText() {
  return (
    `⚠️ هذا لا يبدو معرّف جهاز صحيح.\n\n` +
    `تأكد أنه منسوخ من شاشة التفعيل داخل التطبيق (يبدأ بـ \`YF-\`) ثم أرسله من جديد.`
  );
}

function askProofText() {
  return (
    `✅ تم استلام معرّف الجهاز.\n\n` +
    `📸 الآن أرسل *صورة إثبات الدفع* (وصل CCP أو لقطة شاشة BaridiMob).`
  );
}

function proofReceivedText() {
  return (
    `✅ تم استلام إثبات الدفع ومعرّف الجهاز بنجاح.\n` +
    `سيقوم فريقنا بالتحقق وإرسال مفتاح الترخيص الخاص بجهازك خلال وقت قصير.\n\n` +
    `شكراً لثقتك بـ ${CONFIG.APP_NAME} 🙏`
  );
}

function supportRequestedText() {
  return `📞 تم إرسال طلبك إلى فريق الدعم، سيتواصل معك أحد ممثلينا قريباً.`;
}

// ==================== أدوات مساعدة ====================
function customerLabel(ctx) {
  const u = ctx.from;
  const uname = u.username ? '@' + u.username : '(بدون معرف مستخدم)';
  return `${u.first_name || ''} ${u.last_name || ''} — ${uname} — ID: ${u.id}`;
}

async function notifyAdmin(text) {
  if (!CONFIG.ADMIN_CHAT_ID || CONFIG.ADMIN_CHAT_ID.includes('ضع')) return;
  try {
    await bot.telegram.sendMessage(CONFIG.ADMIN_CHAT_ID, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('فشل إرسال إشعار للأدمن:', e.message);
  }
}

// ==================== أوامر البوت (للزبائن) ====================
bot.start(async (ctx) => {
  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
  await ctx.replyWithMarkdown(welcomeText(ctx.from.first_name), mainMenuKeyboard());
});

bot.command('menu', async (ctx) => {
  ctx.session.state = 'menu';
  await ctx.replyWithMarkdown(welcomeText(), mainMenuKeyboard());
});

// ==================== أوامر خاصة بالأدمن فقط: إدارة ملف التطبيق ====================
bot.command('setapp', async (ctx) => {
  if (!isAdmin(ctx)) return; // يتجاهل الأمر تماماً لغير الأدمن
  ctx.session.state = 'awaiting_app_upload';
  await ctx.reply(
    '📦 أرسل الآن ملف التطبيق (APK) كـ "ملف/Document".\n' +
      'يمكنك إضافة رقم الإصدار في التعليق (Caption) مثال: 4.2'
  );
});

bot.command('appinfo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (!store.appFileId) {
    await ctx.reply('لا يوجد ملف تطبيق مرفوع حالياً. استعمل /setapp لرفعه.');
    return;
  }
  await ctx.reply(
    `📦 الملف الحالي:\n` +
      `الاسم: ${store.appFileName || 'غير معروف'}\n` +
      `الإصدار: ${store.appVersion || 'غير محدد'}\n` +
      `الحجم: ${store.appSizeMb ? store.appSizeMb + ' MB' : 'غير معروف'}`
  );
});

// استقبال ملف APK من الأدمن (بعد /setapp)
bot.on('document', async (ctx, next) => {
  if (!isAdmin(ctx) || ctx.session.state !== 'awaiting_app_upload') return next();

  const doc = ctx.message.document;
  store = {
    appFileId: doc.file_id,
    appFileName: doc.file_name || 'app.apk',
    appVersion: ctx.message.caption ? ctx.message.caption.trim() : store.appVersion,
    appSizeMb: doc.file_size ? Math.round((doc.file_size / (1024 * 1024)) * 10) / 10 : null,
  };
  saveStore(store);
  ctx.session.state = 'menu';

  await ctx.reply(
    `✅ تم حفظ ملف التطبيق بنجاح.\n` +
      `الاسم: ${store.appFileName}\n` +
      `الإصدار: ${store.appVersion || 'غير محدد'}\n\n` +
      `أصبح زر "📥 تحميل التطبيق" ظاهراً الآن للزبائن.`
  );
});

// ==================== أزرار القائمة (للزبائن) ====================
bot.action('main_menu', async (ctx) => {
  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
  await ctx.answerCbQuery();
  await ctx.editMessageText(welcomeText(), { parse_mode: 'Markdown', ...mainMenuKeyboard() }).catch(() =>
    ctx.replyWithMarkdown(welcomeText(), mainMenuKeyboard())
  );
});

bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(aboutText(), { parse_mode: 'Markdown', ...backKeyboard() }).catch(() =>
    ctx.replyWithMarkdown(aboutText(), backKeyboard())
  );
});

bot.action('pricing', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(pricingText(), { parse_mode: 'Markdown', ...backKeyboard() }).catch(() =>
    ctx.replyWithMarkdown(pricingText(), backKeyboard())
  );
});

bot.action('payment', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(paymentText(), { parse_mode: 'Markdown', ...backKeyboard() }).catch(() =>
    ctx.replyWithMarkdown(paymentText(), backKeyboard())
  );
});

bot.action('download', async (ctx) => {
  await ctx.answerCbQuery();
  if (!store.appFileId) {
    await ctx.replyWithMarkdown(noAppYetText(), backKeyboard());
    return;
  }
  await ctx.replyWithDocument(store.appFileId, {
    caption: downloadCaptionText(),
    parse_mode: 'Markdown',
    ...backKeyboard(),
  });
});

bot.action('subscribe', async (ctx) => {
  ctx.session.state = 'awaiting_device_id';
  ctx.session.deviceId = null;
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(askDeviceIdText(), cancelKeyboard());
});

bot.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(supportRequestedText(), backKeyboard());
  await notifyAdmin(`📞 *طلب دعم جديد*\nمن: ${customerLabel(ctx)}`);
});

// ==================== استقبال معرّف الجهاز (نص) ====================
bot.on('text', async (ctx, next) => {
  if (ctx.session.state !== 'awaiting_device_id') return next();

  const trimmed = ctx.message.text.trim();
  const looksValid = /^YF-/i.test(trimmed) || trimmed.length >= 6;

  if (!looksValid) {
    await ctx.replyWithMarkdown(invalidDeviceIdText(), cancelKeyboard());
    return;
  }

  ctx.session.deviceId = trimmed;
  ctx.session.state = 'awaiting_proof';
  await ctx.replyWithMarkdown(askProofText(), cancelKeyboard());
});

// ==================== استقبال صورة إثبات الدفع ====================
bot.on('photo', async (ctx, next) => {
  if (ctx.session.state !== 'awaiting_proof') return next();

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id; // أعلى جودة

  await ctx.replyWithMarkdown(proofReceivedText(), backKeyboard());

  await bot.telegram
    .sendPhoto(CONFIG.ADMIN_CHAT_ID, fileId, {
      caption:
        `🔔 *إثبات دفع جديد*\n\n` +
        `👤 الزبون: ${customerLabel(ctx)}\n` +
        `🆔 معرّف الجهاز: \`${ctx.session.deviceId || 'غير متوفر'}\`\n\n` +
        `يرجى التحقق وإرسال مفتاح الترخيص.`,
      parse_mode: 'Markdown',
    })
    .catch((e) => console.error('فشل إرسال الإشعار للأدمن:', e.message));

  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
});

// ==================== أي رسالة أخرى غير مفهومة ====================
bot.on('text', async (ctx) => {
  await ctx.replyWithMarkdown(welcomeText(), mainMenuKeyboard());
});

bot.catch((err, ctx) => {
  console.error(`⚠️ خطأ أثناء معالجة تحديث ${ctx.updateType}:`, err);
});

bot
  .launch()
  .then(() => console.log('✅ بوت تيليجرام متصل ويعمل الآن بنجاح!'))
  .catch((e) => console.error('❌ فشل تشغيل البوت:', e.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
