# MS Routine — Android APK बनाउने गाइड (Capacitor + Local Notifications)

यो फोल्डरले तपाईंको वेब एपलाई साँच्चैको Android app मा बदल्छ, ताकि फोन लक भए पनि
वा एप पूर्ण बन्द भए पनि, तोकिएको ठ्याक्कै समयमा **OS-level Exact Alarm** मार्फत
साँच्चैको घण्टी-आवाज (custom sound) बज्छ। यो वेब/PWA मा कहिल्यै १००% सम्भव थिएन —
किनभने ब्राउजरले JavaScript नै backgroundमा चलाउन दिँदैन। Capacitor ले भने
Android को native AlarmManager प्रयोग गर्छ, जुन JS नचलिकनै ठ्याक्कै समयमा ट्रिगर हुन्छ।

## 🟢 सबैभन्दा सजिलो उपाय — Android Studio/Node.js केही पनि इन्स्टल नगरी

**महत्त्वपूर्ण भिन्नता बुझ्नुहोस्:** APK **"बनाउने"** काम (build) र त्यो APK
**"install गर्ने"** काम (जुन हरेक शिक्षकले फोनमा गर्छन्) — यी दुई फरक कुरा हुन्।
- **Build** एकपटक मात्र गर्नुपर्छ (कुनै एकजनाले)।
- त्यसपछि बनेको `.apk` फाइल WhatsApp/Bluetooth/USB जुनसुकैबाट पठाएर, जोसुकैले
  आफ्नो फोनमा **ट्याप गरेर install गर्न** जति सजिलो हो — कुनै कोडिङ, Android
  Studio, वा टेक्निकल ज्ञान चाहिँदैन (जस्तै Facebook/Truecaller को APK बाहिरबाट
  install गर्दा जस्तै — "Install anyway"/"Unknown source allow" एकपटक थिचे पुग्छ)।

त्यो एकपटकको "build" पनि अब आफ्नो कम्प्युटरमा Android Studio नराखिकनै, **GitHub
को free सर्भरमा** गर्न मिल्छ — तपाईंले गर्नुपर्ने भनेको यति मात्र हो:

1. **GitHub Desktop** (https://desktop.github.com) डाउनलोड/इन्स्टल गर्नुहोस् —
   यो कोडिङ चाहिँदैन, बटन थिचेर चल्ने साधारण एप हो।
2. GitHub Desktop खोलेर एउटा free GitHub अकाउन्ट बनाउनुहोस् (इमेलले साइन-अप)।
3. GitHub Desktop मा **"Add" → "Add Existing Repository"** मा गएर यो
   `capacitor-app` फोल्डर छान्नुहोस् (वा "Create a New Repository" गरी यो
   फोल्डरको content भित्र राख्नुहोस्)।
4. "Publish repository" बटन थिच्नुहोस् (Private/Public जे मन लाग्यो छान्नुहोस्)।
5. GitHub वेबसाइट (github.com) मा गएर आफ्नो repository खोल्नुहोस् → माथिको
   **"Actions"** ट्याबमा जानुहोस् — एउटा build स्वतः सुरु भइरहेको देखिनेछ
   (हरियो/पहेंलो गोलो चिन्ह)। यसमा ५-१० मिनेट लाग्छ।
6. Build सकिएपछि (हरियो ✅), उही रिपोजिटरीको दायाँतिर **"Releases"** खण्डमा
   गएर `app-debug.apk` डाउनलोड गर्नुहोस्।
7. त्यो `.apk` फाइल फोनमा पठाएर ट्याप गर्नुहोस् — install हुन्छ।

यसले सबै काम (npm install, Android platform थप्ने, permission थप्ने, APK build
गर्ने) **स्वतः** गर्छ — मैले `.github/workflows/build-apk.yml` भित्र त्यो सबै
पहिले नै लेखिदिएको छु, तपाईंले केही टाइप गर्नुपर्दैन।

**घण्टीको आवाज (वैकल्पिक):** साँच्चैको बेल आवाज राख्न चाहनुभए, `android-sound/`
फोल्डर भित्र ठ्याक्कै `bell.wav` नाम दिएर फाइल राखेर फेरि GitHub मा push गर्नुहोस्
(GitHub Desktop मा "Commit" → "Push" बटन थिचे पुग्छ) — अर्को build ले त्यो
आवाज समावेश गर्छ। नराखे पनि एप पूर्ण रूपमा चल्छ, फोनको default notification
sound बज्छ।

---

## विकल्प २: आफ्नै कम्प्युटरमा Android Studio राखेर (माथिको भन्दा बढी नियन्त्रण चाहिनेका लागि)

माथिको GitHub उपाय प्रयोग नगर्ने हो भने, तलको परम्परागत तरिका पनि उपलब्ध छ —
तर यसमा Node.js र Android Studio दुवै आफ्नो कम्प्युटरमा इन्स्टल गर्नुपर्छ।

## यो फोल्डरमा के-के छ

| फाइल/फोल्डर | काम |
|---|---|
| `www/` | तपाईंको पुरानो एप (index.html, manifest.json, आइकनहरू) + नयाँ `native-bell.js` |
| `www/native-bell.js` | APK भित्र मात्र चल्ने — Local Notifications मार्फत दैनिक घण्टी अलार्म तय गर्ने कोड |
| `package.json` | चाहिने npm प्याकेजहरूको सूची |
| `capacitor.config.json` | App ID, नाम, र notification sound/icon सेटिङ |
| `android-manifest-additions.xml` | AndroidManifest.xml मा हातले थप्नुपर्ने permission अंश (म्यानुअल build गर्दा मात्र चाहिन्छ — GitHub उपायमा यो स्वतः हुन्छ) |
| `.github/workflows/build-apk.yml` | GitHub को free सर्भरमा स्वतः APK build गर्ने स्क्रिप्ट (माथिको सजिलो उपायले यही प्रयोग गर्छ) |
| `android-sound/` | यहाँ `bell.wav` राखे custom घण्टी आवाज प्रयोग हुन्छ (वैकल्पिक) |

**नोट:** यो sandbox मा इन्टरनेट पहुँच छैन, त्यसैले `npm install` म आफैं यहाँ चलाउन
सक्दिनँ। तलका सबै कमाण्ड तपाईंले आफ्नो कम्प्युटरमा चलाउनुपर्छ (वा माथिको GitHub
उपाय प्रयोग गर्नुहोस्, जसले यो झन्झट हटाउँछ)।

## चाहिने सफ्टवेयर (एकपटक इन्स्टल गर्ने)

1. **Node.js** (LTS, v20 वा माथि) — https://nodejs.org
2. **Android Studio** (नवीनतम) — https://developer.android.com/studio
   - Android Studio खोल्दा SDK Manager बाट Android SDK (API 34/35) र एउटा emulator पनि इन्स्टल हुन्छ।
3. JDK — Android Studio सँगै आउँछ, छुट्टै चाहिँदैन।

## चरण १: प्याकेज इन्स्टल गर्ने

यो फोल्डर (`capacitor-app/`) आफ्नो कम्प्युटरमा खोलेर टर्मिनलमा:

```bash
npm install
npx cap init "MS Routine" "np.edu.mangalsingh.routine" --web-dir www
```

(`npx cap init` ले `capacitor.config.json` फेरि सोध्न सक्छ — पहिले नै बनाइदिएको
भएकाले "overwrite?" सोध्दा **No** भन्नुहोस्, वा त्यो कमाण्ड नै छोडेर सिधै अर्को
चरणमा जानुहोस् किनभने `capacitor.config.json` पहिले नै तयार छ।)

```bash
npx cap add android
```

यसले `android/` नामको नयाँ फोल्डर बनाउँछ — यो नै तपाईंको Android Studio प्रोजेक्ट हो।

## चरण २: घण्टीको आवाज फाइल राख्ने

तपाईंसँग भएको साँच्चैको घण्टी/बेल आवाज (`.wav` फर्म्याट सिफारिस, नाम ठ्याक्कै
`bell.wav`) यहाँ राख्नुहोस्:

```
android/app/src/main/res/raw/bell.wav
```

(`raw` नामको फोल्डर नभए आफैं बनाउनुहोस्। फाइलको नाम सानो अक्षरमा र स्पेस/विशेष
चिन्ह बिनाको हुनुपर्छ — `bell.wav` नै राख्नुहोस्, किनभने `native-bell.js` र
`capacitor.config.json` दुवैमा त्यही नाम राखिएको छ।)

## चरण ३: AndroidManifest.xml मा अनुमति थप्ने

`android/app/src/main/AndroidManifest.xml` खोल्नुहोस् र `android-manifest-additions.xml`
फाइलमा भएका सबै `<uses-permission ...>` लाइनहरू `<manifest>` ट्यागको भित्र
(तर `<application>` ट्यागभन्दा माथि) टाँस्नुहोस्।

## चरण ४: Sync गर्ने

```bash
npx cap sync android
```

यसले `www/` भित्रका फेरबदल र नयाँ प्लगइनहरू Android प्रोजेक्टमा प्रतिलिपि/जडान गर्छ।
**जहिले पनि `www/` भित्रका फाइल (जस्तै index.html को समयतालिका) परिवर्तन गरेपछि
यो कमाण्ड फेरि चलाउनुपर्छ।**

## चरण ५: Android Studio मा खोल्ने र Build गर्ने

```bash
npx cap open android
```

Android Studio खुल्छ। त्यहाँ:
1. पहिलो पटक Gradle sync हुन केही मिनेट लाग्छ (पर्खनुहोस्)।
2. फोन USB मार्फत जडान गरेर वा emulator चलाएर ▶️ (Run) थिच्नुहोस् — यसले सिधै
   फोनमा एप इन्स्टल गरेर testing गर्न मिल्छ।
3. साँच्चैको APK/AAB फाइल चाहिएमा: **Build → Generate Signed Bundle / APK**
   बाट keystore बनाएर signed APK निकाल्नुहोस् (यो फाइल अरूलाई sideload गरेर
   दिन वा Play Store मा राख्न मिल्छ)।

## परीक्षण गर्दा यी कुरा जाँच्नुहोस्

1. एप खोलेर "पृष्ठभूमि सूचना" बटन थिच्नुहोस् — notification permission र
   "Exact alarm" permission (Android 12+) दुवै स्वीकृत हुनुपर्छ।
2. समय-सिमुलेसन (Sim Mode) प्रयोग गरेर वा फोनको समय अलिकति अगाडि सारेर एउटा
   पिरियड सुरु हुने बेला जाँच्नुहोस्।
3. फोन लक गरेर (स्क्रिन बन्द गरेर) पर्खनुहोस् — तोकिएको समयमा notification +
   `bell.wav` को आवाज आउनुपर्छ, फोन लक भए पनि।
4. एप Recent Apps बाट पूर्ण Swipe गरेर बन्द गरे पछि पनि (फोन रिस्टार्ट नगरी)
   उही व्यवहार हुनुपर्छ — किनकि यो OS-level AlarmManager हो, JS होइन।

## ⚠️ इमानदार सीमाहरू (यी वेब/PWA जत्तिकै समस्या होइनन्, तर native app मै पनि छन्)

- **फोन Restart:** राम्रो खबर — यो पहिले सोचेको जस्तो समस्या रहेनछ। Capacitor को
  Android runtime भित्रै (सन् २०२० देखि, हालको v8 सम्म सबैमा) `LocalNotificationRestoreReceiver`
  भन्ने एउटा built-in native receiver पहिले नै समावेश छ, जसले फोन **BOOT_COMPLETED**
  हुनासाथ (प्रयोगकर्ताले एप नखोलिकनै) पहिले तय गरिएका सबै local notification
  (हाम्रा दैनिक दोहोरिने घण्टी सहित) NotificationStorage बाट पढेर स्वतः फेरि
  AlarmManager मा schedule गरिदिन्छ। यसैले हामीले छुट्टै custom BroadcastReceiver
  कोड लेख्नु परेन — `android-manifest-additions.xml` मा राखिएको
  `RECEIVE_BOOT_COMPLETED` permission मात्र पुग्छ (त्यो पहिले नै थपिएको छ)।
  (एउटा सानो caveat: निकै लामो समय (केही दिन/हप्ता) फोन नखोलिकन राखे भने, Android
  आफैंले battery-saver ले app लाई "stopped state" मा राख्न सक्छ, जसले
  BOOT_COMPLETED broadcast receive गर्न रोक्छ — यस्तो अवस्थामा मात्र एपलाई
  एकपटक म्यानुअल खोल्नुपर्ने हुन्छ। सामान्य दैनिक/साप्ताहिक प्रयोगमा यो समस्या आउँदैन।)
- **Battery optimisation:** केही फोन (विशेषतः Xiaomi/Oppo/Vivo/Samsung का
  aggressive battery-saver) ले "Unrestricted battery" नदिएसम्म exact alarm
  पनि ढिलो गराउन सक्छन् — प्रयोगकर्तालाई Settings बाट यो एपलाई "No restrictions"
  दिन सुझाव दिनुहोस्।
- **Custom sound (Android 8+):** एकपटक notification channel बनिसकेपछि त्यसको
  sound फाइल फेरबदल गर्न प्रयोगकर्ताले एप uninstall गरेर फेरि install गर्नुपर्छ
  (यो Android आफैंको सीमा हो, हाम्रो कोडको होइन)।

## पछि समयतालिका (routine) परिवर्तन गर्दा

`www/index.html` भित्रको `timePeriods` वा कक्षा-तालिका बदलेपछि जहिले पनि:
```bash
npx cap sync android
```
चलाएर Android Studio बाट फेरि Build/Run गर्नुहोस् — अनिले नयाँ समयतालिका APK
भित्र समावेश हुन्छ। (Sync नगरी पुरानो APK ले पुरानै समय प्रयोग गरिरहन्छ।)
