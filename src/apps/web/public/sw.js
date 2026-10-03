// Browser push for alerts (PRD-003 US-003.6). The payload is the alert content (§5.4): symbols,
// headline, source, time, link. Nothing else is shown (C-003.1).
self.addEventListener('push', (event) => {
  let a = {};
  try {
    a = event.data ? event.data.json() : {};
  } catch (e) {
    a = {};
  }
  const symbols = (a.instruments || []).map((i) => i.display_symbol || i.isin).join(', ');
  const title = a.kind === 'correction' ? `Correction: ${a.headline || 'StockPanic alert'}` : `${symbols ? symbols + ': ' : ''}${a.headline || 'StockPanic alert'}`;
  const body = a.kind === 'correction' ? `The earlier alert was not about ${a.removed_isin || 'that company'}.` : a.source_name || '';
  event.waitUntil(self.registration.showNotification(title, { body, tag: a.alert_id || undefined, data: { url: a.url || '/' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url === url && 'focus' in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
