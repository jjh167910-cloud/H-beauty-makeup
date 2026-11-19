/* The salon's inbox (/salon): its notifications only. A new customer message (no content comes with it: the server
 * sends none); a tap opens the inbox. Registered with scope /salon by src/lib/chat.ts, so the salon's subscription is
 * its own, apart from a customer's on the same phone (public/sw.js). It serves nothing: the inbox needs the network. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('حنانه بیوتی · پیام تازه', {
    body:'یک مشتری برای سالن پیام فرستاده است.', tag:'salon-chat', renotify:true, lang:'fa', dir:'rtl',
    icon:'/icons/icon-192.png', badge:'/icons/icon-192.png', data:{url:'/salon'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const open=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const inbox=open.find(c => new URL(c.url).pathname.startsWith('/salon'));
    if (inbox) return inbox.focus();
    return self.clients.openWindow('/salon');
  })());
});
