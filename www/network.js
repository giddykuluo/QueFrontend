(async function(){
  // ---------- CONFIG ----------
  const PREDICT_API_URL = 'https://qoeapi.onrender.com/predict';
  const PUSH_SERVER_URL = 'https://qoepushserver.onrender.com';

  const publicVapidKey =
    "BJgtmyqbQNvXqZHZM6mAHkWoPJ1_fa2niOl9F_3draoZp7rgCoWRA9TIhjExgsdtBkF5fuYfhPCI0QNuTt_w7gA";

  // ---------- HELPERS ----------
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  async function ensureNotifications() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const p = await Notification.requestPermission();
    return p === 'granted';
  }

  async function notify(title, body) {
    if (await ensureNotifications()) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.showNotification(title, { body: body });
      }
    }
  }

  // ---------- NETWORK TESTS ----------
  async function measureLatency(reps = 5) {
    const latencies = [];
    for (let i = 0; i < reps; i++) {
      const t0 = performance.now();
      try {
        await fetch(PREDICT_API_URL + '?throughput=1&delay=1&jitter=1&loss=0', { cache: 'no-store' });
        latencies.push(performance.now() - t0);
      } catch {
        latencies.push(9999);
      }
      await new Promise(r => setTimeout(r, 150));
    }
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const jitter = Math.sqrt(latencies.map(x => (x - avg) ** 2).reduce((a, b) => a + b, 0) / latencies.length);
    return { avgLatencyMs: avg, jitterMs: jitter };
  }

  async function measureThroughput() {
    if (navigator.connection && navigator.connection.downlink) {
      return { downloadMbps: navigator.connection.downlink };
    }
    return { downloadMbps: 5 }; // fallback
  }

  async function estimatePacketLoss(url, tries = 5) {
    let fails = 0;
    for (let i = 0; i < tries; i++) {
      try {
        const resp = await fetch(url, { cache: 'no-store', mode: 'no-cors' });
        if (!resp.ok) fails++;
      } catch {
        fails++;
      }
    }
    return (fails / tries) * 100;
  }

  // ---------- SUBSCRIBE TO PUSH ----------
  async function subscribeToPush() {
    const reg = await navigator.serviceWorker.ready;

    if ('serviceWorker' in navigator) {
  try {
    const reg = await navigator.serviceWorker.register('service-worker.js', {
      scope: './'
    });

    console.log('Service worker registered:', reg.scope);

    // Wait until the service worker is active
    await navigator.serviceWorker.ready;

    // Subscribe for push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
    });

    await fetch(PUSH_SERVER_URL + "/subscribe", {
      method: "POST",
      body: JSON.stringify(sub),
      headers: { "Content-Type": "application/json" }
    });

    console.log("Push subscription sent to server");
  } catch (err) {
    console.error("Push registration failed:", err);
  }
}
