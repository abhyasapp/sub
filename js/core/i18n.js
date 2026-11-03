// js/core/i18n.js — Nepali localization layer.
//
// The layer, not a half-translated app: everything else keeps working in
// English, and a string becomes bilingual the moment it is wrapped.
//
//   Static markup   <label data-i18n>Password</label>
//                   <input data-i18n-ph placeholder="Your password">
//                   <button data-i18n-aria aria-label="Show password">
//                   <div data-i18n-title title="Switch theme">
//
//   Generated text  I18N.t('Sign in')
//                   I18N.t('{n} to go · about {m}', { n: 10, m: '9m' })
//
// Keys are the English source text. That keeps call sites readable, means a
// missing translation degrades to English instead of a raw key, and lets
// data-i18n work without inventing an id for every sentence.
//
// The choice persists in localStorage and survives an offline session; it
// also sets <html lang> so screen readers and the browser's own UI agree.
(function () {
  'use strict';

  const LANG_KEY = 'abhyas_lang';
  const LANGS = { en: 'English', ne: 'नेपाली' };

  /* Every Nepali string the app currently uses. Add a line here, then add
     data-i18n="<English>" (or I18N.t) where it is shown. */
  const NE = {
    /* ── landing + auth ─────────────────────────────────────────── */
    'Skip to sign in': 'साइन इनमा जानुहोस्',
    'Switch theme': 'रङ बदल्नुहोस्',
    'Your path to mastery': 'तपाईंको सफलताको बाटो',
    'Loksewa Civil Engineering practice — online or offline': 'लोकसेवा सिभिल इन्जिनियरिङ अभ्यास — अनलाइन वा अफलाइन',
    'Checking the connection…': 'इन्टरनेट जाँच गर्दै…',
    'Welcome back': 'स्वागत छ',
    '— opening your dashboard.': '— तपाईंको ड्यासबोर्ड खोल्दै।',
    'Not you? Log out': 'तपाईं होइन? लगआउट गर्नुहोस्',
    'Checking your session…': 'तपाईंको सेसन जाँच गर्दै…',
    'Sign in': 'साइन इन',
    'Create account': 'खाता खोल्नुहोस्',
    'Username, email or mobile': 'प्रयोगकर्ता नाम, इमेल वा मोबाइल',
    'Password': 'पासवर्ड',
    'Your password': 'तपाईंको पासवर्ड',
    'Forgot your password?': 'पासवर्ड बिर्सनुभयो?',
    "Enter your username or the email on your account. If it matches, we'll email you a reset code.":
      'तपाईंको प्रयोगकर्ता नाम वा खाताको इमेल लेख्नुहोस्। मिलेमा पासवर्ड रिसेट कोड इमेल गरिनेछ।',
    'Username or email': 'प्रयोगकर्ता नाम वा इमेल',
    'Email me a code': 'कोड इमेल गर्नुहोस्',
    'Back to sign in': 'साइन इनमा फर्कनुहोस्',
    'Paste the code from your email, then choose a new password.': 'इमेलमा आएको कोड टाँस्नुहोस्, त्यसपछि नयाँ पासवर्ड राख्नुहोस्।',
    'Reset code': 'रिसेट कोड',
    'Paste the code': 'कोड टाँस्नुहोस्',
    'New password': 'नयाँ पासवर्ड',
    'At least 8 characters': 'कम्तीमा ८ अक्षर',
    'Set the new password': 'नयाँ पासवर्ड राख्नुहोस्',
    'Create my account': 'मेरो खाता खोल्नुहोस्',
    'Full name': 'पूरा नाम',
    'Your name': 'तपाईंको नाम',
    'Mobile': 'मोबाइल',
    'Email': 'इमेल',
    'you@example.com': 'you@example.com',
    'Username': 'प्रयोगकर्ता नाम',
    'Pick a username': 'प्रयोगकर्ता नाम छान्नुहोस्',
    'Letters, numbers, dots, dashes and underscores. At least 3 characters.':
      'अक्षर, अंक, डट, ड्यास र अन्डरस्कोर। कम्तीमा ३ अक्षर।',
    'Repeat password': 'पासवर्ड दोहोर्याउनुहोस्',
    'Type it again': 'फेरि टाइप गर्नुहोस्',
    'Show password': 'पासवर्ड देखाउनुहोस्',
    'Hide password': 'पासवर्ड लुकाउनुहोस्',

    /* ── student navigation (js/core/nav.js) ────────────────────── */
    'Home': 'गृहपृष्ठ',
    'Practice': 'अभ्यास',
    'Written answers': 'लेखन उत्तर',
    'Review': 'दोहोर्याउने',
    'Progress & plan': 'प्रगति र योजना',
    'Tools': 'औजार',
    'Review & progress': 'दोहोर्याउने र प्रगति',
    'Model answers & notes': 'नमुना उत्तर र नोट',
    'Weekly test': 'साप्ताहिक परीक्षा',
    'Hourly challenge': 'घण्टाको चुनौती',
    'Question of the day': 'आजको प्रश्न',
    'My submissions': 'मेरा पेस',
    'Full paper': 'पूरा पत्र',
    'Browse questions': 'प्रश्न हेर्नुहोस्',
    'Chapters': 'अध्याय',
    '60-day sprint': '६० दिने अभियान',
    'Open a file': 'फाइल खोल्नुहोस्',
    'Mixed practice': 'मिश्रित अभ्यास',
    'Saved': 'सुरक्षित',
    'Weak spots': 'कमजोर पक्ष',
    'Your progress': 'तपाईंको प्रगति',
    'Downloads': 'डाउनलोड',
    'Backup': 'ब्याकअप',
    'Study plan': 'अध्ययन योजना',
    'How this works': 'यो कसरी काम गर्छ',

    /* ── sprint page (js/features/sprint.js + user.html) ────────── */
    'Today': 'आज',
    "Today's targets": 'आजका लक्ष्यहरू',
    "Today's list": 'आजको सूची',
    'This week': 'यो हप्ता',
    '60-day journey': '६० दिने यात्रा',
    'Take today off': 'आज विश्राम लिनुहोस्',
    'Learn': 'सिकाइ',
    'Mock': 'मोक',
    'New': 'नयाँ',
    'Reviews': 'दोहोर्याउने',
    'Drill': 'अभ्यास',
    'Time': 'समय',
    'New questions': 'नयाँ प्रश्न',
    'Done': 'सकियो',
    /* ── Data & backup: display and storage cards (js/features/settings-ui.js) ── */
    'Theme': 'थिम',
    'Automatic follows your device.': 'स्वचालितले तपाईंको उपकरणको सेटिङ पछ्याउँछ।',
    'Light': 'उज्यालो',
    'Dark': 'अँध्यारो',
    'Automatic': 'स्वचालित',
    'Text size': 'अक्षरको आकार',
    'Makes questions and explanations easier to read.': 'प्रश्न र व्याख्या पढ्न सजिलो बनाउँछ।',
    'Normal': 'सामान्य',
    'Large': 'ठूलो',
    'Extra large': 'धेरै ठूलो',
    'Language': 'भाषा',
    'Menus and buttons. Questions stay in English.': 'मेनु र बटनहरू। प्रश्नहरू अङ्ग्रेजीमै रहन्छन्।',
    'Reduce motion': 'गति कम गर्नुहोस्',
    'Turns off animations and transitions.': 'एनिमेसन र संक्रमण बन्द गर्छ।',
    'Focus mode': 'फोकस मोड',
    'Hides streaks and badges while you study.': 'पढ्दा स्ट्रिक र ब्याज लुकाउँछ।',
    'On': 'चालू',
    'Off': 'बन्द',
    'Saved progress and notes': 'सुरक्षित प्रगति र नोट',
    'Progress, notes and settings': 'प्रगति, नोट र सेटिङ',
    '{a} of about {b} ({n}%)': '{b} मध्ये लगभग {a} ({n}%)',
    'Getting full. Download a backup. Nothing is ever deleted automatically.': 'भरिँदै छ। ब्याकअप डाउनलोड गर्नुहोस्। केही पनि आफैँ मेटिँदैन।',
    'Downloaded question sets': 'डाउनलोड गरिएका प्रश्न सेट',
    '{a} of {b} sets are saved for offline study.': 'अफलाइन अध्ययनका लागि {b} मध्ये {a} सेट सुरक्षित छन्।',
    '{a} sets are saved for offline study.': 'अफलाइन अध्ययनका लागि {a} सेट सुरक्षित छन्।',
    'Manage downloads': 'डाउनलोड व्यवस्थापन',
    'Used on this device': 'यस उपकरणमा प्रयोग भएको',
    '{a} of {b} available to Abhyas.': 'अभ्यासलाई उपलब्ध {b} मध्ये {a}।',
    'Protect my data': 'मेरो डेटा जोगाउनुहोस्',
    'Your browser will not clear Abhyas data when the device runs low on space.': 'उपकरणमा ठाउँ कम हुँदा ब्राउजरले अभ्यासको डेटा हटाउँदैन।',
    'Ask the browser not to clear Abhyas data when the device runs low on space.': 'उपकरणमा ठाउँ कम हुँदा ब्राउजरले अभ्यासको डेटा नहटाओस् भनी अनुरोध गर्नुहोस्।',
    'Protected': 'सुरक्षित',
    'Protect': 'जोगाउनुहोस्',
    'Download backup': 'ब्याकअप डाउनलोड',
    'Remove downloaded sets': 'डाउनलोड गरिएका सेट हटाउनुहोस्',
    'Your data is now protected.': 'तपाईंको डेटा अब सुरक्षित छ।',
    'The browser did not allow it. Installing Abhyas to your home screen usually helps.': 'ब्राउजरले अनुमति दिएन। अभ्यास होम स्क्रिनमा इन्स्टल गर्दा प्रायः मद्दत हुन्छ।',
    'Review due': 'दोहोर्याउन बाँकी',
    'Start': 'सुरु',
    'Continue': 'जारी राख्नुहोस्',
    'Open': 'खोल्नुहोस्',
    'All caught up ✓': 'सबै सकियो ✓',
    'Drill target met ✓': 'अभ्यास लक्ष्य पूरा भयो ✓',
    'Target met ✓ — extra practice is optional': 'लक्ष्य पूरा भयो ✓ — थप अभ्यास ऐच्छिक',
    '{n} to go · about {m}': '{n} बाँकी · करिब {m}',
    '{n} question · spaced repetition': '{n} प्रश्न · दोहोर्याइएको अभ्यास',
    '{n} questions · spaced repetition': '{n} प्रश्न · दोहोर्याइएको अभ्यास',
    '{n} from your weak chapters': 'कमजोर अध्यायबाट {n}',

    /* ── chapter grid mastery filter (js/features/chapter-nav.js) ─ */
    'All': 'सबै',
    'Not started': 'सुरु नभएको',
    'Practising': 'अभ्यास भइरहेको',
    'Strong': 'बलियो',
    'Coming soon': 'छिट्टै आउँदै',
    'Filter chapters by mastery': 'दक्षता अनुसार अध्याय छान्नुहोस्',
    'Show all chapters': 'सबै अध्याय देखाउनुहोस्',
    'No chapters in this list yet.': 'यो सूचीमा अहिलेसम्म कुनै अध्याय छैन।',
    'Every chapter here is untouched. Pick one and start — your first answer moves it to Practising.':
      'यहाँका सबै अध्याय अझै सुरु भएका छैनन्। एउटा छानेर सुरु गर्नुहोस् — पहिलो उत्तरले यसलाई अभ्यास भइरहेको बनाउँछ।',
    'Nothing here yet. Work through a chapter and it joins this list.':
      'यहाँ अहिलेसम्म केही छैन। एउटा अध्याय पूरा गर्नुहोस्, त्यसपछि यो सूचीमा थपिन्छ।',
    'No strong chapters yet. Answer 85% or more of a chapter with nothing left in your wrong bank and it lands here.':
      'अहिलेसम्म कुनै बलियो अध्याय छैन। एउटा अध्यायको ८५% भन्दा बढी सही उत्तर दिनुहोस् र गलत बाँकी नरहनुहोस् — त्यसो भए यो यहाँ आउँछ।',
    'Ahead of schedule': 'तालिकाभन्दा अगाडि',
    'Behind schedule': 'तालिकाभन्दा पछाडि',
    'On track for exam day': 'परीक्षाको दिनसम्म ठीक बाटोमा',
    'Rest day': 'विश्राम दिन',
    'Nothing due': 'दोहोर्याउन केही बाँकी छैन',
    'You are all caught up for today.': 'आजको लागि सबै पूरा भयो।',
    'No new questions today. The plan has spread them over the other days.': 'आज नयाँ प्रश्न छैनन्। योजनाले तिनलाई अन्य दिनमा बाँडेको छ।',
    'Chapters appear here once your syllabus is counted.': 'पाठ्यक्रम गणना भएपछि अध्यायहरू यहाँ देखिन्छन्।',
    'Your daily reports appear here after your first day.': 'पहिलो दिनपछि तपाईंको दैनिक रिपोर्ट यहाँ देखिन्छ।',
    'No rest days planned.': 'कुनै विश्राम दिन तय गरिएको छैन।',
    'Nothing due for review right now 🎉': 'अहिले दोहोर्याउन केही बाँकी छैन 🎉',
    'Report copied. Paste it anywhere to share.': 'रिपोर्ट कपी भयो। जहाँसुकै टाँसेर साझा गर्नुहोस्।',
    'Pick a date first.': 'पहिले मिति छान्नुहोस्।',
    'Pick a date after today.': 'आजपछिको मिति छान्नुहोस्।',
    'Pick a valid exam date.': 'मान्य परीक्षा मिति छान्नुहोस्।',
    'That is too far away.': 'त्यो मिति धेरै टाढा छ।',
    'Exam date saved. Your plan has been re-spread.': 'परीक्षा मिति सुरक्षित भयो। तपाईंको योजना पुनः बाँडिएको छ।',
    'Syllabus counted. Your daily plan is ready.': 'पाठ्यक्रम गणना भयो। तपाईंको दैनिक योजना तयार छ।',
    'Count your syllabus first so a mock can be built.': 'मक बनाउन पहिले पाठ्यक्रम गणना गर्नुहोस्।',
    'Building your mock test…': 'तपाईंको मक परीक्षा बनाउँदै…',
    'Could not build a mock. Check your connection and try again.': 'मक बनाउन सकिएन। इन्टरनेट जाँचेर फेरि प्रयास गर्नुहोस्।',
    'Could not copy. Select the report and copy it manually.': 'कपी गर्न सकिएन। रिपोर्ट छानेर आफैँ कपी गर्नुहोस्।',
    'Could not load this set. Open it once while online, then it works offline.': 'यो सेट लोड गर्न सकिएन। एकपटक अनलाइन हुँदा खोल्नुहोस्, त्यसपछि अफलाइन पनि चल्छ।',
    'That set is not available.': 'त्यो सेट उपलब्ध छैन।',
    'Nothing new is left in this set.': 'यो सेटमा अब नयाँ केही बाँकी छैन।',
    'Opening today’s questions…': 'आजका प्रश्नहरू खोल्दै…',
    'Every Level 7 and GK question has been seen.': 'लेभल ७ र सामान्य ज्ञानका सबै प्रश्न हेरिसकियो।',
    'Every Level 7 and GK question has been seen. Time to sharpen.': 'लेभल ७ र सामान्य ज्ञानका सबै प्रश्न हेरिसकियो। अब अभ्यास तिखार्ने बेला।',
    'Your drill appears once you have a few missed questions. Keep practising.': 'केही गलत प्रश्न भएपछि तपाईंको ड्रिल देखिन्छ। अभ्यास जारी राख्नुहोस्।',
    'Nothing scheduled yet.': 'अहिलेसम्म केही तालिकामा छैन।',
    'Set up your syllabus': 'पाठ्यक्रम सेटअप गर्नुहोस्',
    'Set up': 'सेटअप',
    'Set up your syllabus to get daily chapters': 'दैनिक अध्यायहरू पाउन पाठ्यक्रम सेटअप गर्नुहोस्',
    'Count the questions so every chapter gets a day': 'हरेक अध्यायले आफ्नो दिन पाओस् भनेर प्रश्न गणना गर्नुहोस्',
    'Connect to the internet once to count your syllabus.': 'पाठ्यक्रम गणना गर्न एकपटक इन्टरनेटमा जोडिनुहोस्।',
    'Syllabus complete': 'पाठ्यक्रम पूरा',
    'Syllabus still unfinished': 'पाठ्यक्रम अझै अधुरो',
    'Needs the most work': 'सबैभन्दा बढी मेहनत चाहिने',
    'In progress': 'जारी छ',
    'No practice': 'अभ्यास भएन',
    'Not used': 'प्रयोग भएन',
    'Starts after your first session': 'पहिलो सत्रपछि सुरु हुन्छ',
    'Mock test': 'मक परीक्षा',
    'Timed mock test': 'समयबद्ध मक परीक्षा',
    'Sprint mock test': 'स्प्रिन्ट मक परीक्षा',
    'Drill your weak spots': 'कमजोर क्षेत्रमा अभ्यास गर्नुहोस्',
    'New questions for today': 'आजका नयाँ प्रश्नहरू',
    'Resets at midnight': 'मध्यरातमा रिसेट हुन्छ',
    'Today is a rest day. The other days carry a little more.': 'आज विश्राम दिन हो। अन्य दिनमा अलि बढी पर्छ।',
    'none due ✓': 'दोहोर्याउन बाँकी छैन ✓',
    'Counting your syllabus…': 'पाठ्यक्रम गणना गर्दै…',
    'Count now': 'अहिले गणना गर्नुहोस्',
    'Sprint grade': 'स्प्रिन्ट ग्रेड',
    'Active days': 'सक्रिय दिन',
    'All covered — raise accuracy to 85%': 'सबै समेटियो — शुद्धता ८५% पुर्‍याउनुहोस्',
    'Accuracy goal': 'शुद्धता लक्ष्य',
    'No accuracy data yet': 'अहिलेसम्म शुद्धताको तथ्याङ्क छैन',
    'Accuracy is {a}%. Bring every chapter to {g}% to finish.': 'शुद्धता {a}% छ। सिध्याउन हरेक अध्याय {g}% पुर्‍याउनुहोस्।'
  };

  const DICTS = { en: null, ne: NE };

  function storedLang() {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (v === 'en' || v === 'ne') return v;
    } catch (e) {}
    return null;
  }

  function detectLang() {
    const saved = storedLang();
    if (saved) return saved;
    try {
      const nav = String(navigator.language || '');
      if (/^ne\b/i.test(nav)) return 'ne';
    } catch (e) {}
    return 'en';
  }

  function applyDocumentLang(lang) {
    try { document.documentElement.setAttribute('lang', lang === 'ne' ? 'ne-NP' : 'en-NP'); } catch (e) {}
  }

  const I18N = {
    LANGS,
    lang: 'en',

    t(key, vars) {
      const dict = DICTS[this.lang];
      let out = (dict && dict[key]) || key;
      if (vars) {
        out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
      }
      return out;
    },

    /* Translate the current DOM. Safe to call repeatedly: the English text
       of each node is snapshotted on the first pass, so switching back to
       English restores the original markup instead of the translation. */
    applyStatic(root) {
      const scope = root || document;
      scope.querySelectorAll('[data-i18n]').forEach(el => {
        if (el.dataset.i18nSrc == null) el.dataset.i18nSrc = el.textContent;
        const english = el.getAttribute('data-i18n') || el.dataset.i18nSrc;
        el.textContent = this.t(english);
      });
      scope.querySelectorAll('[data-i18n-ph]').forEach(el => {
        if (el.dataset.i18nPhSrc == null) el.dataset.i18nPhSrc = el.getAttribute('placeholder') || '';
        el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-ph') || el.dataset.i18nPhSrc));
      });
      scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
        if (el.dataset.i18nAriaSrc == null) el.dataset.i18nAriaSrc = el.getAttribute('aria-label') || '';
        el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria') || el.dataset.i18nAriaSrc));
      });
      scope.querySelectorAll('[data-i18n-title]').forEach(el => {
        const src = el.getAttribute('data-i18n-title');
        if (src) el.setAttribute('title', this.t(src));
      });
      /* The switcher always names the language you would switch TO. */
      document.querySelectorAll('[data-lang-label]').forEach(el => {
        const to = this.lang === 'ne' ? 'en' : 'ne';
        el.textContent = LANGS[to];
        el.setAttribute('lang', to);   /* screen readers pronounce the label in its own language */
      });
    },

    setLang(lang, opts) {
      const next = lang === 'ne' ? 'ne' : 'en';
      this.lang = next;
      try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
      applyDocumentLang(next);
      this.applyStatic(document);
      /* Navigation is built from English data on purpose — re-render it so
         the sidebar, page headers and phone sheet follow the switch. */
      try { if (window.NAV) { NAV.renderSidebar(); NAV.renderHeads(); } } catch (e) {}
      try {
        document.dispatchEvent(new CustomEvent('abhyas:lang', { detail: { lang: next } }));
      } catch (e) {}
      if (!(opts && opts.silent) && typeof toast === 'function') {
        toast(next === 'ne' ? 'भाषा नेपालीमा बदलियो' : 'Language set to English');
      }
      return next;
    },

    toggleLang() {
      return this.setLang(this.lang === 'ne' ? 'en' : 'ne');
    }
  };

  I18N.lang = detectLang();
  applyDocumentLang(I18N.lang);

  window.I18N = I18N;

  function boot() { I18N.applyStatic(document); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
