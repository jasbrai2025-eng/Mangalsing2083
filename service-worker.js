// Service Worker - मङ्गल सिंह मा.वि. दैनिक कक्षा कार्यतालिका एप
// यसले एपलाई पूर्ण install-योग्य, Offline-सक्षम, र पृष्ठभूमिमा घण्टी सूचना दिने बनाउँछ।

const CACHE_VERSION = "ms-routine-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon.png"
];

const CDN_FILES = [
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Mukta:wght@300;400;500;600;700;800&family=Inter:wght@400;600;700&display=swap"
];

// ============ INSTALL ============
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE);
      await shellCache.addAll(APP_SHELL_FILES);

      const runtimeCache = await caches.open(RUNTIME_CACHE);
      await Promise.all(
        CDN_FILES.map((url) =>
          fetch(url, { mode: "no-cors" })
            .then((res) => runtimeCache.put(url, res))
            .catch(() => null)
        )
      );

      self.skipWaiting();
    })()
  );
});

// ============ ACTIVATE ============
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("ms-routine-") && !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();

      // SW सक्रिय हुनासाथ अघिल्लो पटक "पृष्ठभूमि सूचना सक्रिय" थियो/थिएन भन्ने
      // कुरा IndexedDB बाट पुनः प्राप्त गरी, सक्रिय थियो भने स्वतः घण्टी-जाँच सुरु गर्ने।
      await resumeFromSavedState();
    })()
  );
});

// ============ FETCH ============
self.addEventListener("fetch", (event) => {
  // कुनै पनि fetch एउटा राम्रो सङ्केत हो कि SW ब्युँझेको छ — यही मौकामा
  // (एकपटक मात्र) अघिल्लो सुरक्षित state फर्काएर scheduler पुनः जीवित पार्ने।
  resumeFromSavedState();

  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === "navigate";

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(APP_SHELL_CACHE);
          cache.put("./index.html", networkResponse.clone());
          return networkResponse;
        } catch (err) {
          const cache = await caches.open(APP_SHELL_CACHE);
          const cached = await cache.match("./index.html");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (isSameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(request);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (err) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request, { mode: "no-cors" })
        .then((networkResponse) => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })()
  );
});

// ==========================================================
// पृष्ठभूमि घण्टी सूचना प्रणाली (Background Bell Scheduler)
// मुख्य पेजले SYNC_SCHEDULE म्यासेज पठाउँछ, अनि यहाँ setInterval
// ले हरेक सेकेन्ड समय जाँचेर तोकिएको समयमा notification देखाउँछ।
// ==========================================================

let bgSchedule = [];
let bgNotifyEnabled = false;
let bgPreBellEnabled = false;
let lastFiredPeriodId = null;
let lastFiredPreBellId = null;
let bellIntervalHandle = null;
let lastCheckTs = Date.now();
let saveTickCounter = 0;
let stateAlreadyResumed = false;

// ==========================================================
// स्थायी भण्डारण (IndexedDB) — ताकि ब्राउजरले Service Worker लाई
// निष्क्रिय भएको बेला निदाउँदा/बन्द गर्दा पनि "पृष्ठभूमि सूचना सक्रिय छ"
// भन्ने अवस्था र समयतालिका नहराओस्, र फेरि ब्युँझँदा उही ठाउँबाट
// स्वतः घण्टी-जाँच सुरु होस् (प्रयोगकर्ताले आफैं निष्क्रिय नगरेसम्म)।
// ==========================================================
const BELL_DB_NAME = "ms-routine-bell-db";
const BELL_DB_STORE = "state";
const BELL_DB_KEY = "current";

function openBellDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BELL_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(BELL_DB_STORE)) {
        req.result.createObjectStore(BELL_DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBellState() {
  try {
    const db = await openBellDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BELL_DB_STORE, "readwrite");
      tx.objectStore(BELL_DB_STORE).put(
        {
          periods: bgSchedule,
          notifyEnabled: bgNotifyEnabled,
          preBellEnabled: bgPreBellEnabled,
          lastFiredPeriodId,
          lastFiredPreBellId,
          lastCheckTs
        },
        BELL_DB_KEY
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("Bell state save failed:", err);
  }
}

async function loadBellState() {
  try {
    const db = await openBellDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(BELL_DB_STORE, "readonly");
      const req = tx.objectStore(BELL_DB_STORE).get(BELL_DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.log("Bell state load failed:", err);
    return null;
  }
}

// SW नयाँ सिरेदेखि ब्युँझँदा (message/periodicsync/sync/fetch/notificationclick
// जुनसुकैबाट होस्) अघिल्लो save गरिएको state फर्काएर, यदि पृष्ठभूमि सूचना
// अघि सक्रिय थियो भने त्यसलाई स्वतः पुनः सक्रिय गर्ने — प्रयोगकर्ताले आफैं
// "निष्क्रिय" नथिचेसम्म यो सधैं फर्किरहन्छ।
async function resumeFromSavedState() {
  if (stateAlreadyResumed) return;
  stateAlreadyResumed = true;

  const saved = await loadBellState();
  if (!saved) return;

  if (!bgSchedule.length) {
    bgSchedule = saved.periods || [];
    bgNotifyEnabled = !!saved.notifyEnabled;
    bgPreBellEnabled = !!saved.preBellEnabled;
    lastFiredPeriodId = saved.lastFiredPeriodId || null;
    lastFiredPreBellId = saved.lastFiredPreBellId || null;
  }

  if (!bgNotifyEnabled || !bgSchedule.length) return;

  // Catch-up: SW सुतिरहेको बेला तोकिएको समय आइसकेको तर घण्टी नबजेको भए
  // (केवल ३ घण्टाभित्रको ग्याप हो भने मात्र — पुरानो/बितेको दिनको घण्टी
  // नआओस् भनेर), ब्युँझिनासाथ तुरुन्तै त्यो घण्टी सूचना पठाउने।
  const gapMs = Date.now() - (saved.lastCheckTs || Date.now());
  if (gapMs > 65 * 1000 && gapMs < 3 * 60 * 60 * 1000) {
    fireMissedBellsDuringGap();
  }

  lastCheckTs = Date.now();
  startBellScheduler();
}

function fireMissedBellsDuringGap() {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  bgSchedule.forEach((period) => {
    if (
      period.start <= currentMins &&
      currentMins - period.start <= 5 &&
      lastFiredPeriodId !== period.id
    ) {
      lastFiredPeriodId = period.id;
      const bellText =
        period.bellCount === "continuous" ? "लगातार घण्टी" : period.bellCount + " पटक घण्टी";
      self.registration.showNotification("🔔 " + period.name + " सुरु भयो! (ढिला सूचना)", {
        body:
          "समय: " +
          bellText +
          "। एप पृष्ठभूमिमा निष्क्रिय भएका कारण सूचना ढिलो आयो। (मङ्गल सिंह मा.वि.)",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        vibrate: [300, 150, 300, 150, 400],
        tag: "period-start-" + period.id,
        renotify: true,
        requireInteraction: true
      });
    }
  });
}

function startBellScheduler() {
  if (bellIntervalHandle) return;
  bellIntervalHandle = setInterval(() => {
    checkBellSchedule();
    lastCheckTs = Date.now();
    saveTickCounter++;
    // हरेक सेकेन्ड डिस्कमा नलेखी, झन्डै २० सेकेन्डमा एकपटक मात्र state save गर्ने
    if (saveTickCounter >= 20) {
      saveTickCounter = 0;
      saveBellState();
    }
  }, 1000);
}

function stopBellScheduler() {
  if (bellIntervalHandle) {
    clearInterval(bellIntervalHandle);
    bellIntervalHandle = null;
  }
}

function checkBellSchedule() {
  if (!bgNotifyEnabled || !bgSchedule.length) return;

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const currentSecs = now.getSeconds();

  bgSchedule.forEach((period) => {
    // पिरियड सुरु हुँदा
    if (currentMins === period.start && currentSecs < 5 && lastFiredPeriodId !== period.id) {
      lastFiredPeriodId = period.id;
      const bellText = period.bellCount === "continuous" ? "लगातार घण्टी" : period.bellCount + " पटक घण्टी";

      self.registration.showNotification("🔔 " + period.name + " सुरु भयो!", {
        body: "समय: " + bellText + "। (मङ्गल सिंह मा.वि.)",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        vibrate: [300, 150, 300, 150, 400],
        tag: "period-start-" + period.id,
        renotify: true,
        requireInteraction: true
      });

      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({
            type: "TRIGGER_BELL",
            periodId: period.id,
            bellCount: period.bellCount,
            title: period.name + " सुरु भयो!"
          })
        );
      });

      saveBellState();
    }

    // पिरियड सकिन २ मिनेट बाँकी हुँदा (Pre-Bell)
    const secsLeft = period.end * 60 - (currentMins * 60 + currentSecs);
    if (bgPreBellEnabled && secsLeft <= 120 && secsLeft > 110 && lastFiredPreBellId !== period.id) {
      lastFiredPreBellId = period.id;
      self.registration.showNotification("🔔 २ मिनेट बाँकी: " + period.name, {
        body: period.name + " अब २ मिनेटमा सकिँदैछ। अर्को कक्षाको तयारी गर्नुहोस्।",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        vibrate: [200, 100, 200],
        tag: "pre-bell-" + period.id,
        renotify: true
      });
      saveBellState();
    }
  });

  // विद्यालय समाप्तिको घण्टी (१६:००)
  if (currentMins === 16 * 60 && currentSecs < 5 && lastFiredPeriodId !== "dismissal") {
    lastFiredPeriodId = "dismissal";
    self.registration.showNotification("🔔 विद्यालय समय समाप्त भयो!", {
      body: "आजका सम्पूर्ण कक्षाहरू सकिएका छन्। (छुट्टीको घण्टी)",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [500, 200, 500, 200, 500],
      tag: "dismissal-bell",
      renotify: true
    });
    saveBellState();
  }
}

// ============ MESSAGE ============
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "SYNC_SCHEDULE") {
    bgSchedule = data.periods || [];
    bgNotifyEnabled = !!data.notifyEnabled;
    bgPreBellEnabled = !!data.preBellEnabled;
    lastCheckTs = Date.now();
    stateAlreadyResumed = true; // पेजबाट ताजा data आइसकेको हुँदा पुरानो DB state ले ओभरराइट नगरोस्
    saveBellState();

    if (bgNotifyEnabled) {
      startBellScheduler();
    } else {
      stopBellScheduler();
    }
  }
});

// ============ PERIODIC BACKGROUND SYNC (best-effort wake-up) ============
// एप पूर्ण रूपमा बन्द भएको बेला पनि ब्राउजरले बेला-बेलामा SW लाई ब्युँझाओस्
// भनेर यो तरिका थपिएको हो — यसले schedule र "सक्रिय/निष्क्रिय" अवस्था
// ताजा गरी, कुनै घण्टी छुटेको भए तुरुन्तै (catch-up) पठाइदिन्छ।
// नोट: यो सुविधा Chromium-आधारित installed PWA मा मात्र काम गर्छ; ब्राउजरले
// नै exact interval निर्धारण गर्छ, त्यसैले यो अतिरिक्त सहयोगी मात्र हो —
// मुख्य scheduler भने माथिको setInterval नै हो जुन SW जीवित छँदासम्म चल्छ।
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "bell-heartbeat") {
    event.waitUntil(resumeFromSavedState());
  }
});

// One-off Background Sync — यो पनि उही उद्देश्यका लागि अतिरिक्त wake-trigger हो
self.addEventListener("sync", (event) => {
  if (event.tag === "bell-check") {
    event.waitUntil(resumeFromSavedState());
  }
});

// ============ NOTIFICATION CLICK ============
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  resumeFromSavedState();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});

// SW स्क्रिप्ट पहिलोपटक इभ्याल्युएट हुँदा (जुनसुकै event ले ब्युँझाएको भए पनि)
// state पुनः प्राप्त गर्ने अन्तिम सुनिश्चितता — "निष्क्रिय" नथिचेसम्म घण्टी बज्दै रहोस्।
resumeFromSavedState();
