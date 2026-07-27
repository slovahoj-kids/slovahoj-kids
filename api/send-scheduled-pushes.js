// api/send-scheduled-pushes.js
// Triggered once a day by Vercel Cron (see vercel.json). For every parent
// who enabled reminders, checks whether TODAY is one of their chosen
// lesson days and — if we haven't already sent one today — sends a real
// push notification (arrives even if the site isn't open), reminding them
// of the time they picked.
//
// NOTE ON TIMING: Vercel's free "Hobby" plan only allows cron jobs to run
// about once a day, not at an arbitrary exact minute per user. So instead
// of trying to fire precisely at each family's chosen time (which would
// need a much more frequent cron, only available on paid Vercel plans),
// this sends one daily reminder (whenever the cron happens to run) whose
// TEXT mentions their chosen time — e.g. "Не забудь позайматися сьогодні о
// 18:00!". If this project moves to Vercel Pro later, the cron schedule in
// vercel.json can be tightened (e.g. every 15 minutes) and this function
// can be changed to only fire within a few minutes of each family's exact
// chosen time.

import webpush from 'web-push';

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.result) return null;
  try {
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return data.result;
  }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export default async function handler(request, response) {
  // Vercel Cron requests are GET by default; allow that, but also allow a
  // manual POST trigger for testing.
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return response.status(500).json({ error: 'VAPID keys not configured.' });
  }

  webpush.setVapidDetails('mailto:slovahoj.kids@gmail.com', vapidPublic, vapidPrivate);

  const emails = (await kvGet('push_subscribers_list')) || [];
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay(); // 1=Mon..7=Sun, matches the UI's day buttons
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let sent = 0;
  let skipped = 0;
  let removed = 0;

  for (const email of emails) {
    const record = await kvGet(`push:${email}`);
    if (!record || !record.subscription) continue;

    const schedule = record.schedule || { days: [], time: '' };
    const isScheduledToday = Array.isArray(schedule.days) && schedule.days.includes(todayDow);
    const alreadySentToday = record.lastSentDate === todayStr;

    if (!isScheduledToday || alreadySentToday) {
      skipped++;
      continue;
    }

    const timeText = schedule.time ? ` о ${schedule.time}` : '';
    const payload = JSON.stringify({
      title: 'SlovAhoj Kids — Оксана чекає! 🐾',
      body: `Не забудь позайматися словацькою сьогодні${timeText}!`,
      url: '/',
    });

    try {
      await webpush.sendNotification(record.subscription, payload);
      await kvSet(`push:${email}`, { ...record, lastSentDate: todayStr });
      sent++;
    } catch (e) {
      // 404/410 means the browser subscription is gone (uninstalled, cache
      // cleared, etc) — no point keeping it around.
      if (e.statusCode === 404 || e.statusCode === 410) {
        await kvSet(`push:${email}`, { ...record, subscription: null, lastSentDate: record.lastSentDate });
        removed++;
      } else {
        console.error(`Failed to send push to ${email}:`, e.message || e);
      }
    }
  }

  return response.status(200).json({ sent, skipped, removed, totalSubscribers: emails.length });
}
