/**
 * بوت تيليجرام احترافي - متجر مصغّر لبيع وتفعيل وتحميل تطبيق YousFarm
 * نسخة محسّنة: أمان + تحقق صارم + تجربة مستخدم احترافية
 * مبني بـ Telegraf - Telegram Bot API
 */

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== إعدادات آمنة (من ملف .env) ====================
// أنشئ ملف .env بجانب index.js وضع فيه:
// BOT_TOKEN=837619... (من @BotFather)
// ADMIN_CHAT_ID=6190616202
// APP_NAME=YousFarm
function parseAdminIds() {
  const raw = process.env.ADMIN_CHAT_IDS || process.env.ADMIN_CHAT_ID || '';
  return String(raw).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
}
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '',
  ADMIN_IDS: parseAdminIds(),
  APP_NAME: process.env.APP_NAME || 'YousFarm',
  PRICES: {
    yearly: process.env.PRICE_YEARLY || '1900 دج / السنة',
    lifetime: process.env.PRICE_LIFETIME || '3900 دج (مدى الحياة)',
  },
  PAYMENT: {
    rip: process.env.PAYMENT_RIP || '00799999004105004122',
    methods: process.env.PAYMENT_METHODS || 'CCP أو تطبيق BaridiMob',
  },
  DISCOUNT: {
    amount: parseInt(process.env.DISCOUNT_AMOUNT || '500', 10),
    limit: parseInt(process.env.DISCOUNT_LIMIT || '50', 10),
    enabled: (process.env.DISCOUNT_ENABLED || 'true') === 'true',
  },
  FB: {
    pageId: process.env.FB_PAGE_ID || '',
    token: process.env.FB_PAGE_TOKEN || '',
  },
  LANDING_URL: process.env.LANDING_URL || 'https://yousfarm.netlify.app',
};

// ==================== توليد مفاتيح الترخيص (مطابق تماماً لكود التطبيق JS) ====================
// من index.html:
//   buildDeviceId -> 'YF-' + HASH[0:4] + '-' + HASH[4:8]  (مثال: YF-E473-1572)
//   generateLicenseKeyWith: combined = cleanDeviceId + 'YF2024SEC' + typeCode
//   key = YF24-<code>-<hash[0:4]>-<hash[4:8]>-<hash[8:12]>
// مهم: cleanDeviceId تُستخدم كما تظهر (مع YF- والشرطات) وبدون فواصل إضافية
const LICENSE_SECRET_JS = 'YF2024SEC';
const TYPE_CODES_JS = ['TR4', 'TR3', 'TR7', 'TR0', 'M', 'Y', 'F'];
function normalizeDeviceIdJS(input) {
  if (!input) return null;
  // نزيل شرطات Markdown المائلة ثم مسافات
  let s = String(input).trim().replace(/\\/g, '').replace(/\s+/g, '');
  if (!/^YF-[A-Z0-9]{4,}-[A-Z0-9-]{4,}$/i.test(s)) return null;
  return s.toUpperCase();
}
function generateLicenseKeyJS(deviceIdInput, typeCode = 'F') {
  if (!TYPE_CODES_JS.includes(typeCode)) throw new Error('Invalid typeCode ' + typeCode);
  const clean = normalizeDeviceIdJS(deviceIdInput);
  if (!clean) throw new Error('Invalid deviceId format (expected YF-XXXX-XXXX)');
  const combined = clean + LICENSE_SECRET_JS + typeCode;
  const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex').toUpperCase();
  return `YF24-${typeCode}-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

// تحقق إقلاعي
if (!CONFIG.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN مفقود! ضعه في ملف .env');
  process.exit(1);
}
if (!CONFIG.ADMIN_IDS.length) {
  console.warn('⚠️ ADMIN_CHAT_ID(S) غير مضبوط - لن تصل إشعارات الأدمن');
}

// سيرفر صغير لفحص الصحة (مطلوب لمنصات مثل Render التي تتوقع منفذ HTTP)
if (process.env.PORT) {
  require('http').createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('YousFarm Bot OK');
  }).listen(process.env.PORT, () => console.log(`🌐 Health server on PORT=${process.env.PORT}`));
}

const bot = new Telegraf(CONFIG.BOT_TOKEN);
bot.use(session());

// ==================== تخزين دائم آمن ====================
const STORE_PATH = path.join(__dirname, 'store.json');
const STORE_TMP_PATH = path.join(__dirname, 'store.json.tmp');

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { appFileId: null, appFileName: null, appVersion: null, appSizeMb: null, uploadedAt: null, uploadedBy: null, welcomeFileId: null, welcomeFileIds: [], downloadCount: 0, downloadUsers: [], discountUsed: 0, referrals: {} };
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) throw new Error('invalid store');
    return {
      appFileId: data.appFileId || null,
      appFileName: data.appFileName || null,
      appVersion: data.appVersion || null,
      appSizeMb: data.appSizeMb || null,
      uploadedAt: data.uploadedAt || null,
      uploadedBy: data.uploadedBy || null,
      welcomeFileId: data.welcomeFileId || null,
      welcomeFileIds: Array.isArray(data.welcomeFileIds) ? data.welcomeFileIds : (data.welcomeFileId ? [data.welcomeFileId] : []),
      downloadCount: typeof data.downloadCount === 'number' ? data.downloadCount : 0,
      downloadUsers: Array.isArray(data.downloadUsers) ? data.downloadUsers : [],
      discountUsed: typeof data.discountUsed === 'number' ? data.discountUsed : 0,
      referrals: (data.referrals && typeof data.referrals === 'object') ? data.referrals : {},
    };
  } catch (e) {
    console.error('⚠️ فشل تحميل store.json، سيتم إنشاء جديد:', e.message);
    return { appFileId: null, appFileName: null, appVersion: null, appSizeMb: null, uploadedAt: null, uploadedBy: null, welcomeFileId: null, welcomeFileIds: [], downloadCount: 0, downloadUsers: [], discountUsed: 0, referrals: {} };
  }
}

function saveStore(data) {
  try {
    const json = JSON.stringify(data, null, 2);
    // كتابة ذرية: اكتب لملف مؤقت ثم أعد تسميته
    fs.writeFileSync(STORE_TMP_PATH, json, 'utf8');
    fs.renameSync(STORE_TMP_PATH, STORE_PATH);
  } catch (e) {
    console.error('❌ فشل حفظ store.json:', e.message);
  }
}

let store = loadStore();

// ==================== أدوات مساعدة ====================
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function isAdmin(ctx) {
  return CONFIG.ADMIN_IDS.includes(String(ctx.from?.id));
}

// حماية سبام بسيطة: حد 10 رسائل / دقيقة لكل مستخدم
const rateMap = new Map();
function isRateLimited(userId) {
  const now = Date.now();
  const arr = rateMap.get(userId) || [];
  const recent = arr.filter(t => now - t < 60000);
  recent.push(now);
  rateMap.set(userId, recent);
  return recent.length > 10;
}

function customerLabel(ctx) {
  const u = ctx.from;
  const uname = u.username ? '@' + u.username : '(بدون معرف)';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'مجهول';
  return `${escapeMarkdown(name)} — ${escapeMarkdown(uname)} — ID: \`${u.id}\``;
}

// ==================== نظام الإحالة: 10 زبائن = مدى الحياة مجاناً ====================
function getReferralCode(userId) {
  return `REF_${String(userId)}`;
}
function ensureReferral(userId) {
  if (!store.referrals) store.referrals = {};
  if (!store.referrals[userId]) {
    store.referrals[userId] = { code: getReferralCode(userId), count: 0, referredBy: null, rewarded: false, referredUsers: [] };
  }
  return store.referrals[userId];
}
function getReferralLink(userId, botUsername) {
  const code = getReferralCode(userId);
  return `https://t.me/${botUsername}?start=${code}`;
}
function findReferrerByCode(code) {
  if (!code) return null;
  const m = String(code).match(/^REF_(\d+)$/);
  if (!m) return null;
  const referrerId = m[1];
  if (!store.referrals || !store.referrals[referrerId]) return null;
  return referrerId;
}

function customerLabelPlain(ctx) {
  const u = ctx.from || {};
  const uname = u.username ? '@' + u.username : '(بدون معرف)';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'مجهول';
  return `${name} — ${uname} — ID: ${u.id}`;
}

async function notifyOneAdmin(adminId, text, extra = {}) {
  try {
    await bot.telegram.sendMessage(adminId, text, { parse_mode: 'Markdown', ...extra });
    return true;
  } catch (e) {
    try {
      await bot.telegram.sendMessage(adminId, String(text).replace(/[*_`]/g, ''));
      return true;
    } catch (e2) {
      console.error(`فشل الإشعار للأدمن ${adminId}:`, e2.message);
      return false;
    }
  }
}
async function notifyAdmin(text, extra = {}) {
  if (!CONFIG.ADMIN_IDS.length) {
    console.error('notifyAdmin: لا يوجد أدمن مضبوط!');
    return false;
  }
  let ok = false;
  for (const id of CONFIG.ADMIN_IDS) {
    if (await notifyOneAdmin(id, text, extra)) ok = true;
  }
  if (!ok) console.error('تعذر إشعار أي أدمن. تأكد أن كل أدمن أرسل /start للبوت.');
  return ok;
}

// ==================== النشر على فيسبوك (مجاني عبر Graph API) ====================
function fbConfigured() {
  return !!(CONFIG.FB.pageId && CONFIG.FB.token);
}
async function tgDownloadBuffer(fileId) {
  const f = await bot.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${CONFIG.BOT_TOKEN}/${f.file_path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('TG download ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function fbPublishText(message) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${CONFIG.FB.pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: CONFIG.FB.token }),
  });
  return r.json();
}
async function fbPublishPhoto(buffer, filename, caption) {
  const fd = new FormData();
  fd.append('source', new Blob([buffer]), filename || 'photo.jpg');
  fd.append('caption', caption || '');
  fd.append('access_token', CONFIG.FB.token);
  const r = await fetch(`https://graph.facebook.com/v21.0/${CONFIG.FB.pageId}/photos`, { method: 'POST', body: fd });
  return r.json();
}
async function fbPublishVideo(buffer, filename, description) {
  const fd = new FormData();
  fd.append('source', new Blob([buffer]), filename || 'video.mp4');
  fd.append('description', description || '');
  fd.append('access_token', CONFIG.FB.token);
  const r = await fetch(`https://graph.facebook.com/v21.0/${CONFIG.FB.pageId}/videos`, { method: 'POST', body: fd });
  return r.json();
}
function fbPostUrl(result) {
  if (result && result.post_id) return `https://www.facebook.com/${result.post_id}`;
  if (result && result.id) return `https://www.facebook.com/${result.id}`;
  return null;
}
async function handleFbPublish(ctx, kind, fileId, filename, rawCaption) {
  if (!fbConfigured()) {
    await ctx.reply('⚠️ النشر على فيسبوك غير مضبوط. أضف FB_PAGE_ID و FB_PAGE_TOKEN في .env ثم أعد التشغيل. (/fbtest للفحص)');
    return;
  }
  const caption = String(rawCaption || '').replace(/#نشر/g, '').trim() || `${CONFIG.APP_NAME} 🐔\n${CONFIG.LANDING_URL}`;
  const wait = await ctx.reply('⏳ جاري النشر على صفحة فيسبوك...');
  try {
    let res;
    if (kind === 'photo') res = await fbPublishPhoto(await tgDownloadBuffer(fileId), filename, caption);
    else if (kind === 'video') res = await fbPublishVideo(await tgDownloadBuffer(fileId), filename, caption);
    else if (kind === 'document') {
      const buf = await tgDownloadBuffer(fileId);
      const isVideo = /mp4|mov|avi|mkv/i.test(filename || '');
      res = isVideo ? await fbPublishVideo(buf, filename, caption) : await fbPublishPhoto(buf, filename, caption);
    }
    else res = await fbPublishText(caption);
    if (res && !res.error) {
      const link = fbPostUrl(res);
      console.log(`[FB] published ${kind} id=${res.post_id || res.id}`);
      // مشاركة المنشور في المجموعات يدوياً بنقرة (النشر المباشر في المجموعات موقوف من Meta)
      const shareKb = link
        ? Markup.inlineKeyboard([[Markup.button.url('📤 مشاركة في المجموعات', 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link))]])
        : undefined;
      await ctx.reply(`✅ تم النشر على فيسبوك! 🎉${link ? '\n🔗 ' + link : ''}\n\n👥 للمجموعات: اضغط الزر أدناه واختر مجموعاتك (مربي الدواجن، السوق...).`, shareKb);
    } else {
      console.error('FB publish error:', JSON.stringify(res && res.error));
      await ctx.reply(`❌ فشل النشر: ${(res && res.error && res.error.message) || 'خطأ غير معروف'}\nجرّب /fbtest لفحص التوكن.`);
    }
  } catch (e) {
    console.error('FB publish exception:', e.message);
    await ctx.reply(`❌ تعذر النشر: ${e.message}`);
  } finally {
    try { await ctx.deleteMessage(wait.message_id); } catch {}
  }
}

// ==================== عدة تيكتوك (تجهيز بنقرة واحدة) ====================
const TT_HASHTAGS = '#YousFarm #دواجن #الجزائر #مربي_الدواجن #مشاريع_صغيرة #تطبيق';
function tiktokCaption(base) {
  const core = (base && String(base).replace(/#تيكتوك/g, '').trim()) || `${CONFIG.APP_NAME} 🐔 — إدارة مبيعات الدواجن: فواتير، تقارير، طباعة حرارية. جرّب 4 أيام مجاناً!`;
  return `${core}\n\n📥 حمّل من هنا: ${CONFIG.LANDING_URL}\n\n${TT_HASHTAGS}`;
}
async function sendTiktokKit(ctx, baseCaption) {
  const cap = tiktokCaption(baseCaption);
  await ctx.reply(
    `🎵 *عدة النشر على تيكتوك*\n\nانسخ النص أدناه والصقه في تيكتوك:\n\n\`${cap}\`\n\n` +
    `الخطوات: افتح زر الرفع أدناه ← اختر الفيديو ← الصق النص ← انشر ✅`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📤 فتح رفع تيكتوك', 'https://www.tiktok.com/upload')],
        [Markup.button.url('📥 صفحة التحميل', CONFIG.LANDING_URL)],
      ]),
    }
  );
}

// إرسال رسالة لأي مستخدم عبر البوت مع fallback بدون تنسيق
async function sendToUser(userId, text) {
  try {
    await bot.telegram.sendMessage(userId, text, { parse_mode: 'Markdown' });
    return true;
  } catch (e) {
    console.error(`فشل الإرسال للمستخدم ${userId} (Markdown):`, e.message);
    try {
      await bot.telegram.sendMessage(userId, String(text).replace(/[*_`]/g, ''));
      return true;
    } catch (e2) {
      console.error(`فشل الإرسال للمستخدم ${userId} (نص عادي):`, e2.message);
      return false;
    }
  }
}

// تهيئة الجلسة
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.state) ctx.session.state = 'menu';
  if (isRateLimited(ctx.from.id)) {
    return ctx.reply('⏳ تمهل قليلاً، أنت ترسل بسرعة كبيرة.');
  }
  return next();
});

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
  rows.push([Markup.button.callback('🎁 رابط الإحالة (اجلب 10 = مجاني)', 'referral')]);
  rows.push([Markup.button.callback('📞 التحدث مع الدعم', 'support')]);
  return Markup.inlineKeyboard(rows);
}

function backKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')]]);
}
function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'main_menu')]]);
}

// ==================== نصوص ====================
function welcomeText(name) {
  const safeName = name ? escapeMarkdown(name) : '';
  let text = `👋 أهلاً بك ${safeName ? '*' + safeName + '*' : ''} في متجر *${escapeMarkdown(CONFIG.APP_NAME)}*\n\n` +
    `YousFarm DZ نظام متكامل لإدارة مبيعات الدواجن، مصمم للمربين والتجار في الجزائر 🐔\n\n`;

  // تذكير الفترة التجريبية
  text += `🎁 *جرّب مجاناً لمدة 4 أيام بدون مفتاح!* حمّل التطبيق وابدأ فوراً.\n\n`;

  // عرض الخصم المغري لأول 50
  if (CONFIG.DISCOUNT.enabled) {
    const used = store.discountUsed || 0;
    const remaining = Math.max(0, CONFIG.DISCOUNT.limit - used);
    if (remaining > 0) {
      const yearlyNum = parseInt(CONFIG.PRICES.yearly) || 1900;
      const lifeNum = parseInt(CONFIG.PRICES.lifetime) || 3900;
      const discYearly = yearlyNum - CONFIG.DISCOUNT.amount;
      const discLife = lifeNum - CONFIG.DISCOUNT.amount;
      text += `🔥 *عرض افتتاحي حصري!* 🔥\n` +
        `💸 خصم *${CONFIG.DISCOUNT.amount} دج* لأول *${CONFIG.DISCOUNT.limit}* مشترك فقط!\n` +
        `💰 السنة: ~${yearlyNum}~ → *${discYearly} دج*\n` +
        `♾️ مدى الحياة: ~${lifeNum}~ → *${discLife} دج*\n` +
        `⏳ تبقى *${remaining}* أماكن فقط — اغتنم الفرصة! 🎉\n\n`;
    } else {
      text += `⏰ انتهى عرض الـ ${CONFIG.DISCOUNT.amount} دج لأول ${CONFIG.DISCOUNT.limit} — تابعنا لعروض قادمة!\n\n`;
    }
  }

  // عرض الإحالة
  text += `🎁 *اجلب 10 زبائن واحصل على اشتراك مدى الحياة مجاناً!* اضغط 🎁 رابط الإحالة للحصول على رابطك الخاص.\n\n`;

  text += `اختر من القائمة أدناه 👇`;
  return text;
}

// إرسال الترحيب مع الصور المرفقة (إن وجدت)
async function sendWelcome(ctx, name) {
  const caption = welcomeText(name);
  const keyboard = mainMenuKeyboard();
  const ids = store.welcomeFileIds && store.welcomeFileIds.length ? store.welcomeFileIds : (store.welcomeFileId ? [store.welcomeFileId] : []);
  if (ids.length === 0) {
    return ctx.replyWithMarkdown(caption, keyboard);
  }
  if (ids.length === 1) {
    try {
      return await ctx.replyWithPhoto(ids[0], { caption, parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
      console.warn('فشل إرسال صورة الترحيب:', e.message);
      return ctx.replyWithMarkdown(caption, keyboard);
    }
  }
  // ألبوم صور (2-10 صور)
  try {
    const media = ids.map((fid, i) => ({
      type: 'photo',
      media: fid,
      ...(i === 0 ? { caption, parse_mode: 'Markdown' } : {}),
    }));
    await ctx.replyWithMediaGroup(media);
    return await ctx.reply('اختر من القائمة 👇', keyboard);
  } catch (e) {
    console.warn('فشل إرسال ألبوم الترحيب:', e.message);
    return ctx.replyWithMarkdown(caption, keyboard);
  }
}
function aboutText() {
  return `ℹ️ *عن ${escapeMarkdown(CONFIG.APP_NAME)}*\n\n` +
    `YousFarm DZ نظام متكامل لإدارة مبيعات الدواجن، مصمم للمربين والتجار في الجزائر.\n\n` +
    `• تسجيل فواتير البيع مع حساب تلقائي للأوزان والمبالغ\n` +
    `• إدارة الأقفاص وعدد الدجاج والوزن الصافي\n` +
    `• متابعة المدفوعات والمبالغ المتبقية\n` +
    `• تقارير وإحصائيات مفصلة (يومية/أسبوعية/شهرية)\n` +
    `• طباعة مباشرة على الطابعة الحرارية (58/80mm)\n` +
    `• إرسال الفواتير والتقارير فوراً عبر واتساب و SMS\n` +
    `• يعمل دون إنترنت — بياناتك محفوظة محلياً على جهازك\n\n` +
    `واجهة بثلاث لغات: العربية، الفرنسية، الإنجليزية.`;
}
function pricingText() {
  return `💰 *أسعار اشتراك ${escapeMarkdown(CONFIG.APP_NAME)}*\n\n` +
    `📅 اشتراك سنة: *${escapeMarkdown(CONFIG.PRICES.yearly)}*\n` +
    `♾️ اشتراك مدى الحياة: *${escapeMarkdown(CONFIG.PRICES.lifetime)}*`;
}
function paymentText() {
  return `💳 *طريقة الدفع*\n\n` +
    `الدفع متاح عبر: *${escapeMarkdown(CONFIG.PAYMENT.methods)}*\n\n` +
    `📌 الرقم البريدي (RIP):\n\`${CONFIG.PAYMENT.rip}\`\n\n` +
    `بعد التحويل، اضغط "🛒 اشترك الآن" لإرسال معرّف جهازك وإثبات الدفع.`;
}
function downloadCaptionText() {
  return `📦 *${escapeMarkdown(CONFIG.APP_NAME)}*${store.appVersion ? ' — الإصدار ' + escapeMarkdown(store.appVersion) : ''}\n\n` +
    `ثبّت الملف ثم افتح التطبيق للحصول على *معرّف الجهاز* الخاص بك.\n` +
    `بعد الدفع، اضغط "🛒 اشترك الآن" لتفعيل النسخة الكاملة.`;
}
function askDeviceIdText() {
  return `🆔 أرسل *معرّف الجهاز* الخاص بك.\n\n` +
    `تجده داخل التطبيق في شاشة التفعيل (يبدأ بـ \`YF-\`) — انسخه والصقه هنا.`;
}
function invalidDeviceIdText() {
  return `⚠️ معرّف غير صحيح.\n\n` +
    `يجب أن يبدأ بـ \`YF-\` ويتكون من أحرف وأرقام وشرطات. انسخه من شاشة التفعيل داخل التطبيق.`;
}
function askProofText() {
  return `✅ تم حفظ معرّف الجهاز.\n\n📸 الآن أرسل *صورة إثبات الدفع* (وصل CCP أو لقطة BaridiMob) كصورة، وليس كملف.`;
}
function proofReceivedText() {
  return `✅ تم الاستلام بنجاح.\nسيقوم فريقنا بالتحقق وإرسال مفتاح الترخيص خلال وقت قصير.\n\nشكراً لثقتك بـ ${escapeMarkdown(CONFIG.APP_NAME)} 🙏`;
}

// ==================== أوامر عامة ====================
bot.start(async (ctx) => {
  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
  const userId = String(ctx.from.id);
  // تأكد من وجود سجل إحالة للمستخدم
  ensureReferral(userId);
  // هل دخل عبر رابط إحالة؟ ctx.startPayload يحوي REF_XXXX
  const payload = ctx.startPayload ? String(ctx.startPayload).trim() : '';
  if (payload && payload.startsWith('REF_')) {
    const referrerId = findReferrerByCode(payload);
    const me = store.referrals[userId];
    if (referrerId && referrerId !== userId && !me.referredBy) {
      me.referredBy = referrerId;
      saveStore(store);
      console.log(`[REFERRAL] ${userId} referred by ${referrerId} via ${payload}`);
      try {
        await ctx.reply(`🎁 جئت عبر رابط صديق! سيحصل صديقك على نقطة عند اشتراكك.`, { parse_mode: 'Markdown' });
      } catch {}
      // إشعار للمُحيل أنه جلب زائر
      await sendToUser(referrerId, `👀 زائر جديد دخل عبر رابطك! عندما يشترك سيُحسب لك +1 نحو جائزة 10 زبائن = مدى الحياة مجاناً.`);
    }
  }
  saveStore(store);
  await sendWelcome(ctx, ctx.from.first_name);
});
bot.help(async (ctx) => {
  await ctx.replyWithMarkdown(
    `🆘 *مساعدة ${escapeMarkdown(CONFIG.APP_NAME)}*\n\n` +
    `/start - القائمة الرئيسية\n` +
    `/menu - القائمة الرئيسية\n` +
    `/referral - رابط الإحالة وعدد من جلبت\n` +
    `/cancel - إلغاء العملية الحالية`,
    backKeyboard()
  );
});
async function buildReferralMessage(userId) {
  ensureReferral(userId);
  const me = store.referrals[userId];
  const botUsername = ctxBotUsername() || 'YousFarmDZ_Store_bot';
  const link = getReferralLink(userId, botUsername);
  const count = me.count || 0;
  const need = Math.max(0, 10 - count);
  const rewarded = me.rewarded ? ' ✅ حصلت على الجائزة!' : '';
  let text = `🎁 *برنامج الإحالة — اجلب 10 = مدى الحياة مجاناً!*\n\n` +
    `🔗 رابطك الخاص:\n\`${link}\`\n\n` +
    `📊 جلبت: *${count}/10*${rewarded}\n`;
  if (need > 0) text += `⏳ تبقى *${need}* ليُفتح لك اشتراك مدى الحياة مجاناً!\n\n`;
  else if (!me.rewarded) text += `🎉 أكملت 10! بانتظار تأكيد الأدمن لمنحك الجائزة.\n\n`;
  text += `شارك رابطك مع المربين والتجار — كل من يشترك عبر رابطك يُحسب لك تلقائياً عند موافقة الأدمن.`;
  return { text, link };
}
let cachedBotUsername = null;
function ctxBotUsername() {
  return cachedBotUsername || (bot.botInfo ? bot.botInfo.username : null);
}
bot.command('referral', async (ctx) => {
  const userId = String(ctx.from.id);
  const { text, link } = await buildReferralMessage(userId);
  await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
    [Markup.button.url('📤 مشاركة رابطي', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('جرّب YousFarm DZ - إدارة مبيعات الدواجن 🐔')}`)],
    [Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')],
  ]));
});
bot.command('menu', async (ctx) => {
  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
  await sendWelcome(ctx, ctx.from.first_name);
});
bot.command('cancel', async (ctx) => {
  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
  ctx.session.pendingWelcomeIds = null;
  await ctx.replyWithMarkdown('❌ تم الإلغاء.', mainMenuKeyboard());
});

// ==================== أوامر الأدمن ====================
bot.command('setapp', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ هذا الأمر للأدمن فقط.');
  ctx.session.state = 'awaiting_app_upload';
  await ctx.reply(
    '📦 أرسل الآن ملف التطبيق (APK) كـ *ملف/Document*.\n' +
    '⚠️ يجب أن يكون الامتداد `.apk` والحجم أقل من 50MB.\n' +
    'يمكنك إضافة رقم الإصدار في التعليق (Caption) مثال: `5.0.3`',
    { parse_mode: 'Markdown' }
  );
});
bot.command('appinfo', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  if (!store.appFileId) return ctx.reply('لا يوجد ملف مرفوع حالياً. استعمل /setapp');
  await ctx.reply(
    `📦 الملف الحالي:\n` +
    `الاسم: ${store.appFileName}\n` +
    `الإصدار: ${store.appVersion || 'غير محدد'}\n` +
    `الحجم: ${store.appSizeMb ? store.appSizeMb + ' MB' : 'غير معروف'}\n` +
    `تاريخ الرفع: ${store.uploadedAt ? new Date(store.uploadedAt).toLocaleString('ar-DZ') : '-'}\n` +
    `بواسطة: ${store.uploadedBy || '-'}`
  );
});
bot.command('clearapp', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  store = { ...store, appFileId: null, appFileName: null, appVersion: null, appSizeMb: null, uploadedAt: null, uploadedBy: null };
  saveStore(store);
  await ctx.reply('🗑️ تم حذف ملف التطبيق. زر التحميل سيختفي للزبائن.');
});
bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const welcomeCount = (store.welcomeFileIds && store.welcomeFileIds.length) || (store.welcomeFileId ? 1 : 0);
  const dlTotal = store.downloadCount || 0;
  const dlUnique = store.downloadUsers ? store.downloadUsers.length : 0;
  const discUsed = store.discountUsed || 0;
  const discRem = CONFIG.DISCOUNT.enabled ? Math.max(0, CONFIG.DISCOUNT.limit - discUsed) : 0;
  await ctx.reply(
    `📊 *إحصائيات المتجر:*\n\n` +
    `📦 الملف: ${store.appFileId ? 'موجود' : 'غير موجود'}\n` +
    `🔢 الإصدار: ${store.appVersion || '-'}\n` +
    `🖼️ صور الترحيب: ${welcomeCount}\n` +
    `📥 التحميلات عبر البوت: *${dlTotal}* (مستخدمين: ${dlUnique})\n` +
    `🎁 خصم ${CONFIG.DISCOUNT.amount} دج: استفاد ${discUsed}/${CONFIG.DISCOUNT.limit} — تبقى ${discRem}\n` +
    `💡 للتحميلات عبر Aptoide: راجع لوحة Aptoide Connect → Statistics`,
    { parse_mode: 'Markdown' }
  );
});
bot.command('resetstats', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  store.downloadCount = 0;
  store.downloadUsers = [];
  saveStore(store);
  await ctx.reply('🔄 تم تصفير عدّاد التحميلات.');
});
bot.command('resetdiscount', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  store.discountUsed = 0;
  saveStore(store);
  await ctx.reply(`🔄 تم تصفير عدّاد الخصم — متاح الآن ${CONFIG.DISCOUNT.limit} أماكن من جديد.`);
});
bot.command('reward', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  const args = ctx.message.text.split(/\s+/);
  const targetId = args[1] ? String(args[1]).replace(/[^0-9]/g, '') : null;
  if (!targetId) return ctx.reply('استخدم: /reward <userId>\nمثال: /reward 6190616202');
  ensureReferral(targetId);
  store.referrals[targetId].rewarded = true;
  saveStore(store);
  await ctx.reply(`✅ تم تأكيد مكافأة المستخدم ${targetId} (10 إحالات = مدى الحياة).`);
  const okReward = await sendToUser(targetId, `🎉 تم تفعيل مكافأتك! 🎁\nحصلت على *اشتراك مدى الحياة مجاناً* لإحالتك 10 زبائن. تواصل مع الأدمن لاستلام مفتاحك إن لم يصلك بعد.`);
  if (!okReward) await ctx.reply(`⚠️ تعذر إبلاغ ${targetId} (ربما حظر البوت).`);
});
bot.command('referrals', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  const entries = Object.entries(store.referrals || {}).filter(([_, v]) => v.count > 0).sort((a,b)=>b[1].count - a[1].count).slice(0,20);
  if (entries.length === 0) return ctx.reply('لا توجد إحالات بعد.');
  let text = `🏆 *أفضل المحيلين:*\n\n`;
  entries.forEach(([uid, r], i) => {
    text += `${i+1}. \`${uid}\` — ${r.count}/10 ${r.rewarded ? '✅' : ''} — ${r.code}\n`;
  });
  await ctx.replyWithMarkdown(text);
});

// معرف المستخدم الحالي (يساعد الزبون والأدمن)
bot.command('id', async (ctx) => {
  await ctx.reply(`🆔 معرفك: \`${ctx.from.id}\`` + (ctx.from.username ? `\n👤 @${ctx.from.username}` : ''), { parse_mode: 'Markdown' });
});

// فحص اتصال الأدمن: يكشف سبب عدم وصول الإشعارات
bot.command('testadmin', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  const configured = CONFIG.ADMIN_IDS.length ? CONFIG.ADMIN_IDS.join(', ') : '(فارغ!)';
  await ctx.reply(`🔧 الأدمن المضبوطون: \`${configured}\`\n🆔 معرفك الحالي: \`${ctx.from.id}\`\nسأحاول إرسال رسالة اختبار الآن...`, { parse_mode: 'Markdown' });
  const ok = await notifyAdmin('✅ رسالة اختبار من البوت — الإشعارات تعمل!');
  await ctx.reply(ok ? '✅ وصلت رسالة الاختبار — الإشعارات سليمة.' : '❌ لم تصل! راجع سجلات السيرفر (Render Logs) لمعرفة السبب.');
});

// إرسال رسالة/مفتاح لأي زبون عبر البوت (يضمن الوصول حتى لو حظر الخاص)
bot.command('send', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  const parts = ctx.message.text.split(/\s+/);
  const targetId = parts[1] ? String(parts[1]).replace(/[^0-9]/g, '') : null;
  const msg = parts.slice(2).join(' ');
  if (!targetId || !msg) return ctx.reply('استخدم: /send <userId> <الرسالة>\nمثال:\n/send 8733033764 🔑 مفتاحك: YF24-F-XXXX-XXXX-XXXX');
  const ok = await sendToUser(targetId, msg);
  await ctx.reply(ok ? `✅ تم الإرسال إلى ${targetId}` : `❌ فشل الإرسال إلى ${targetId} — ربما حظر البوت أو لم يبدأه. راجع السجلات.`);
});
// فحص اتصال فيسبوك
bot.command('fbtest', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  if (!fbConfigured()) return ctx.reply('⚠️ أضف FB_PAGE_ID و FB_PAGE_TOKEN في .env (أو متغيرات Render) ثم أعد التشغيل.');
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${CONFIG.FB.token}`);
    const j = await r.json();
    if (j.error) {
      await ctx.reply(`❌ التوكن مرفوض: ${j.error.message}`);
    } else {
      await ctx.reply(`✅ متصل! الصفحة: ${j.name || ''} (ID: ${j.id})\nللنشر: أرسل صورة/فيديو/نص مع #نشر في التعليق.`);
    }
  } catch (e) {
    await ctx.reply(`❌ تعذر الاتصال بفيسبوك: ${e.message}`);
  }
});
// عدة تيكتوك
bot.command('tt', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  const base = ctx.message.text.split(/\s+/).slice(1).join(' ');
  await sendTiktokKit(ctx, base);
});
// توليد مفتاح يدوياً لأي معرف (بنفس خوارزمية التطبيق)
bot.command('genkey', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  const args = ctx.message.text.split(/\s+/);
  const rawId = args[1];
  const type = (args[2] || 'F').toUpperCase();
  if (!rawId) return ctx.reply('استخدم: /genkey <معرف الجهاز> [Y|F]\nمثال:\n/genkey YF-E473-1572 F\nY = سنة، F = مدى الحياة');
  try {
    const key = generateLicenseKeyJS(rawId, type);
    await ctx.replyWithMarkdown(`🔑 *المفتاح (${type === 'Y' ? 'سنة' : 'مدى الحياة'}):*\n\`${key}\`\nللجهاز: \`${rawId.toUpperCase()}\``);
  } catch (e) {
    await ctx.reply(`⚠️ فشل: ${e.message}`);
  }
});
// ===== إدارة صور الترحيب (احترافية) =====
bot.command('setwelcome', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  ctx.session.state = 'awaiting_welcome_photo';
  ctx.session.pendingWelcomeIds = [];
  await ctx.reply(
    '🖼️ أرسل الآن *صور الترحيب* (1 إلى 10 صور).\n' +
    'أرسل الصور واحدة تلو الأخرى، ثم اكتب /done للحفظ أو /cancel للإلغاء.\n' +
    '💡 نصيحة: أرسل لقطات شاشة للتطبيق + صورة للفاتورة المطبوعة.',
    { parse_mode: 'Markdown' }
  );
});
bot.command('done', async (ctx) => {
  if (!isAdmin(ctx) || ctx.session.state !== 'awaiting_welcome_photo') return;
  const ids = ctx.session.pendingWelcomeIds || [];
  if (ids.length === 0) return ctx.reply('⚠️ لم ترسل أي صورة. أرسل صورة أو اكتب /cancel');
  store.welcomeFileIds = ids;
  store.welcomeFileId = ids[0];
  saveStore(store);
  ctx.session.state = 'menu';
  ctx.session.pendingWelcomeIds = null;
  await ctx.reply(`✅ تم حفظ ${ids.length} صورة ترحيب. ستظهر الآن في /start`, { parse_mode: 'Markdown' });
  console.log(`[ADMIN] Welcome images set: ${ids.length} by ${ctx.from.id}`);
});
bot.command('clearwelcome', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  store.welcomeFileIds = [];
  store.welcomeFileId = null;
  saveStore(store);
  await ctx.reply('🗑️ تم حذف صور الترحيب. سيعود الترحيب نصاً فقط.');
});

// استقبال إثبات الدفع كمستند (الزبون أرسل الصورة كملف بدل صورة)
bot.on('document', async (ctx, next) => {
  if (ctx.session && ctx.session.state === 'awaiting_proof' && ctx.session.deviceId) {
    const doc = ctx.message.document;
    const mime = (doc.mime_type || '').toLowerCase();
    // نقبل الصور و PDF فقط كإثبات
    if (mime.startsWith('image/') || mime === 'application/pdf' || !mime) {
      console.log(`[FLOW] Proof document received from ${ctx.from.id}, device=${ctx.session.deviceId}, mime=${mime}`);
      await forwardProofToAdmin(ctx, doc.file_id, true);
      return;
    }
    await ctx.reply('⚠️ أرسل إثبات الدفع كـ *صورة* أو ملف PDF فقط.', { parse_mode: 'Markdown', ...cancelKeyboard() });
    return;
  }
  if (!isAdmin(ctx) || ctx.session.state !== 'awaiting_app_upload') return next();

  const doc = ctx.message.document;
  const fileName = doc.file_name || '';
  const mime = doc.mime_type || '';

  // تحقق صارم
  const isApk = fileName.toLowerCase().endsWith('.apk') || mime === 'application/vnd.android.package-archive';
  if (!isApk) {
    await ctx.reply('⚠️ الملف ليس APK. أرسل ملفاً ينتهي بـ `.apk` فقط.');
    return;
  }
  const maxBytes = 50 * 1024 * 1024;
  if (doc.file_size && doc.file_size > maxBytes) {
    await ctx.reply(`⚠️ حجم الملف كبير جداً (${(doc.file_size/1024/1024).toFixed(1)} MB). الحد 50MB عبر البوت. ارفع الملف لمكان خارجي وضع الرابط.`);
    return;
  }

  store = {
    ...store,
    appFileId: doc.file_id,
    appFileName: fileName || 'app.apk',
    appVersion: ctx.message.caption ? ctx.message.caption.trim().slice(0, 20) : store.appVersion,
    appSizeMb: doc.file_size ? Math.round((doc.file_size / (1024 * 1024)) * 10) / 10 : null,
    uploadedAt: new Date().toISOString(),
    uploadedBy: String(ctx.from.id),
  };
  saveStore(store);
  ctx.session.state = 'menu';
  await ctx.reply(
    `✅ تم حفظ ملف التطبيق بنجاح.\n` +
    `الاسم: ${store.appFileName}\n` +
    `الإصدار: ${store.appVersion || 'غير محدد'} | الحجم: ${store.appSizeMb} MB\n\n` +
    `أصبح زر "📥 تحميل التطبيق" ظاهراً الآن للزبائن.`
  );
  console.log(`[ADMIN] APK uploaded: ${store.appFileName} v${store.appVersion} by ${ctx.from.id}`);
});

// ==================== أزرار القائمة ====================
bot.action('main_menu', async (ctx) => {
  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
  ctx.session.pendingWelcomeIds = null;
  await ctx.answerCbQuery();
  // لا نحاول تعديل رسالة صورة - نرسل ترحيباً جديداً (يدعم الصور)
  try { await ctx.deleteMessage(); } catch {}
  await sendWelcome(ctx, ctx.from.first_name);
});
bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.editMessageText(aboutText(), { parse_mode: 'Markdown', ...backKeyboard() }); }
  catch { await ctx.replyWithMarkdown(aboutText(), backKeyboard()); }
});
bot.action('pricing', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.editMessageText(pricingText(), { parse_mode: 'Markdown', ...backKeyboard() }); }
  catch { await ctx.replyWithMarkdown(pricingText(), backKeyboard()); }
});
bot.action('payment', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.editMessageText(paymentText(), { parse_mode: 'Markdown', ...backKeyboard() }); }
  catch { await ctx.replyWithMarkdown(paymentText(), backKeyboard()); }
});
bot.action('download', async (ctx) => {
  await ctx.answerCbQuery();
  const landingUrl = CONFIG.LANDING_URL;
  try {
    if (store.appFileId) {
      // إرسال ملف APK مباشرة من البوت
      await ctx.replyWithDocument(store.appFileId, {
        caption:
          `📥 *${escapeMarkdown(store.appFileName || CONFIG.APP_NAME)}*\n` +
          (store.appVersion ? `النسخة: ${escapeMarkdown(String(store.appVersion))}\n` : '') +
          (store.appSizeMb ? `الحجم: ${store.appSizeMb} MB\n` : '') +
          `\nآمن وموقّع، وصفحتنا الرسمية:\n${landingUrl}`,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🌐 صفحة الهبوط', landingUrl)],
          [Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')],
        ]),
      });
      console.log(`[DOWNLOAD] #${store.downloadCount} by ${ctx.from.id} → APK مباشر`);
    } else {
      await ctx.reply(
        `📥 *حمّل تطبيق ${escapeMarkdown(CONFIG.APP_NAME)}*\n\n` +
        `من صفحتنا الرسمية:\n${landingUrl}\n\n` +
        `اضغط الزر أدناه للتحميل المباشر — حجم 4.95 MB، آمن وموقّع.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📥 تحميل مباشر', landingUrl)],
            [Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')],
          ]),
        }
      );
      console.log(`[DOWNLOAD] #${store.downloadCount} by ${ctx.from.id} → landing`);
    }
    // عدّاد التحميلات
    store.downloadCount = (store.downloadCount || 0) + 1;
    if (!store.downloadUsers) store.downloadUsers = [];
    const uid = String(ctx.from.id);
    if (!store.downloadUsers.includes(uid)) store.downloadUsers.push(uid);
    saveStore(store);
    if (store.downloadCount % 10 === 0) {
      await notifyAdmin(`📥 *إنجاز:* ${store.downloadCount} نقرة تحميل (مستخدمين: ${store.downloadUsers.length}) عبر البوت`, {});
    }
  } catch (e) {
    console.error('فشل إرسال التطبيق:', e.message);
    await ctx.reply('⚠️ تعذر إرسال الملف حالياً. حمّله من صفحتنا:\n' + landingUrl, backKeyboard());
  }
});
bot.action('subscribe', async (ctx) => {
  ctx.session.state = 'awaiting_device_id';
  ctx.session.deviceId = null;
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(askDeviceIdText(), cancelKeyboard());
});
bot.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.state = 'support_chat';
  await ctx.reply(
    '📞 *الدعم الفني*\n\nاكتب رسالتك الآن (نص أو صورة) وسأوصلها مباشرة لفريق الدعم.\nللخروج من المحادثة اضغط /cancel أو 🔙 القائمة الرئيسية.',
    { parse_mode: 'Markdown', ...cancelKeyboard() }
  );
});

// استقبال رسائل المحادثة مع الدعم (نص) وتمريرها للأدمن
bot.on('text', async (ctx, next) => {
  if (!ctx.session || ctx.session.state !== 'support_chat') return next();
  const msg = ctx.message.text.trim();
  if (!msg) return next();
  console.log(`[SUPPORT] msg from ${ctx.from.id}: ${msg.slice(0, 80)}`);
  const ok = await notifyAdmin(
    `📞 *رسالة دعم جديدة*\nمن: ${customerLabel(ctx)}\n\n💬 ${escapeMarkdown(msg.length > 1500 ? msg.slice(0, 1500) + '…' : msg)}\n\nللرد: \`/send ${ctx.from.id} نص الرد\``
  );
  if (ok) {
    await ctx.reply('✅ وصلت رسالتك للدعم، سيرد عليك قريباً. يمكنك إرسال المزيد أو /cancel للإنهاء.', cancelKeyboard());
  } else {
    await ctx.reply('⚠️ تعذر الإرسال حالياً. تواصل مباشرة عبر: https://t.me/YousFarmDZ_bot', cancelKeyboard());
  }
});
bot.action('referral', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const { text, link } = await buildReferralMessage(userId);
  await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
    [Markup.button.url('📤 مشاركة رابطي', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('جرّب YousFarm DZ - إدارة مبيعات الدواجن 🐔')}`)],
    [Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')],
  ]));
});

// ==================== استقبال معرّف الجهاز ====================
const DEVICE_ID_REGEX = /^YF-[A-Z0-9]{4,}-[A-Z0-9-]{4,}$/i; // يتماشى مع صيغة YF-XXXX-...

bot.on('text', async (ctx, next) => {
  if (ctx.session.state !== 'awaiting_device_id') return next();
  // نزيل شرطات Markdown المائلة (YF\-XXXX) ثم المسافات
  const trimmed = ctx.message.text.trim().replace(/\\/g, '').replace(/\s+/g, '');
  if (!DEVICE_ID_REGEX.test(trimmed)) {
    await ctx.replyWithMarkdown(invalidDeviceIdText(), cancelKeyboard());
    return;
  }
  ctx.session.deviceId = trimmed.toUpperCase();
  ctx.session.state = 'awaiting_proof';
  await ctx.replyWithMarkdown(askProofText(), cancelKeyboard());
  console.log(`[FLOW] DeviceID received: ${ctx.session.deviceId} from ${ctx.from.id}`);
});

// ==================== استقبال صور الترحيب (أدمن) ====================
bot.on('photo', async (ctx, next) => {
  if (!isAdmin(ctx) || ctx.session.state !== 'awaiting_welcome_photo') return next();
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  if (!ctx.session.pendingWelcomeIds) ctx.session.pendingWelcomeIds = [];
  if (ctx.session.pendingWelcomeIds.length >= 10) {
    await ctx.reply('⚠️ الحد الأقصى 10 صور. اكتب /done للحفظ.');
    return;
  }
  ctx.session.pendingWelcomeIds.push(fileId);
  await ctx.reply(`✅ تم استلام صورة ${ctx.session.pendingWelcomeIds.length}/10. أرسل المزيد أو اكتب /done للحفظ.`);
});

// ==================== إثبات الدفع (مشترك: صورة أو مستند) ====================
async function forwardProofToAdmin(ctx, fileId, isDocument) {
  const deviceId = ctx.session.deviceId;
  await ctx.replyWithMarkdown(proofReceivedText(), mainMenuKeyboard());

  // إشعار للأدمن مع أزرار سريعة
  // ملاحظة: داخل ` ` لا نهرب المحتوى حتى لا تظهر شرطات مائلة
  const adminCaption =
    `🔔 *إثبات دفع جديد*\n\n` +
    `👤 الزبون: ${customerLabel(ctx)}\n` +
    `🆔 معرّف الجهاز: \`${deviceId}\`\n` +
    `💰 السعر المتوقع: ${escapeMarkdown(CONFIG.PRICES.yearly)} / ${escapeMarkdown(CONFIG.PRICES.lifetime)}\n\n` +
    `للرد على الزبون: \`/send ${ctx.from.id} نص الرسالة\`\n\n` +
    `اختر إجراء:`;

  const adminKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ سنة (Y) — توليد تلقائي', `approve_${ctx.from.id}_${ctx.session.deviceId}_Y`), Markup.button.callback('♾️ مدى الحياة (F)', `approve_${ctx.from.id}_${ctx.session.deviceId}_F`)],
    [Markup.button.callback('❌ رفض', `reject_${ctx.from.id}`)],
  ]);

  const sendFn = isDocument
    ? (cap) => bot.telegram.sendDocument(CONFIG.ADMIN_IDS[0], fileId, { caption: cap, parse_mode: 'Markdown', ...adminKeyboard })
    : (cap) => bot.telegram.sendPhoto(CONFIG.ADMIN_IDS[0], fileId, { caption: cap, parse_mode: 'Markdown', ...adminKeyboard });
  try {
    await sendFn(adminCaption);
  } catch (e) {
    console.error('فشل إرسال إثبات للأدمن:', e.message);
    // fallback: نص فقط بدون تنسيق
    try {
      const plain = adminCaption.replace(/[*_`]/g, '');
      if (isDocument) {
        await bot.telegram.sendDocument(CONFIG.ADMIN_IDS[0], fileId, { caption: plain, ...adminKeyboard });
      } else {
        await bot.telegram.sendPhoto(CONFIG.ADMIN_IDS[0], fileId, { caption: plain, ...adminKeyboard });
      }
    } catch (e2) {
      console.error('فشل fallback الإثبات:', e2.message);
      await notifyAdmin(adminCaption, adminKeyboard);
    }
  }

  ctx.session.state = 'menu';
  ctx.session.deviceId = null;
}

// ==================== استقبال إثبات الدفع (صورة) ====================
bot.on('photo', async (ctx, next) => {
  if (ctx.session.state !== 'awaiting_proof') return next();
  if (!ctx.session.deviceId) {
    ctx.session.state = 'awaiting_device_id';
    await ctx.replyWithMarkdown(askDeviceIdText(), cancelKeyboard());
    return;
  }
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  console.log(`[FLOW] Proof photo received from ${ctx.from.id}, device=${ctx.session.deviceId}`);
  await forwardProofToAdmin(ctx, fileId, false);
});

// ==================== النشر بهاشتاغ (#نشر / #تيكتوك) ====================
function msgCaption(ctx) {
  return (ctx.message && (ctx.message.caption || ctx.message.text)) || '';
}
bot.on('photo', async (ctx, next) => {
  const cap = msgCaption(ctx);
  if (isAdmin(ctx) && cap.includes('#نشر')) {
    const photos = ctx.message.photo;
    await handleFbPublish(ctx, 'photo', photos[photos.length - 1].file_id, 'photo.jpg', cap);
    return;
  }
  if (isAdmin(ctx) && cap.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, cap);
    return;
  }
  return next();
});
bot.on('video', async (ctx, next) => {
  const cap = msgCaption(ctx);
  if (isAdmin(ctx) && cap.includes('#نشر')) {
    await handleFbPublish(ctx, 'video', ctx.message.video.file_id, 'video.mp4', cap);
    return;
  }
  if (isAdmin(ctx) && cap.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, cap);
    return;
  }
  return next();
});
bot.on('document', async (ctx, next) => {
  const cap = msgCaption(ctx);
  if (isAdmin(ctx) && cap.includes('#نشر') && !(ctx.session && ctx.session.state === 'awaiting_app_upload')) {
    const doc = ctx.message.document;
    await handleFbPublish(ctx, 'document', doc.file_id, doc.file_name || 'file', cap);
    return;
  }
  if (isAdmin(ctx) && cap.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, cap);
    return;
  }
  return next();
});

// صور المحادثة مع الدعم: تمريرها للأدمن
bot.on('photo', async (ctx, next) => {
  if (!ctx.session || ctx.session.state !== 'support_chat') return next();
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  console.log(`[SUPPORT] photo from ${ctx.from.id}`);
  const caption = `📞 *صورة من زبون*\nمن: ${customerLabel(ctx)}\n\nللرد: \`/send ${ctx.from.id} نص الرد\``;
  try {
    await bot.telegram.sendPhoto(CONFIG.ADMIN_CHAT_ID, fileId, { caption, parse_mode: 'Markdown' });
    await ctx.reply('✅ وصلت الصورة للدعم.', cancelKeyboard());
  } catch (e) {
    console.error('فشل تمرير صورة الدعم:', e.message);
    await ctx.reply('⚠️ تعذر الإرسال حالياً. حاول لاحقاً أو تواصل عبر: https://t.me/YousFarmDZ_bot', cancelKeyboard());
  }
});

// رفض الصور في حالات أخرى + تشخيص
bot.on('photo', async (ctx) => {
  console.log(`[DIAG] photo from ${ctx.from.id}, state=${ctx.session && ctx.session.state}, hasDevice=${!!(ctx.session && ctx.session.deviceId)}`);
  if (ctx.session.state === 'awaiting_device_id') {
    await ctx.reply('⚠️ أرسل معرّف الجهاز كـ *نص* أولاً، ثم الصورة.', { parse_mode: 'Markdown', ...cancelKeyboard() });
  } else if (ctx.session.state !== 'awaiting_proof') {
    await ctx.reply('⚠️ لم أفهم هذه الصورة. اضغط /start ثم 🛒 اشترك الآن واتبع الخطوات.', backKeyboard());
  }
});

// مستندات المحادثة مع الدعم: تمريرها للأدمن
bot.on('document', async (ctx, next) => {
  if (ctx.session && ctx.session.state === 'support_chat') {
    const doc = ctx.message.document;
    console.log(`[SUPPORT] document from ${ctx.from.id}, mime=${doc && doc.mime_type}`);
    const caption = `📞 *ملف من زبون*\nمن: ${customerLabel(ctx)}\n\nللرد: \`/send ${ctx.from.id} نص الرد\``;
    try {
      await bot.telegram.sendDocument(CONFIG.ADMIN_CHAT_ID, doc.file_id, { caption, parse_mode: 'Markdown' });
      await ctx.reply('✅ وصل الملف للدعم.', cancelKeyboard());
    } catch (e) {
      console.error('فشل تمرير ملف الدعم:', e.message);
      await ctx.reply('⚠️ تعذر الإرسال حالياً.', cancelKeyboard());
    }
    return;
  }
  return next();
});

// تشخيص: أي مستند لم تعالجه المعالجات السابقة
bot.on('document', async (ctx) => {
  console.log(`[DIAG] unhandled document from ${ctx.from.id}, state=${ctx.session && ctx.session.state}, mime=${ctx.message.document && ctx.message.document.mime_type}`);
});

// معالجة أزرار الأدمن للموافقة/الرفض
bot.action(/^approve_(\d+)_(YF-[A-Z0-9-]+)_([A-Za-z])$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ للأدمن فقط');
  const userId = ctx.match[1];
  const deviceId = ctx.match[2];
  const typeCode = ctx.match[3].toUpperCase();
  await ctx.answerCbQuery('تم التأكيد');
  // عدّاد الخصم لأول 50
  let discountNote = '';
  if (CONFIG.DISCOUNT.enabled && (store.discountUsed || 0) < CONFIG.DISCOUNT.limit) {
    store.discountUsed = (store.discountUsed || 0) + 1;
    saveStore(store);
    const rem = CONFIG.DISCOUNT.limit - store.discountUsed;
    discountNote = `\n🎁 استفاد من خصم ${CONFIG.DISCOUNT.amount} دج — تبقى ${rem} أماكن!`;
  }
  // نظام الإحالة: احسب للمُحيل
  let referralNote = '';
  try {
    const buyerRec = store.referrals[userId];
    const referrerId = buyerRec ? buyerRec.referredBy : null;
    if (referrerId && store.referrals[referrerId]) {
      const ref = store.referrals[referrerId];
      if (!ref.referredUsers) ref.referredUsers = [];
      if (!ref.referredUsers.includes(userId)) {
        ref.referredUsers.push(userId);
        ref.count = ref.referredUsers.length;
        saveStore(store);
        console.log(`[REFERRAL] ${referrerId} +1 => ${ref.count}/10 (from ${userId})`);
        if (ref.count === 10 && !ref.rewarded) {
          referralNote = `\n🎁 المُحيل ${referrerId} أكمل 10!`;
          await notifyAdmin(
            `🎉 *إنجاز إحالة!* 🎉\nالمستخدم \`${referrerId}\` أكمل *10 إحالات ناجحة*!\n` +
            `🎁 استحق *اشتراك مدى الحياة مجاناً* — يرجى إرسال المفتاح له.\n` +
            `رابطه: [${referrerId}](tg://user?id=${referrerId})\n` +
            `لتأكيد المنح: /reward ${referrerId}`,
            { parse_mode: 'Markdown' }
          );
          const okCongrats = await sendToUser(referrerId,
            `🎉 *مبروك!* أكملت *10 إحالات* بنجاح! 🎁\n` +
            `استحققت *اشتراك مدى الحياة مجاناً* — سيتواصل معك الأدمن قريباً لإرسال المفتاح. شكراً لجهودك! 🙏`);
          if (!okCongrats) await ctx.reply(`⚠️ تعذر إبلاغ المُحيل ${referrerId} (ربما حظر البوت).`);
        } else if (ref.count < 10) {
          await sendToUser(referrerId,
            `👏 إحالة جديدة! لديك الآن *${ref.count}/10* — تبقى *${10 - ref.count}* للحصول على مدى الحياة مجاناً! 🎁`);
        }
      }
    }
  } catch (e) { console.error('referral increment error', e.message); }
  // توليد المفتاح تلقائياً بنفس خوارزمية التطبيق (Y=سنة، F=مدى الحياة)
  let generatedKey = null;
  try {
    generatedKey = generateLicenseKeyJS(deviceId, typeCode);
    console.log(`[KEYGEN] ${typeCode} for ${deviceId} => ${generatedKey}`);
  } catch (e) {
    console.error('key generation failed:', e.message);
  }
  const typeName = typeCode === 'Y' ? 'سنة' : typeCode === 'F' ? 'مدى الحياة' : typeCode;
  const keyLine = generatedKey ? `\n🔑 المفتاح (${typeName}): \`${generatedKey}\`` : `\n⚠️ فشل التوليد التلقائي — أرسل المفتاح يدوياً: \`/send ${userId} المفتاح\``;
  await ctx.editMessageCaption(`✅ تمت الموافقة (${typeName}) — المستخدم ${userId}.${discountNote}${referralNote}${keyLine}`, { parse_mode: 'Markdown' });
  let userMsg;
  if (generatedKey) {
    userMsg = `✅ تم تأكيد الدفع! 🎉\n\n🔑 *مفتاحك الخاص (${typeName}):*\n\`${generatedKey}\`\n\nانسخه والصقه في التطبيق ← شاشة التفعيل ← *تفعيل*.`;
  } else {
    userMsg = '✅ تم تأكيد الدفع! سيصلك مفتاح الترخيص خلال دقائق من الأدمن. شكراً لثقتك 🙏';
  }
  if (discountNote) userMsg += `\n\n🎉 مبروك! استفدت من خصم ${CONFIG.DISCOUNT.amount} دج لأول ${CONFIG.DISCOUNT.limit} مشترك!`;
  const okUser = await sendToUser(userId, userMsg);
  if (!okUser) await ctx.reply(`⚠️ تعذر إبلاغ الزبون ${userId} (ربما حظر البوت). أرسل له المفتاح يدوياً.`);
});
bot.action(/reject_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ للأدمن فقط');
  const userId = ctx.match[1];
  await ctx.answerCbQuery('تم الرفض');
  await ctx.editMessageCaption(`❌ تم الرفض للمستخدم ${userId}.`, { parse_mode: 'Markdown' });
  const okUser = await sendToUser(userId, '❌ عذراً، لم يتم قبول إثبات الدفع. يرجى التأكد من وضوح الصورة والمحاولة مجدداً أو التواصل مع الدعم.');
  if (!okUser) await ctx.reply(`⚠️ تعذر إبلاغ الزبون ${userId} بالرفض (ربما حظر البوت).`);
});

// نص بهاشتاغ نشر (أدمن فقط) — قبل الرد الترحيبي
bot.on('text', async (ctx, next) => {
  const txt = (ctx.message && ctx.message.text) || '';
  if (isAdmin(ctx) && txt.includes('#نشر')) {
    await handleFbPublish(ctx, 'text', null, null, txt);
    return;
  }
  if (isAdmin(ctx) && txt.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, txt);
    return;
  }
  return next();
});

// أي نص غير متوقع
bot.on('text', async (ctx) => {
  if (ctx.session.state !== 'menu') return; // تم التعامل معه أعلاه
  await ctx.replyWithMarkdown(welcomeText(ctx.from.first_name), mainMenuKeyboard());
});

// تتبع الأخطاء
bot.catch((err, ctx) => {
  console.error(`⚠️ خطأ [${ctx.updateType}] من ${ctx.from?.id}:`, err);
  try { ctx.reply('⚠️ حدث خطأ غير متوقع، حاول مجدداً أو اضغط /start'); } catch {}
});

// تشغيل
bot.launch()
  .then(async () => {
    try {
      const me = await bot.telegram.getMe();
      cachedBotUsername = me.username;
      console.log(`✅ بوت تيليجرام يعمل الآن - ${CONFIG.APP_NAME} (@${cachedBotUsername})`);
    } catch {
      console.log('✅ بوت تيليجرام يعمل الآن - ' + CONFIG.APP_NAME);
    }
    if (CONFIG.ADMIN_IDS.length) {
      console.log(`🔧 عدد الأدمن: ${CONFIG.ADMIN_IDS.length}`);
    } else {
      console.error('❌ لا يوجد أدمن! الإشعارات لن تصل. أضف ADMIN_CHAT_ID(S) في .env أو متغيرات Render.');
    }
    console.log('🏷️ BUILD: multi-admin-1 (photo+document proof + diagnostics + multi-admin)');
  })
  .catch((e) => {
    console.error('❌ فشل تشغيل البوت:', e.message);
    if (e.message.includes('401')) console.error('→ تأكد من صحة BOT_TOKEN في .env');
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// التقاط أخطاء غير متوقعة
process.on('unhandledRejection', (e) => console.error('UnhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('UncaughtException:', e));
