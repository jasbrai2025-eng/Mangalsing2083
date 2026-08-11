// ==========================================================
// native-bell.js
// Android APK (Capacitor) भित्र मात्र सक्रिय हुने वास्तविक पृष्ठभूमि घण्टी प्रणाली।
// यसले OS-level "Exact Alarm" मार्फत तोकिएको ठ्याक्कै समयमा — फोन लक भए पनि,
// एप पूर्ण बन्द भए पनि — साँच्चैको custom घण्टी-आवाज (notification channel sound)
// बजाउँछ। ब्राउजर/PWA मोडमा (window.Capacitor नभएकोले) यो फाइलले केही गर्दैन,
// त्यहाँ index.html कै पुरानो Web Notification / Service Worker व्यवस्था नै चल्छ।
//
// चाहिने कुरा (build बेला):
//   1. npm install @capacitor/local-notifications
//   2. android/app/src/main/res/raw/bell.wav मा साँच्चैको घण्टी आवाज फाइल राख्ने
//   3. AndroidManifest.xml मा SCHEDULE_EXACT_ALARM / POST_NOTIFICATIONS permission
//      (README-CAPACITOR-BUILD.md मा विस्तृत निर्देशन छ)
// ==========================================================

(function () {
    "use strict";

    function isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    if (!isNative()) {
        // ब्राउजर/installed-PWA मोड — यहाँ केही गर्दैन।
        window.NativeBell = {
            isNative: function () { return false; },
            enable: async function () {},
            disable: async function () {}
        };
        return;
    }

    if (!window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) {
        console.warn("NativeBell: @capacitor/local-notifications प्लगइन फेला परेन। package.json मा जोडेर npx cap sync गर्नुहोस्।");
        window.NativeBell = {
            isNative: function () { return true; },
            enable: async function () { console.warn("LocalNotifications प्लगइन उपलब्ध छैन"); },
            disable: async function () {}
        };
        return;
    }

    const LocalNotifications = window.Capacitor.Plugins.LocalNotifications;
    const CHANNEL_ID = "school-bell-channel";
    const NOTIF_ID_BASE = 5000;   // प्रत्येक पिरियडलाई क्रमशः 5000, 5001, ... ID दिइन्छ
    const DISMISSAL_ID = 5999;    // विद्यालय समाप्ति घण्टीको छुट्टै ID

    // ---------- १. Notification Channel (Android 8+ मा custom sound यहीबाट मात्र सम्भव) ----------
    async function ensureChannel() {
        try {
            await LocalNotifications.createChannel({
                id: CHANNEL_ID,
                name: "स्कुल घण्टी (School Bell)",
                description: "तोकिएको समयमा साँच्चैको घण्टी आवाज बजाउने च्यानल",
                importance: 5,      // IMPORTANCE_HIGH — screen लक भए पनि देखिने/बज्ने
                sound: "bell.wav",  // android/app/src/main/res/raw/bell.wav (एकपटक बनेपछि uninstall नगरी फेरबदल हुँदैन)
                vibration: true,
                visibility: 1
            });
        } catch (err) {
            console.log("NativeBell: च्यानल बनाउन असफल —", err);
        }
    }

    // ---------- २. आवश्यक अनुमतिहरू ----------
    async function ensurePermissions() {
        try {
            const notifPerm = await LocalNotifications.checkPermissions();
            if (notifPerm.display !== "granted") {
                await LocalNotifications.requestPermissions();
            }
        } catch (err) {
            console.log("NativeBell: notification permission जाँच्न असफल —", err);
        }

        // Android 12+ मा "Exact Alarm" अनुमति नभई ठ्याक्कै समयमा घण्टी बज्दैन
        try {
            if (LocalNotifications.checkExactNotificationSetting) {
                const exact = await LocalNotifications.checkExactNotificationSetting();
                if (exact && exact.exact_alarm !== "granted" && LocalNotifications.changeExactNotificationSetting) {
                    await LocalNotifications.changeExactNotificationSetting();
                }
            }
        } catch (err) {
            console.log("NativeBell: exact-alarm setting जाँच्न असफल —", err);
        }
    }

    function bellBodyText(period) {
        if (period.bellCount === "continuous") return "लगातार घण्टी — " + period.name;
        return period.bellCount + " पटक घण्टी — " + period.name;
    }

    // ---------- ३. index.html कै `timePeriods` array बाट दैनिक दोहोरिने अलार्महरू ----------
    async function scheduleAllBells() {
        const periods = (typeof timePeriods !== "undefined") ? timePeriods : [];
        if (!periods.length) {
            console.warn("NativeBell: timePeriods फेला परेन — index.html लोड भइसकेपछि मात्र यो function चलाउनुहोस्।");
            return;
        }

        const notifications = [];
        let idCounter = NOTIF_ID_BASE;

        periods.forEach(function (period) {
            const hour = Math.floor(period.start / 60);
            const minute = period.start % 60;
            notifications.push({
                id: idCounter++,
                title: "🔔 " + period.name + " सुरु भयो!",
                body: bellBodyText(period),
                channelId: CHANNEL_ID,
                schedule: {
                    on: { hour: hour, minute: minute, second: 0 },
                    repeats: true,
                    allowWhileIdle: true
                },
                extra: { periodId: period.id }
            });
        });

        // विद्यालय समाप्तिको घण्टी (१६:००) — index.html मै hardcode भएकै समय
        notifications.push({
            id: DISMISSAL_ID,
            title: "🔔 विद्यालय समय समाप्त भयो!",
            body: "आजका सम्पूर्ण कक्षाहरू सकिएका छन्। (छुट्टीको घण्टी)",
            channelId: CHANNEL_ID,
            schedule: {
                on: { hour: 16, minute: 0, second: 0 },
                repeats: true,
                allowWhileIdle: true
            },
            extra: { periodId: "dismissal" }
        });

        try {
            await LocalNotifications.schedule({ notifications: notifications });
            console.log("NativeBell: " + notifications.length + " वटा दैनिक घण्टी अलार्म तय भयो।");
        } catch (err) {
            console.log("NativeBell: schedule असफल —", err);
        }
    }

    async function cancelAllBells() {
        try {
            const pending = await LocalNotifications.getPending();
            const list = (pending && pending.notifications) || [];
            if (list.length) {
                await LocalNotifications.cancel({
                    notifications: list.map(function (n) { return { id: n.id }; })
                });
            }
        } catch (err) {
            console.log("NativeBell: cancel असफल —", err);
        }
    }

    // ---------- ४. Public API (index.html को toggleBackgroundNotifications() बाट प्रयोग हुन्छ) ----------
    async function enable() {
        await ensureChannel();
        await ensurePermissions();
        await scheduleAllBells();
    }

    async function disable() {
        await cancelAllBells();
    }

    window.NativeBell = {
        isNative: function () { return true; },
        enable: enable,
        disable: disable
    };

    // फोनको Exact-Alarm setting प्रयोगकर्ताले बीचमै निष्क्रिय गरे भने एपले पत्ता
    // लगाएर अलार्म हराउँछ (Android को व्यवहार) — त्यसैले एप फेरि अगाडि आउँदा
    // (resume) पुनः-सक्रिय भए schedule ताजा गर्ने।
    document.addEventListener("resume", function () {
        try {
            if (window.isBackgroundNotifyEnabled) {
                enable();
            }
        } catch (err) { /* index.html अझै लोड नभएको हुन सक्छ */ }
    }, false);
})();
