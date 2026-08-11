# मङ्गल सिंह मा.वि. रुटिन एप — PWA सेटअप गाइड (v2)

## यो फोल्डरमा के-के छ
| फाइल | काम |
|---|---|
| `index.html` | मुख्य एप |
| `manifest.json` | PWA Manifest (नाम, आइकन, रङ, install व्यवहार) |
| `service-worker.js` | Offline caching + **पृष्ठभूमि घण्टी सूचना प्रणाली** |
| `icon-192.png`, `icon-512.png` | सामान्य आइकन (rounded) |
| `icon-maskable-192.png`, `icon-maskable-512.png` | Android adaptive-icon का लागि full-bleed आइकन |
| `apple-touch-icon.png` | iOS होम स्क्रिन आइकन |
| `favicon.png` | ब्राउजर ट्याब आइकन |

## ⚠️ यसपटक के गलत थियो र के सुधारियो?

तपाईंले पठाउनुभएको भर्सनले `manifest.json` र Service Worker दुवैलाई **JavaScript ले `Blob` + `URL.createObjectURL()` मार्फत runtime मा बनाउँथ्यो**, फाइलको रूपमा होइन। यो नै मुख्य समस्या थियो:

- Chrome/Edge/Samsung Internet जस्ता प्रायः सबै browser ले **`blob:` URL बाट manifest लिङ्क** भएको एपलाई भरपर्दो तरिकाले installable मान्दैनन्।
- धेरै browser मा **Service Worker लाई `blob:` URL बाट register गर्न नै दिइँदैन** (security restriction) — दिए पनि त्यो हरेक पटक ब्राउजर बन्द भएपछि हराउँछ, किनभने Blob temporary हो।
- Canvas ले generate गरेको Data URL आइकन manifest मा राख्दा थुप्रै Android launcher ले ठीकसँग पढ्दैनन्।

**समाधान:** मैले `manifest.json`, `service-worker.js`, र सबै आइकनलाई **वास्तविक स्थायी फाइल** का रूपमा डिस्कमा नै बनाइदिएँ, अनि `index.html` ले तिनलाई सामान्य `<link>` ट्यागबाट मात्र refer गर्छ। साथै तपाईंको नयाँ भर्सनमा भएको **पृष्ठभूमि घण्टी scheduling (SYNC_SCHEDULE, pre-bell, dismissal bell)** लाई पनि नयाँ `service-worker.js` भित्र सोही तरिकाले सुरक्षित राखिएको छ, बरु अब त्यो logic पेज लोड हुँदा हराउँदैन किनभने फाइल स्थायी छ।

## Deploy गर्ने तरिका (जुनसुकै एक छान्नुहोस्)

### विकल्प १: GitHub Pages (सजिलो र निःशुल्क)
1. GitHub मा नयाँ repository बनाउनुहोस्।
2. यी ९ वटै फाइल एउटै फोल्डर संरचनामा अपलोड गर्नुहोस्।
3. Settings → Pages → Branch: `main` छान्नुहोस् → Save।
4. केही मिनेटमा `https://<username>.github.io/<repo>/` मा एप उपलब्ध हुन्छ।

### विकल्प २: Netlify / Vercel (Drag & Drop)
1. netlify.com मा जानुहोस् → "Deploy manually" → यो फोल्डर तान्नुहोस् (drag-drop)।
2. तुरुन्तै HTTPS link तयार हुन्छ — त्यहीबाट Install गर्न मिल्छ।

### विकल्प ३: आफ्नै Hosting/cPanel
सबै फाइल `public_html/` (वा डोमेनको root) मा अपलोड गर्नुहोस्। **HTTPS अनिवार्य छ** (केवल `localhost` मा testing का लागि HTTP पनि चल्छ)।

## Install कसरी हुन्छ (प्रयोगकर्ताका लागि)
- **Android (Chrome/Edge):** माथिको हरियो "इन्स्टल" बटन वा तल्लो nav bar को "इन्स्टल" आइकन देखिन्छ, वा ⋮ मेनु → "Add to Home screen" / "Install app"।
- **iPhone (Safari):** Share बटन → "Add to Home Screen"। (Chrome/Messenger भित्रबाट खोलेको भए पहिले "Open in Safari/Chrome" गर्नुपर्छ — यो सहायता `pwaHelpModal` मा app भित्रै देखाइएको छ।)
- **Windows/Mac (Chrome/Edge):** Address bar को दायाँतिर install (⊕) आइकनमा क्लिक गर्नुहोस्।

## पृष्ठभूमि घण्टी सूचना कसरी काम गर्छ (v3 — "निष्क्रिय नगरेसम्म सधैं सक्रिय")
1. प्रयोगकर्ताले "पृष्ठभूमि सूचना" बटन थिच्दा Notification permission माग्छ।
2. Permission मिलेपछि हालको समयतालिका (`timePeriods`) र सक्रिय/निष्क्रिय अवस्था दुवै:
   - **`localStorage` मा** (मुख्य पेजमा) — ताकि एप बन्द गरी फेरि खोल्दा वा फोन रिस्टार्ट भएपछि पनि सेटिङ "सक्रिय" नै देखियोस्।
   - **`IndexedDB` मा** (Service Worker भित्र) — ताकि ब्राउजरले Service Worker लाई निष्क्रिय भएको केही समयपछि सुताए/बन्द गरे पनि, फेरि जुनसुकै event (message, fetch, notification click, periodic sync) ले ब्युँझाउँदा उही समयतालिका र "सक्रिय" अवस्था स्वतः फर्किन्छ।
3. Service Worker भित्र `setInterval` ले हरेक सेकेन्ड समय जाँच्छ र `showNotification()` ले सूचना देखाउँछ। एप खुला भए `TRIGGER_BELL` म्यासेज पठाएर ध्वनी/vibration पनि बजाइन्छ।
4. **Catch-up (छुटेको घण्टी):** यदि Service Worker केही समय (६५ सेकेन्डभन्दा बढी, ३ घण्टाभित्र) सुतेको थियो र त्यसै बीचमा कुनै घण्टी समय आइसकेको रहेछ भने, ब्युँझिनासाथ त्यो घण्टी "(ढिला सूचना)" भनेर तुरुन्तै पठाइन्छ — घण्टी पूर्ण रूपमा हराउँदैन।
5. **Periodic Background Sync (best-effort):** Chromium-आधारित installed PWA (Android Chrome/Edge) मा अतिरिक्त रूपमा ब्राउजरलाई बेला-बेलामा Service Worker ब्युँझाउन अनुरोध गरिन्छ, ताकि लामो समय निष्क्रिय रहँदा पनि schedule ताजा भइरहोस्।
6. **कहिले निष्क्रिय हुन्छ?** प्रयोगकर्ताले आफैं "पृष्ठभूमि सूचना" बटन थिचेर बन्द नगरेसम्म, वा ब्राउजरको Notification permission नै हटाएसम्म, यो सधैं सक्रिय रहन्छ — पेज रिफ्रेस, ट्याब बन्द, वा एप restart ले यसलाई निष्क्रिय गर्दैन।

> ⚠️ इमानदार सीमा: यो एउटा static/serverless PWA हो (कुनै push server छैन), त्यसैले Android/iOS को battery-saving व्यवहार अनुसार browser/OS ले लामो समयसम्म प्रयोग नभएको ट्याबको Service Worker पूर्ण रूपमा सुताउन सक्छ। त्यस्तो अवस्थामा घण्टी ठ्याक्कै सेकेन्डमै नबजी माथिको catch-up संयन्त्रले ब्युँझिनासाथ (केही मिनेट ढिलो) सूचना दिन्छ — यो सबै Web/PWA प्रविधिको साझा सीमा हो, native app वा push-server जत्तिकै सेकेन्ड-दर-सेकेन्ड ग्यारेन्टी हुँदैन। iOS Safari मा background execution झन् सीमित छ। पूर्ण भरपर्दो, ठ्याक्कै-समयमा पृष्ठभूमि अलार्मका लागि native Android app वा server-पठाइने Push Notification नै उत्तम विकल्प हुन्छ।

## Install हुन नसके यी कुरा जाँच्नुहोस्
1. साइट **HTTPS** मा नै छ (`localhost` मा टेस्ट गर्न मिल्छ, तर live साइटमा http:// ले काम गर्दैन)।
2. Browser DevTools → Application → Manifest ट्याबमा कुनै red error छैन।
3. Application → Service Workers मा `service-worker.js` "activated and running" देखिन्छ (blob: होइन)।
4. `icon-192.png` र `icon-512.png` browser मा सिधै खोल्दा देखिन्छन् (404 छैन)।
