// network.js (copy as-is, replace values below with your URLs if different)
(async function(){
  const PREDICT_API_URL = 'https://qoeapi.onrender.com/predict'; // your QoE API (Render)
  const PUSH_SERVER_URL = 'https://qoepushserver.onrender.com';   // your Push Server (Render)
  const publicVapidKey = 'BJgtmyqbQNvXqZHZM6mAHkWoPJ1_fa2niOl9F_3draoZp7rgCoWRA9TIhjExgsdtBkF5fuYfhPCI0QNuTt_w7gA'; // your VAPID public key

  // register service worker and subscribe for push
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('service-worker.js');
      console.log('Service worker registered:', reg.scope);

      // wait until service worker is active
      if (!reg.active) {
        await new Promise(resolve => {
          if (reg.installing) reg.installing.addEventListener('statechange', e => {
            if (e.target.state === 'activated') resolve();
          });
          if (reg.waiting) reg.waiting.addEventListener('statechange', e => {
            if (e.target.state === 'activated') resolve();
          });
        });
      }

      // subscribe for push notifications
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      // send subscription to push server
      await fetch(PUSH_SERVER_URL + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
      console.log('Push subscription sent to server ✅');
    } catch(e) {
      console.warn('SW registration or push subscription failed:', e);
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  async function ensureNotifications() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const p = await Notification.requestPermission();
      return p === 'granted';
    }
    return false;
  }

  async function notify(title, body) {
    if (await ensureNotifications()) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, tag:'qoe-alert' }))
          .catch(()=> new Notification(title, { body }));
      } else {
        new Notification(title, { body });
      }
    }
  }

  // measure latency (simple light request)
  async function measureLatency(reps=4) {
    const L = [];
    for (let i=0;i<reps;i++){
      const t0 = performance.now();
      try {
        await fetch(PREDICT_API_URL + '?throughput=1&delay=1&jitter=1&loss=0', { cache:'no-store' });
        const t1 = performance.now();
        L.push(t1 - t0);
      } catch(e){ L.push(9999); }
      await new Promise(r => setTimeout(r, 120));
    }
    const avg = L.reduce((a,b)=>a+b,0)/L.length;
    const jitter = Math.sqrt(L.map(x=>Math.pow(x-avg,2)).reduce((a,b)=>a+b,0)/L.length);
    return { avgLatencyMs: avg, jitterMs: jitter };
  }

  // use connection.downlink when test file not provided
  async function measureThroughput(testUrl='') {
    if (!testUrl) {
      if (navigator.connection && navigator.connection.downlink) return { downloadMbps: navigator.connection.downlink };
      return { downloadMbps: null };
    }
    try {
      const t0 = performance.now();
      const resp = await fetch(testUrl, { cache:'no-store' });
      const blob = await resp.blob();
      const t1 = performance.now();
      const secs = Math.max((t1 - t0)/1000, 0.001);
      const mbps = (blob.size * 8 / secs) / (1024*1024);
      return { downloadMbps: mbps };
    } catch(e){
      return { downloadMbps: null, error: e.toString() };
    }
  }

  // main loop
  async function runAndReport() {
    const latency = await measureLatency(4);
    const throughput = await measureThroughput('');
    const delayMs = Math.round(latency.avgLatencyMs);
    const jitterMs = Math.round(latency.jitterMs);
    const throughputMbps = throughput.downloadMbps ? Number(throughput.downloadMbps.toFixed(2)) : 5;
    const qs = `?throughput=${throughputMbps}&delay=${delayMs}&jitter=${jitterMs}&loss=0`;

    try {
      const resp = await fetch(PREDICT_API_URL + qs);
      const data = await resp.json();
      const label = (data && data.prediction) ? data.prediction : 'Unknown';
      const body = `Predicted QoE: ${label}\nThroughput: ${throughputMbps} Mbps\nDelay: ${delayMs} ms\nJitter: ${jitterMs} ms`;
      const out = document.getElementById('qoe-output');
      if (out) out.textContent = body;
      if (['Poor','Bad'].includes(label)) {
        await notify('Network Warning: Poor QoE', body);
      }
    } catch(e) {
      console.error('Predict API error', e);
    }
  }

  // run every 10s while page open
  setInterval(runAndReport, 10000);
  runAndReport();
})();
