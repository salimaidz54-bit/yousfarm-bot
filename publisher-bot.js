/**
 * بوت النشر المستقل — YousFarm DZ
 * بوت منفصل لنشر المحتوى على فيسبوك وتيكتوك فقط.
 * أنشئ بوتاً جديداً عبر @BotFather وضع توكنه في PUB_BOT_TOKEN.
 *
 * التشغيل: node publisher-bot.js
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

// ==================== الإعدادات ====================
function parseAdminIds() {
  const raw = process.env.ADMIN_CHAT_IDS || process.env.ADMIN_CHAT_ID || '';
  return String(raw).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
}
const CONFIG = {
  BOT_TOKEN: process.env.PUB_BOT_TOKEN || '',
  ADMIN_IDS: parseAdminIds(),
  APP_NAME: process.env.APP_NAME || 'YousFarm',
  FB: {
    pageId: process.env.FB_PAGE_ID || '',
    token: process.env.FB_PAGE_TOKEN || '',
  },
  LANDING_URL: process.env.LANDING_URL || 'https://jolly-fudge-0463e0.netlify.app',
};

if (!CONFIG.BOT_TOKEN) {
  console.error('❌ PUB_BOT_TOKEN مفقود! أنشئ بوتاً جديداً في @BotFather وضعه في .env');
  process.exit(1);
}
if (!CONFIG.ADMIN_IDS.length) console.warn('⚠️ لا يوجد أدمن مضبوط!');

// سيرفر صحة لمنصات الاستضافة
if (process.env.PORT) {
  require('http').createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('YousFarm Publisher OK');
  }).listen(process.env.PORT, () => console.log(`🌐 Health on PORT=${process.env.PORT}`));
}

const bot = new Telegraf(CONFIG.BOT_TOKEN);
function isAdmin(ctx) {
  return CONFIG.ADMIN_IDS.includes(String(ctx.from?.id));
}

// ==================== فيسبوك ====================
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
    await ctx.reply('⚠️ فيسبوك غير مضبوط. أضف FB_PAGE_ID و FB_PAGE_TOKEN ثم أعد التشغيل.');
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
      res = /mp4|mov|avi|mkv/i.test(filename || '')
        ? await fbPublishVideo(buf, filename, caption)
        : await fbPublishPhoto(buf, filename, caption);
    }
    else res = await fbPublishText(caption);
    if (res && !res.error) {
      const link = fbPostUrl(res);
      console.log(`[FB] published ${kind} id=${res.post_id || res.id}`);
      const shareKb = link
        ? Markup.inlineKeyboard([[Markup.button.url('📤 مشاركة في المجموعات', 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link))]])
        : undefined;
      await ctx.reply(`✅ تم النشر على فيسبوك! 🎉${link ? '\n🔗 ' + link : ''}\n\n👥 للمجموعات: اضغط الزر واختر مجموعاتك.`, shareKb);
    } else {
      console.error('FB publish error:', JSON.stringify(res && res.error));
      await ctx.reply(`❌ فشل النشر: ${(res && res.error && res.error.message) || 'خطأ غير معروف'}\nجرّب /fbtest.`);
    }
  } catch (e) {
    console.error('FB publish exception:', e.message);
    await ctx.reply(`❌ تعذر النشر: ${e.message}`);
  } finally {
    try { await ctx.deleteMessage(wait.message_id); } catch {}
  }
}

// ==================== تيكتوك ====================
const TT_HASHTAGS = '#YousFarm #دواجن #الجزائر #مربي_الدواجن #مشاريع_صغيرة #تطبيق';
function tiktokCaption(base) {
  const core = (base && String(base).replace(/#تيكتوك/g, '').trim()) || `${CONFIG.APP_NAME} 🐔 — إدارة مبيعات الدواجن: فواتير، تقارير، طباعة حرارية. جرّب 4 أيام مجاناً!`;
  return `${core}\n\n📥 حمّل من هنا: ${CONFIG.LANDING_URL}\n\n${TT_HASHTAGS}`;
}
async function sendTiktokKit(ctx, baseCaption) {
  const cap = tiktokCaption(baseCaption);
  await ctx.reply(
    `🎵 *عدة النشر على تيكتوك*\n\nانسخ النص أدناه والصقه في تيكتوك:\n\n\`${cap}\`\n\n` +
    `الخطوات: زر الرفع أدناه ← اختر الفيديو ← الصق النص ← انشر ✅`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📤 فتح رفع تيكتوك', 'https://www.tiktok.com/upload')],
        [Markup.button.url('📥 صفحة التحميل', CONFIG.LANDING_URL)],
      ]),
    }
  );
}

// ==================== الأوامر ====================
bot.start(async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply(`👋 أهلاً بك في بوت نشر ${CONFIG.APP_NAME} — هذا البوت للإدارة فقط. للشراء تواصل عبر المتجر.`);
    return;
  }
  await ctx.reply(
    `👋 *بوت النشر — ${CONFIG.APP_NAME}*\n\n` +
    `📘 للنشر على فيسبوك: أرسل صورة/فيديو/نص مع *#نشر*\n` +
    `🎵 لعدة تيكتوك: أرسل أي شيء مع *#تيكتوك* أو الأمر /tt\n` +
    `👥 بعد كل نشر ستحصل على زر مشاركة في المجموعات\n\n` +
    `/fbtest - فحص اتصال فيسبوك\n/tt [نص] - عدة تيكتوك`,
    { parse_mode: 'Markdown' }
  );
});
bot.command('fbtest', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  if (!fbConfigured()) return ctx.reply('⚠️ أضف FB_PAGE_ID و FB_PAGE_TOKEN أولاً.');
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${CONFIG.FB.token}`);
    const j = await r.json();
    await ctx.reply(j.error ? `❌ التوكن مرفوض: ${j.error.message}` : `✅ متصل! الصفحة: ${j.name || ''} (ID: ${j.id})`);
  } catch (e) {
    await ctx.reply(`❌ تعذر الاتصال: ${e.message}`);
  }
});
bot.command('tt', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ للأدمن فقط.');
  await sendTiktokKit(ctx, ctx.message.text.split(/\s+/).slice(1).join(' '));
});
bot.command('id', async (ctx) => {
  await ctx.reply(`🆔 معرفك: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

function msgCaption(ctx) {
  return (ctx.message && (ctx.message.caption || ctx.message.text)) || '';
}
bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const cap = msgCaption(ctx);
  if (cap.includes('#نشر')) {
    const photos = ctx.message.photo;
    await handleFbPublish(ctx, 'photo', photos[photos.length - 1].file_id, 'photo.jpg', cap);
  } else if (cap.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, cap);
  } else {
    await ctx.reply('أرسل مع *#نشر* للفيسبوك أو *#تيكتوك* للعدة.', { parse_mode: 'Markdown' });
  }
});
bot.on('video', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const cap = msgCaption(ctx);
  if (cap.includes('#نشر')) {
    await handleFbPublish(ctx, 'video', ctx.message.video.file_id, 'video.mp4', cap);
  } else if (cap.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, cap);
  } else {
    await ctx.reply('أرسل مع *#نشر* للفيسبوك أو *#تيكتوك* للعدة.', { parse_mode: 'Markdown' });
  }
});
bot.on('document', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const cap = msgCaption(ctx);
  if (cap.includes('#نشر')) {
    const doc = ctx.message.document;
    await handleFbPublish(ctx, 'document', doc.file_id, doc.file_name || 'file', cap);
  } else if (cap.includes('#تيكتوك')) {
    await sendTiktokKit(ctx, cap);
  }
});
bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const txt = ctx.message.text || '';
  if (txt.startsWith('/')) return; // الأوامر لها معالجها
  if (txt.includes('#نشر')) await handleFbPublish(ctx, 'text', null, null, txt);
  else if (txt.includes('#تيكتوك')) await sendTiktokKit(ctx, txt);
});

bot.catch((err, ctx) => {
  console.error(`⚠️ خطأ [${ctx.updateType}]:`, err.message || err);
});

bot.launch()
  .then(async () => {
    try {
      const me = await bot.telegram.getMe();
      console.log(`✅ بوت النشر يعمل - @${me.username}`);
    } catch {
      console.log('✅ بوت النشر يعمل');
    }
    console.log(`🔧 عدد الأدمن: ${CONFIG.ADMIN_IDS.length} | فيسبوك: ${fbConfigured() ? 'مضبوط' : 'غير مضبوط'}`);
    console.log('🏷️ BUILD: publisher-1');
  })
  .catch((e) => {
    console.error('❌ فشل تشغيل بوت النشر:', e.message);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
