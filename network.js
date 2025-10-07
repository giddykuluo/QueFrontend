// network.js
(async function(){
  // ---------- CONFIG ----------
  const PREDICT_API_URL = 'https://qoeapi.onrender.com/predict';
const PUSH_SERVER_URL = 'https://qoepushserver.onrender.com';

  const publicVapidKey = "BJgtmyqbQNvXqZHZM6mAHkWoPJ1_fa2niOl9F_3draoZp7rgCoWRA9TIhjExgsdtBkF5fuYfhPCI0QNuTt_w7gA"; // VAPID public key

  // ---------- SERVICE WORKER REGISTRATION ----------
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('service-worker.js');
      console.log('Service worker registered:', reg.scope);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await fetch(PUSH_SERVER_URL + "/subscribe", {
        method: "POST",
        body: JSON.stringify(sub),
        headers: { "Content-Type": "application/json" }
      });

      console.log("Push subscription sent to server ✅");
    } catch(e) {
      console.warn('SW registration or push subscription failed:', e);
    }
  }

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
    if (Notification.permission !== 'denied') {
      const p = await Notification.requestPermission();
      return p === 'granted';
    }
    return false;
  }

  async function notify(title, body) {
    if (await ensureNotifications()) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, { body: body, tag: 'qoe-alert' });
        }).catch(()=> new Notification(title, { body }));
      } else {
        new Notification(title, { body });
      }
    }
  }

  // ---------- NETWORK TESTS ----------
  async function measureLatency(reps=5) {
    const latencies = [];
    for (let i=0;i<reps;i++){
      const t0 = performance.now();
      try {
        await fetch(PREDICT_API_URL + '?throughput=1&delay=1&jitter=1&loss=0', { method: 'GET', cache: 'no-store' });
        const t1 = performance.now();
        latencies.push(t1 - t0);
      } catch(e){
        latencies.push(9999);
      }
      await new Promise(r=>setTimeout(r, 150));
    }
    const avg = latencies.reduce((a,b)=>a+b,0)/latencies.length;
    const jitter = Math.sqrt(latencies.map(x=>Math.pow(x-avg,2)).reduce((a,b)=>a+b,0)/latencies.length);
    return {avgLatencyMs: avg, jitterMs: jitter};
  }

  async function measureThroughput(testUrl, sizeBytes=100000) {
    if (!testUrl) {
      if (navigator.connection && navigator.connection.downlink) {
        return {downloadMbps: navigator.connection.downlink};
      }
      return {downloadMbps: null};
    }
    try {
      const t0 = performance.now();
      const resp = await fetch(testUrl, { cache: 'no-store' });
      const blob = await resp.blob();
      const t1 = performance.now();
      const seconds = Math.max((t1 - t0)/1000, 0.001);
      const bits = blob.size * 8;
      const mbps = (bits / seconds) / (1024*1024);
      return {downloadMbps: mbps};
    } catch(e){
      return {downloadMbps: null, error: e.toString()};
    }
  }

  // ---------- PACKET LOSS ESTIMATION ----------
  async function estimatePacketLoss(url, trials=5) {
    let failed = 0;
    for (let i=0;i<trials;i++){
      try {
        const resp = await fetch(url, {cache: 'no-store', mode: 'no-cors'});
        if (!resp.ok) failed++;
      } catch(e) {
        failed++;
      }
    }
    return (failed / trials) * 100; // %
  }

  // ---------- MAIN LOOP ----------
  async function runAndReport() {
    const latency = await measureLatency(4);
    const throughput = await measureThroughput('');
    const packetLoss = await estimatePacketLoss(PREDICT_API_URL, 5);

    const delayMs = Math.round(latency.avgLatencyMs);
    const jitterMs = Math.round(latency.jitterMs);
    const throughputMbps = throughput.downloadMbps ? Number(throughput.downloadMbps.toFixed(2)) : 5;

    const qs = `?throughput=${throughputMbps}&delay=${delayMs}&jitter=${jitterMs}&loss=${packetLoss}`;
    try {
      const resp = await fetch(`${PREDICT_API_URL}${qs}`, { method: 'GET', cache: 'no-store' });
      const data = await resp.json();
      const label = data.prediction || data.predicted || 'Unknown';
      const body = `Predicted QoE: ${label}\nThroughput: ${throughputMbps} Mbps\nDelay: ${delayMs} ms\nJitter: ${jitterMs} ms\nPacket Loss: ${packetLoss.toFixed(1)}%`;

      const out = document.getElementById('qoe-output');
      if (out) out.textContent = body;

      if (['Poor','Bad'].includes(label)) {
        await notify('⚠️ Network Warning: Poor QoE', body);
      }
    } catch(e) {
      console.error('Predict API error', e);
    }
  }

  setInterval(runAndReport, 10000);
  runAndReport();
})();
