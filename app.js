// 1. App State & Configurations
let currentLang = 'uk';

// Single shared "is something speaking right now" lock. Kids (this is a
// children's product!) mash buttons — without this, tapping "Слухати",
// "Послухати", the repeat button, and the avatar itself in quick
// succession would start several overlapping audio/video tracks at once.
// Every voice-triggering action checks this first and quietly ignores the
// tap if something is already playing, instead of stacking sounds.
let isVoicePlaying = false;
let currentCharacter = 'human'; // 'human' maps to Оксана
let isRecording = false;
let recordTimer = null;
let progressChart = null;
let parentVerified = sessionStorage.getItem('slovahoj_kids_parent_verified') === 'true'; // Flag for parent cabinet authorization

function setParentVerified(val) {
    parentVerified = val;
    sessionStorage.setItem('slovahoj_kids_parent_verified', val ? 'true' : 'false');
}

// --- Single Active Session Lock (anti resale/sharing) -----------------
// Whenever someone successfully enters a parent or child PIN (or just
// registered), we "claim" a fresh session token from the server. If a PIN
// gets shared with a second family, their login overwrites the token and
// the first device gets signed out automatically within ~25s, the next
// time it polls. This does NOT block two of your OWN devices used one at
// a time (logging in again on any device just reclaims the session), only
// truly simultaneous use from two places.
let sessionLockToken = localStorage.getItem('slovahoj_kids_session_token') || null;
let sessionPollInterval = null;

async function claimActiveSession() {
    const email = (currentUserEmail || '').trim();
    if (!email) return;
    try {
        const response = await fetch('/api/session-claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (response.ok) {
            const data = await response.json();
            sessionLockToken = data.token;
            localStorage.setItem('slovahoj_kids_session_token', sessionLockToken);
            startSessionPolling();
        }
    } catch (e) {
        console.warn('Failed to claim active session:', e);
    }
}

function startSessionPolling() {
    if (sessionPollInterval) return; // already polling
    sessionPollInterval = setInterval(async () => {
        const email = (currentUserEmail || '').trim();
        if (!email || !sessionLockToken) return;
        try {
            const response = await fetch(`/api/session-check?email=${encodeURIComponent(email)}&token=${encodeURIComponent(sessionLockToken)}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.enforced && !data.valid) {
                handleSessionTakenOver();
            }
        } catch (e) {
            // Network hiccup — don't sign the family out over a blip.
        }
    }, 25000);
}

function stopSessionPolling() {
    if (sessionPollInterval) {
        clearInterval(sessionPollInterval);
        sessionPollInterval = null;
    }
}

function handleSessionTakenOver() {
    stopSessionPolling();
    childAuthenticated = false;
    sessionStorage.setItem('slovahoj_kids_child_authenticated', 'false');
    setParentVerified(false);
    localStorage.removeItem('slovahoj_kids_session_token');
    sessionLockToken = null;
    alert(currentLang === 'uk'
        ? "Хтось інший увійшов у цей акаунт на іншому пристрої. Ваш доступ тут завершено. Якщо це не ви — рекомендуємо змінити ПІН-коди в кабінеті."
        : "Кто-то другой вошёл в этот аккаунт на другом устройстве. Ваш доступ здесь завершён. Если это были не вы — рекомендуем сменить ПИН-коды в кабинете.");
    switchView('playground');
    if (typeof updateAuthHeaderUI === 'function') updateAuthHeaderUI();
    if (typeof updateDropdownLockState === 'function') updateDropdownLockState();
}
// ------------------------------------------------------------------------

// Curriculum progression states
let currentMonth = 1;
let currentWeek = 1;
let currentLessonDay = 1;
let currentTrack = localStorage.getItem('slovahoj_kids_child_track') || 'junior'; // 'junior', 'middle', 'senior'
let currentScenario = 1;

// Scenario completion is tracked PER LESSON (track + month + week), not globally,
// so switching lessons always starts fresh and revisiting a lesson keeps its own progress.
const scenarioProgressStorageKey = 'slovahoj_kids_scenario_progress_by_lesson';
let scenarioProgressMap = {};
try {
    const storedProgress = localStorage.getItem(scenarioProgressStorageKey);
    if (storedProgress) {
        const parsedProgress = JSON.parse(storedProgress);
        if (parsedProgress && typeof parsedProgress === 'object') {
            scenarioProgressMap = parsedProgress;
        }
    }
} catch (e) {
    console.warn("Error parsing scenario progress map, using default.", e);
}

function getLessonProgressKey(track, month, week, day) {
    return `${track || currentTrack}-${month || currentMonth}-${week || currentWeek}-${day || currentLessonDay}`;
}

let completedScenarios = scenarioProgressMap[getLessonProgressKey()] || [];

function loadCompletedScenariosForCurrentLesson() {
    completedScenarios = scenarioProgressMap[getLessonProgressKey()] || [];
    updateScenarioButtonProgress();
}

// Child-facing visual progress cues on the 5 scenario icons: a green
// checkmark on completed ones, and a gentle pulsing highlight on the next
// one to try — so a child (or a confused adult!) always has something
// concrete to look at, instead of only a one-time chat message.
function updateScenarioButtonProgress() {
    let nextHintAssigned = false;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`scenario-btn-${i}`);
        if (!btn) continue;
        const done = completedScenarios.includes(i);

        btn.classList.toggle('scenario-done', done);
        let badge = btn.querySelector('.scenario-done-badge');
        if (done && !badge) {
            badge = document.createElement('span');
            badge.className = 'scenario-done-badge';
            badge.innerHTML = '<i class="fa-solid fa-check"></i>';
            btn.appendChild(badge);
        } else if (!done && badge) {
            badge.remove();
        }

        const isNext = !done && !nextHintAssigned;
        btn.classList.toggle('scenario-next-hint', isNext);
        if (isNext) nextHintAssigned = true;
    }

    const counterEl = document.getElementById('scenario-progress-counter');
    if (counterEl) {
        const doneCount = [1, 2, 3, 4, 5].filter(x => completedScenarios.includes(x)).length;
        counterEl.innerText = currentLang === 'uk' ? `${doneCount}/5 виконано` : `${doneCount}/5 выполнено`;
    }
}
window.updateScenarioButtonProgress = updateScenarioButtonProgress;

function saveCompletedScenarios() {
    try {
        scenarioProgressMap[getLessonProgressKey()] = completedScenarios;
        localStorage.setItem(scenarioProgressStorageKey, JSON.stringify(scenarioProgressMap));
    } catch (e) {
        console.warn("Error saving completed scenarios:", e);
    }
}
let envKeys = null;
let currentLevel = 1;
let isSimulatedSpeech = false;

let initialLoadDone = false;
let firstActionTriggered = false;
let greetingPlayed = false;

// Progress tracking state variables
let maxUnlockedMonth = parseInt(localStorage.getItem('slovahoj_kids_max_month')) || 1;
let maxUnlockedWeek = parseInt(localStorage.getItem('slovahoj_kids_max_week')) || 1;
let maxUnlockedDay = parseInt(localStorage.getItem('slovahoj_kids_max_day')) || 1;

let dropdownSeqStep = 0; // 0: inactive, 1: month blinking, 2: week blinking, 3: day blinking, 4: confirm blinking

function saveProgressState() {
    localStorage.setItem('slovahoj_kids_max_month', maxUnlockedMonth.toString());
    localStorage.setItem('slovahoj_kids_max_week', maxUnlockedWeek.toString());
    localStorage.setItem('slovahoj_kids_max_day', maxUnlockedDay.toString());
}

function updateDropdownLockState() {
    const monthSelect = document.getElementById('month-select');
    const weekSelect = document.getElementById('week-select');
    const lessonSelect = document.getElementById('lesson-select');

    if (monthSelect) {
        Array.from(monthSelect.options).forEach(opt => {
            const m = parseInt(opt.value);
            const isLocked = m > maxUnlockedMonth;
            opt.disabled = isLocked;
            let text = opt.text.replace(/ 🔒/g, '');
            opt.text = isLocked ? text + ' 🔒' : text;
        });
    }

    if (weekSelect) {
        Array.from(weekSelect.options).forEach(opt => {
            const w = parseInt(opt.value);
            let isLocked = false;
            if (currentMonth > maxUnlockedMonth) {
                isLocked = true;
            } else if (currentMonth === maxUnlockedMonth) {
                isLocked = w > maxUnlockedWeek;
            }
            opt.disabled = isLocked;
            let text = opt.text.replace(/ 🔒/g, '');
            opt.text = isLocked ? text + ' 🔒' : text;
        });
    }

    if (lessonSelect) {
        Array.from(lessonSelect.options).forEach(opt => {
            const d = parseInt(opt.value);
            let isLocked = false;
            if (currentMonth > maxUnlockedMonth) {
                isLocked = true;
            } else if (currentMonth === maxUnlockedMonth) {
                if (currentWeek > maxUnlockedWeek) {
                    isLocked = true;
                } else if (currentWeek === maxUnlockedWeek) {
                    isLocked = d > maxUnlockedDay;
                }
            }
            opt.disabled = isLocked;
            let text = opt.text.replace(/ 🔒/g, '');
            opt.text = isLocked ? text + ' 🔒' : text;
        });
    }
}

function advanceLessonProgress() {
    if (currentMonth === maxUnlockedMonth && currentWeek === maxUnlockedWeek && currentLessonDay === maxUnlockedDay) {
        if (maxUnlockedDay < 3) {
            maxUnlockedDay++;
        } else {
            maxUnlockedDay = 1;
            if (maxUnlockedWeek < 4) {
                maxUnlockedWeek++;
            } else {
                maxUnlockedWeek = 1;
                if (maxUnlockedMonth < 12) {
                    maxUnlockedMonth++;
                }
            }
        }
        saveProgressState();
    }
    updateDropdownLockState();
}

function startDropdownSequence() {
    dropdownSeqStep = 1;
    resetDropdownStyles();
    const monthSelect = document.getElementById('month-select');
    if (monthSelect) {
        monthSelect.classList.add('blinking-dropdown');
    }
}

function resetDropdownStyles() {
    ['month-select', 'week-select', 'lesson-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('blinking-dropdown', 'selected-dropdown-green');
        }
    });
    const btn = document.getElementById('btn-confirm-lesson');
    if (btn) btn.classList.remove('blinking-btn');
}

function playGreetingVideo() {
    greetingPlayed = true;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    // Play Oksana's greeting video clip (reaction_greeting.mp4) via FSM
    if (typeof transitionAvatarStateTo === 'function') {
        transitionAvatarStateTo(AvatarState.SPEAKING, './videos/reaction_greeting.mp4');
    } else {
        updateAvatarState('greeting');
    }
}

// Explicit, always-visible "Повторити" button — replays Oksana's current
// phrase/video as many times as needed. Before this, the only way to hear
// it again was an undiscoverable click on the avatar itself; a parent or
// child had no visible way to know that worked.
function repeatCurrentPhrase() {
    const video = document.getElementById('heygen-video');
    if (video && video.getAttribute('data-state') !== 'idle') {
        safePlayVideo(video, false);
    } else if (lessonModeActive) {
        // Video is (unexpectedly) idle during an active lesson — re-render
        // the current combination so a real video loads before playing.
        onCombinationChange(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario, true);
    }
}
window.repeatCurrentPhrase = repeatCurrentPhrase;

function handleUserInteraction() {
    if (!lessonModeActive) {
        playGreetingVideo();
        return false;
    }
    // During an active lesson, clicking Oksana replays the current
    // phrase/video from the start — the child (or a parent who missed it)
    // doesn't need to redo anything to hear it again. Reuses the same
    // logic as the explicit "Повторити фразу" button (including its
    // fallback for when the video has already reverted to idle by the
    // time someone clicks/taps).
    repeatCurrentPhrase();
    return true;
}

// Bilingual Hybrid Speech Engine: Segments Ukrainian explanations and Slovak words
async function speakBilingualText(text, onStart, onEnd) {
    // See isVoicePlaying declaration near the top of this file: a single
    // shared lock so kids mashing "Слухати"/"Послухати"/repeat buttons
    // never trigger overlapping audio.
    if (isVoicePlaying) return;

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    const wrappedOnStart = () => {
        isVoicePlaying = true;
        setTimeout(() => { isVoicePlaying = false; }, 20000); // safety net
        if (onStart) onStart();
    };
    const wrappedOnEnd = () => {
        isVoicePlaying = false;
        if (onEnd) onEnd();
    };

    // Oksana's voice is generated server-side via /api/tts — the ElevenLabs
    // API key never touches the browser (a hardcoded fallback key used to
    // live right here in this function; that was a leak and has been
    // removed, see api/tts.js).
    try {
        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error('TTS proxy status: ' + res.status);
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        wrappedOnStart();
        audio.onended = wrappedOnEnd;
        audio.onerror = wrappedOnEnd;
        audio.play();
    } catch (e) {
        console.warn("Oksana voice (ElevenLabs) unavailable, falling back to browser voice:", e);
        fallbackWebSpeechBilingual(text, wrappedOnStart, wrappedOnEnd);
    }
}

function fallbackWebSpeechBilingual(text, onStart, onEnd) {
    const tokens = [];
    let currLang = null;
    let currChunk = "";

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isLatin = /[a-zA-ZáäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(char);
        const isCyrillic = /[а-яА-ЯііїїєєґҐёЁ]/.test(char);

        let charLang = currLang;
        if (isLatin) {
            charLang = 'sk-SK';
        } else if (isCyrillic) {
            charLang = currentLang === 'uk' ? 'uk-UA' : 'ru-RU';
        }

        if (!currLang) currLang = charLang || (currentLang === 'uk' ? 'uk-UA' : 'ru-RU');

        if (charLang && charLang !== currLang && isLatin !== (currLang === 'sk-SK')) {
            if (currChunk.trim()) {
                tokens.push({ text: currChunk, lang: currLang });
            }
            currChunk = char;
            currLang = charLang;
        } else {
            currChunk += char;
        }
    }
    if (currChunk.trim()) {
        tokens.push({ text: currChunk, lang: currLang });
    }

    const validTokens = tokens.filter(t => t.text.trim().length > 0);
    if (validTokens.length === 0) {
        if (onEnd) onEnd();
        return;
    }

    if (onStart) onStart();

    const voices = window.speechSynthesis.getVoices();
    const skVoice = voices.find(v => v.lang.startsWith('sk') || v.lang.startsWith('cs'));
    const ukVoice = voices.find(v => v.lang.startsWith('uk') || v.lang.startsWith('ru'));

    let finishedCount = 0;
    validTokens.forEach((token, idx) => {
        const utterance = new SpeechSynthesisUtterance(token.text);
        utterance.lang = token.lang;
        utterance.rate = token.lang === 'sk-SK' ? 0.82 : 0.88;
        utterance.pitch = 1.15;

        if (token.lang === 'sk-SK' && skVoice) {
            utterance.voice = skVoice;
        } else if (token.lang !== 'sk-SK' && ukVoice) {
            utterance.voice = ukVoice;
        }

        const handleDone = () => {
            finishedCount++;
            if (finishedCount === validTokens.length && onEnd) onEnd();
        };

        utterance.onend = handleDone;
        utterance.onerror = handleDone;

        window.speechSynthesis.speak(utterance);
    });
}

function playTipAudio() {
    const tipTextEl = document.getElementById('pronunciation-tip-text');
    if (!tipTextEl) return;
    const text = tipTextEl.innerText || tipTextEl.textContent;
    if (!text) return;

    const tipBox = document.getElementById('tip-box-clickable');

    speakBilingualText(
        text,
        () => { if (tipBox) tipBox.classList.add('playing'); },
        () => { if (tipBox) tipBox.classList.remove('playing'); }
    );
}

function playTaskAudio() {
    const titleEl = document.getElementById('current-task-title');
    const descEl = document.getElementById('current-task-desc');
    const scenarioLabelEl = document.getElementById('scenario-switcher-label');

    const titleText = titleEl ? (titleEl.innerText || titleEl.textContent) : '';
    const descText = descEl ? (descEl.innerText || descEl.textContent) : '';
    const scenarioLabelText = scenarioLabelEl ? (scenarioLabelEl.innerText || scenarioLabelEl.textContent) : '';

    const fullText = `${titleText}. ${descText}. ${scenarioLabelText}`;
    if (!fullText.trim()) return;

    const btn = document.getElementById('btn-read-task');

    speakBilingualText(
        fullText,
        () => { if (btn) btn.classList.add('playing'); },
        () => { if (btn) btn.classList.remove('playing'); }
    );
}

// Explicit global window bindings for inline HTML handlers
window.handleUserInteraction = handleUserInteraction;
window.playGreetingVideo = playGreetingVideo;
window.confirmLessonSelection = confirmLessonSelection;
window.openRegistrationModal = openRegistrationModal;
window.closeChildProtectionModal = closeChildProtectionModal;
window.updateAuthHeaderUI = updateAuthHeaderUI;
window.playTipAudio = playTipAudio;
window.playTaskAudio = playTaskAudio;

async function loadEnv() {
    if (envKeys) return envKeys;
    try {
        const response = await fetch('/api/keys');
        if (response.ok) {
            envKeys = await response.json();
            return envKeys;
        }
    } catch (e) {
        console.warn("Failed to load environment keys from /api/keys, trying fallback api/keys.js:", e);
    }
    try {
        const response = await fetch('api/keys.js');
        if (response.ok) {
            envKeys = await response.json();
            return envKeys;
        }
    } catch (e) {
        console.error("Failed to load environment keys:", e);
    }
    return null;
}

// Azure Speech now uses short-lived (~10 min) authorization tokens obtained
// from /api/speech-token, instead of sending the raw subscription key to
// the browser. The token is cached and refreshed a little before it expires.
let azureSpeechTokenCache = null; // { token, region, fetchedAt }
const AZURE_TOKEN_MAX_AGE_MS = 8 * 60 * 1000; // refresh after 8 minutes (token is valid ~10)

async function getAzureSpeechToken() {
    if (azureSpeechTokenCache && (Date.now() - azureSpeechTokenCache.fetchedAt) < AZURE_TOKEN_MAX_AGE_MS) {
        return azureSpeechTokenCache;
    }
    try {
        const response = await fetch('/api/speech-token');
        if (response.ok) {
            const data = await response.json();
            if (data && data.token && data.region) {
                azureSpeechTokenCache = { token: data.token, region: data.region, fetchedAt: Date.now() };
                return azureSpeechTokenCache;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch Azure Speech token from /api/speech-token:", e);
    }
    return null;
}

let currentUserEmail = localStorage.getItem('slovahoj_kids_email');
if (currentUserEmail === 'null' || currentUserEmail === 'undefined') currentUserEmail = null;

let parentPin = localStorage.getItem('slovahoj_kids_parent_pin');
if (parentPin === 'null' || parentPin === 'undefined') parentPin = null;

let childPin = localStorage.getItem('slovahoj_kids_child_pin');
if (childPin === 'null' || childPin === 'undefined') childPin = null;

let isRegistered = localStorage.getItem('slovahoj_kids_is_registered') === 'true';
let subscriptionType = localStorage.getItem('slovahoj_kids_sub_type') || 'none';
if (subscriptionType === 'null' || subscriptionType === 'undefined') subscriptionType = 'none';

let subscriptionStart = parseInt(localStorage.getItem('slovahoj_kids_sub_start')) || 0;
let subscriptionEnd = parseInt(localStorage.getItem('slovahoj_kids_sub_end')) || 0;
let childAuthenticated = sessionStorage.getItem('slovahoj_kids_child_authenticated') === 'true';

// Helper to check if subscription is valid
function isSubscriptionActive() {
    if (subscriptionType === 'none') return false;
    return Date.now() <= subscriptionEnd;
}

// Save authentication/subscription states
function saveSubState() {
    localStorage.setItem('slovahoj_kids_email', currentUserEmail);
    localStorage.setItem('slovahoj_kids_parent_pin', parentPin);
    localStorage.setItem('slovahoj_kids_child_pin', childPin);
    localStorage.setItem('slovahoj_kids_is_registered', isRegistered ? 'true' : 'false');
    localStorage.setItem('slovahoj_kids_sub_type', subscriptionType);
    localStorage.setItem('slovahoj_kids_sub_start', subscriptionStart.toString());
    localStorage.setItem('slovahoj_kids_sub_end', subscriptionEnd.toString());
    localStorage.setItem('slovahoj_kids_child_track', currentTrack);
}

// Full curriculum data database for Month 1 and 2, with metadata for Months 3-12
const curriculumCatalog = {
    1: {
        theme: "Перший місяць",
        weeks: {
            1: {
                days: {
                    1: {
                        topic: "Привіт і знайомство",
                        is_safety: false,
                        tracks: {
                            junior: {
                                phrase: "Ahoj!",
                                translation: "Привіт!",
                                words: ["Ahoj"],
                                hint: "Це слово підходить і вранці, і ввечері — універсальне!",
                                intro: "Ahoj! Ja som Oksana. Poďme sa spolu zahrať!",
                                scenarios: [
                                    { id: 1, title_icon: "🎈", title: { uk: "Зустрів нового друга на дитячому майданчику", ru: "Встретил нового друга на детской площадке" } },
                                    { id: 2, title_icon: "🐱", title: { uk: "Побачив сусідського кота і привітався жартома", ru: "Увидел соседского кота и поздоровался в шутку" } },
                                    { id: 3, title_icon: "🏫", title: { uk: "Зайшов до класу вранці", ru: "Вошел в класс утром" } },
                                    { id: 4, title_icon: "👩‍🏫", title: { uk: "Зустрів вчительку в коридорі", ru: "Встретил учительницу в коридоре" } }
                                ]
                            },
                            middle: {
                                phrase: "Ahoj! Ako sa voláš?",
                                translation: "Привіт! Як тебе звати?",
                                words: ["Ahoj", "Ako", "sa", "voláš"],
                                hint: "«Sa voláš» буквально означає «звешся» — так словаки питають ім'я.",
                                intro: "Ahoj! Ako sa voláš? Ja som Oksana.",
                                scenarios: [
                                    { id: 1, title_icon: "🏫", title: { uk: "Знайомство з новим однокласником у школі в Словаччині", ru: "Знакомство с новым одноклассником в школе в Словакии" } },
                                    { id: 2, title_icon: "🏕️", title: { uk: "Знайомство на дитячому таборі", ru: "Знакомство в детском лагере" } },
                                    { id: 3, title_icon: "🏘️", title: { uk: "Знайомство з сусідським хлопчиком/дівчинкою у дворі", ru: "Знакомство с соседским мальчиком/девочкой во дворе" } },
                                    { id: 4, title_icon: "🎂", title: { uk: "Знайомство з другом друга на дні народження", ru: "Знакомство с другом друга на дне рождения" } }
                                ]
                            },
                            senior: {
                                phrase: "Ahoj, ako sa voláš? Ja som Oksana. Odkiaľ si?",
                                translation: "Привіт, як тебе звати? Я — Оксана. Звідки ти?",
                                words: ["Ahoj", "ako sa voláš", "Ja som Oksana", "Odkiaľ si"],
                                hint: "«Odkiaľ si» — питання, яке відкриває розмову далі, добре запам'ятати для першого дня в новій школі.",
                                intro: "Ahoj, ako sa voláš? Ja som Oksana. Odkiaľ si?",
                                scenarios: [
                                    { id: 1, title_icon: "🏫", title: { uk: "Перший день у словацькій школі", ru: "Первый день в словацкой школе" } },
                                    { id: 2, title_icon: "⚽", title: { uk: "Знайомство з тренером спортивної секції", ru: "Знакомство с тренером спортивной секции" } },
                                    { id: 3, title_icon: "🏘️", title: { uk: "Знайомство з сусідами по під'їзду", ru: "Знакомство с соседями по подъезду" } },
                                    { id: 4, title_icon: "🍦", title: { uk: "Розмова в черзі за морозивом з ровесником", ru: "Разговор в очереди за мороженым со сверстником" } }
                                ]
                            }
                        },
                        mistake_or_joke: "Секунду, я сама трохи забула це слово. Навіть дорослі повторюють!"
                    },
                    2: {
                        topic: "Як справи",
                        is_safety: false,
                        tracks: {
                            junior: {
                                phrase: "Dobre, ďakujem.",
                                translation: "Добре, дякую.",
                                words: ["Dobre", "ďakujem"],
                                hint: "«Ďakujem» звучить схоже на «дякую» — легко запам'ятати!",
                                intro: "Ako sa máš? Ja som dnes veľmi šťastná!",
                                scenarios: [
                                    { id: 1, title_icon: "👩", title: { uk: "Відповідь мамі вранці", ru: "Ответ маме утром" } },
                                    { id: 2, title_icon: "👩‍🏫", title: { uk: "Відповідь вчительці", ru: "Ответ учительнице" } },
                                    { id: 3, title_icon: "👦", title: { uk: "Відповідь другові на майданчику", ru: "Ответ другу на площадке" } },
                                    { id: 4, title_icon: "👵", title: { uk: "Відповідь бабусі по телефону", ru: "Ответ бабушке по телефону" } }
                                ]
                            },
                            middle: {
                                phrase: "Ako sa máš? — Dobre, a ty?",
                                translation: "Як справи? — Добре, а ти?",
                                words: ["Ako sa máš", "Dobre", "a ty"],
                                hint: "Питання завжди можна повернути назад — «a ty?» ввічливо і природно.",
                                intro: "Ako sa máš dnes?",
                                scenarios: [
                                    { id: 1, title_icon: "🏫", title: { uk: "Розмова з однокласником на перерві", ru: "Разговор с одноклассником на перемене" } },
                                    { id: 2, title_icon: "⚽", title: { uk: "Розмова з тренером", ru: "Разговор с тренером" } },
                                    { id: 3, title_icon: "🏘️", title: { uk: "Розмова з сусідом на вулиці", ru: "Разговор с соседом на улице" } },
                                    { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Розмова з другом батьків", ru: "Разговор с другом родителей" } }
                                ]
                            },
                            senior: {
                                phrase: "Ako sa dnes máš? Bolo niečo zaujímavé v škole?",
                                translation: "Як справи сьогодні? Було щось цікаве в школі?",
                                words: ["Ako sa dnes máš", "Bolo niečo zaujímavé", "v škole"],
                                hint: "Додавання «dnes» (сьогодні) робить питання живішим, не формальним.",
                                intro: "Ako sa dnes máš? Bolo niečo zaujímavé v škole?",
                                scenarios: [
                                    { id: 1, title_icon: "🏫", title: { uk: "Розмова з однокласником після уроків", ru: "Разговор с одноклассником после уроков" } },
                                    { id: 2, title_icon: "🏠", title: { uk: "Розмова з господарями квартири", ru: "Разговор с хозяевами квартиры" } },
                                    { id: 3, title_icon: "🏋️", title: { uk: "Розмова з новим другом у спортзалі", ru: "Разговор с новым другом в спортзале" } },
                                    { id: 4, title_icon: "👩‍🏫", title: { uk: "Розмова з учителькою після канікул", ru: "Разговор с учительницей после каникул" } }
                                ]
                            }
                        },
                        mistake_or_joke: "Ой, здається, я переплутала порядок слів! Буває навіть у мене."
                    },
                    3: {
                        topic: "Прощання",
                        is_safety: false,
                        tracks: {
                            junior: {
                                phrase: "Dovidenia!",
                                translation: "До побачення!",
                                words: ["Dovidenia"],
                                hint: "Довге слово, але його можна «розбити»: До-ви-де-ня.",
                                intro: "Dovidenia, kamarát! Uvidíme sa nabudúce.",
                                scenarios: [
                                    { id: 1, title_icon: "👩‍🏫", title: { uk: "Прощання з вчителькою", ru: "Прощание с учительницей" } },
                                    { id: 2, title_icon: "👋", title: { uk: "Прощання з другом на майданчику", ru: "Прощание с другом на площадке" } },
                                    { id: 3, title_icon: "🚌", title: { uk: "Прощання з водієм автобуса", ru: "Прощание с водителем автобуса" } },
                                    { id: 4, title_icon: "🛒", title: { uk: "Прощання з продавчинею в магазині", ru: "Прощание с продавщицей в магазине" } }
                                ]
                            },
                            middle: {
                                phrase: "Maj sa pekne! Uvidíme sa zajtra.",
                                translation: "Гарного дня! Побачимось завтра.",
                                words: ["Maj sa pekne", "Uvidíme sa", "zajtra"],
                                hint: "«Maj sa pekne» — тепліше і живіше, ніж просто «до побачення».",
                                intro: "Maj sa pekne! Uvidíme sa zajtra.",
                                scenarios: [
                                    { id: 1, title_icon: "🏫", title: { uk: "Прощання з однокласниками після уроків", ru: "Прощание с одноклассниками после уроков" } },
                                    { id: 2, title_icon: "⚽", title: { uk: "Прощання з тренером", ru: "Прощание с тренером" } },
                                    { id: 3, title_icon: "🏘️", title: { uk: "Прощання з сусідами", ru: "Прощание с соседями" } },
                                    { id: 4, title_icon: "🎂", title: { uk: "Прощання після дня народження", ru: "Прощание после дня рождения" } }
                                ]
                            },
                            senior: {
                                phrase: "Bolo super sa s tebou porozprávať. Maj sa a čoskoro dopočutia!",
                                translation: "Було супер з тобою поспілкуватися. Бувай, до швидкого!",
                                words: ["Bolo super", "porozprávať", "Maj sa", "dopočutia"],
                                hint: "Ця фраза звучить природно навіть для дорослого — можна сміливо використовувати з новими друзями.",
                                intro: "Bolo super sa s tebou porozprávať!",
                                scenarios: [
                                    { id: 1, title_icon: "🏫", title: { uk: "Прощання після групового проєкту в школі", ru: "Прощание после группового проекта в школе" } },
                                    { id: 2, title_icon: "⚽", title: { uk: "Прощання після матчу/тренування", ru: "Прощание после матча/тренировки" } },
                                    { id: 3, title_icon: "🏘️", title: { uk: "Прощання з новим сусідом-ровесником", ru: "Прощание с новым соседом-ровесником" } },
                                    { id: 4, title_icon: "✈️", title: { uk: "Прощання в кінці подорожі", ru: "Прощание в конце путешествия" } }
                                ]
                            }
                        },
                        mistake_or_joke: "Хвилинку… а як це було? Ах так, згадала!"
                    }
                }
            },
            2: {
                days: {
                    1: {
                        topic: "Ввічлива відмова (безпека)",
                        is_safety: true,
                        tracks: {
                            junior: {
                                phrase: "Nie, ďakujem.",
                                translation: "Ні, дякую.",
                                words: ["Nie", "ďakujem"],
                                hint: "Це чарівна фраза. Вона працює в будь-якій країні і завжди ввічлива.",
                                intro: "Ak niekto neznámy niečo ponúka, povieš: Nie, ďakujem!",
                                scenarios: [
                                    { id: 1, title_icon: "🍬", title: { uk: "Незнайомець пропонує цукерку на вулиці", ru: "Незнакомец предлагает конфету на улице" } },
                                    { id: 2, title_icon: "🐶", title: { uk: "Незнайомець кличе подивитися цуценя за рогом", ru: "Незнакомец зовет посмотреть щенка за углом" } },
                                    { id: 3, title_icon: "🌳", title: { uk: "Хтось у парку пропонує піти «показати щось цікаве»", ru: "Кто-то в парке предлагает пойти «показать что-то интересное»" } },
                                    { id: 4, title_icon: "🚗", title: { uk: "Незнайома людина пропонує підвезти", ru: "Незнакомый человек предлагает подвезти" } }
                                ]
                            },
                            middle: {
                                phrase: "Nie, ďakujem. Musím ísť za mamou.",
                                translation: "Ні, дякую. Мені треба йти до мами.",
                                words: ["Nie, ďakujem", "Musím ísť", "za mamou"],
                                hint: "Додавання причини робить відмову природною і зрозумілою для будь-кого поруч.",
                                intro: "Vždy môžeš povedať: Nie, ďakujem. Musím ísť za mamou.",
                                scenarios: [
                                    { id: 1, title_icon: "🍬", title: { uk: "Незнайомець пропонує цукерку на вулиці", ru: "Незнакомец предлагает конфету на улице" } },
                                    { id: 2, title_icon: "🐶", title: { uk: "Незнайомець кличе подивитися цуценя за рогом", ru: "Незнакомец зовет посмотреть щенка за углом" } },
                                    { id: 3, title_icon: "🌳", title: { uk: "Хтось у парку пропонує піти «показати щось цікаве»", ru: "Кто-то в парке предлагает пойти «показать что-то интересное»" } },
                                    { id: 4, title_icon: "🚗", title: { uk: "Незнайома людина пропонує підвезти", ru: "Незнакомый человек предлагает подвезти" } }
                                ]
                            },
                            senior: {
                                phrase: "Prepáčte, nemám záujem. Idem za rodičmi, čakajú ma.",
                                translation: "Вибачте, мене це не цікавить. Я йду до батьків, вони на мене чекають.",
                                words: ["Prepáčte", "nemám záujem", "Idem za rodičmi", "čakajú ma"],
                                hint: "Ця фраза одразу дає зрозуміти — тебе чекають, ти не сам. Це працює як сигнал для будь-кого поруч.",
                                intro: "Prepáčte, nemám záujem. Idem za rodičmi, čakajú ma.",
                                scenarios: [
                                    { id: 1, title_icon: "💼", title: { uk: "Незнайомець на вулиці пропонує «легкий заробіток»", ru: "Незнакомец на улице предлагает «легкий заработок»" } },
                                    { id: 2, title_icon: "💻", title: { uk: "Хтось в інтернеті просить зустрітися особисто", ru: "Кто-то в интернете просит встретиться лично" } },
                                    { id: 3, title_icon: "🚌", title: { uk: "Незнайомець у громадському транспорті нав'язливо заговорює", ru: "Незнакомец в общественном транспорте навязчиво заговаривает" } },
                                    { id: 4, title_icon: "🚗", title: { uk: "Пропозиція «підвезти безкоштовно» біля школи", ru: "Предложение «подвезти бесплатно» возле школы" } }
                                ]
                            }
                        },
                        mistake_or_joke: null
                    },
                    2: {
                        topic: "Члени родини",
                        is_safety: false,
                        hint: {
                            uk: "«Mama» і «otec» означають «мама» і «тато», а «brat» і «sestra» — «брат» і «сестра»!",
                            ru: "«Mama» и «otec» означают «мама» и «папа», а «brat» и «sestra» — «брат» и «сестра»!"
                        },
                        tracks: {
                            junior: {
                                phrase: "Mama, otec, brat, sestra.",
                                translation: "Мама, тато, брат, сестра.",
                                words: ["Mama", "otec", "brat", "sestra"],
                                intro: "Ahoj! Dnes sa naučíme členov rodiny: mama, otec, brat a sestra."
                            },
                            middle: {
                                phrase: "To je moja mama a môj otec.",
                                translation: "Це моя мама і мій тато.",
                                words: ["To je", "moja mama", "môj otec"],
                                intro: "Predstavujem ti moju rodinu. To je moja mama a otec."
                            },
                            senior: {
                                phrase: "To je moja rodina — mama, otec, brat a sestra.",
                                translation: "Це моя сім'я — мама, тато, брат і сестра.",
                                words: ["To je", "rodina", "mama", "otec", "brat", "sestra"],
                                intro: "Ahoj! To je moja rodina — mama, otec, brat a sestra."
                            }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🖼️", title: { uk: "Показує сімейне фото другові", ru: "Показывает семейное фото другу" } },
                            { id: 2, title_icon: "👦", title: { uk: "Розповідає про родину новому однокласнику", ru: "Рассказывает о семье новому однокласснику" } },
                            { id: 3, title_icon: "🏡", title: { uk: "Знайомить родину з сусідами", ru: "Знакомит семью с соседями" } },
                            { id: 4, title_icon: "👵", title: { uk: "Розповідає бабусі по відеодзвінку", ru: "Рассказывает бабушке по видеозвонку" } }
                        ],
                        mistake_or_joke: "Ой-ой, зачекай, я відволіклася. Спробуємо ще раз разом?"
                    },
                    3: {
                        topic: "Мій дім",
                        is_safety: false,
                        hint: {
                            uk: "«Byt» — це «квартира», а «izba» — «кімната». «Toto je» означає «це є»!",
                            ru: "«Byt» — это «квартира», а «izba» — «комната». «Toto je» означает «это»!"
                        },
                        tracks: {
                            junior: {
                                phrase: "Toto je môj byt.",
                                translation: "Це моя квартира.",
                                words: ["Toto je", "môj byt"],
                                intro: "Ahoj! Toto je môj byt."
                            },
                            middle: {
                                phrase: "Toto je môj byt. Tu je moja izba.",
                                translation: "Це моя квартира. Тут моя кімната.",
                                words: ["Toto je", "môj byt", "Tu je", "moja izba"],
                                intro: "Ukážem ti môj byt. Tu je moja izba."
                            },
                            senior: {
                                phrase: "Toto je náš byt. Mám tu svoju izbu a tu je obývačka.",
                                translation: "Це наша квартира. Тут моя кімната, а тут вітальня.",
                                words: ["Toto je", "náš byt", "izbu", "obývačka"],
                                intro: "Toto je náš byt. Mám tu svoju izbu a tu je obývačka."
                            }
                        },
                        scenarios: [
                            { id: 1, title_icon: "📹", title: { uk: "Показує кімнату другу по відео", ru: "Показывает комнату другу по видео" } },
                            { id: 2, title_icon: "👵", title: { uk: "Розповідає про новий дім бабусі", ru: "Рассказывает о новом доме бабушке" } },
                            { id: 3, title_icon: "🏘️", title: { uk: "Пояснює сусідському хлопчику, де живе", ru: "Объясняет соседскому мальчику, где живет" } },
                            { id: 4, title_icon: "✏️", title: { uk: "Малює план квартири на уроці", ru: "Рисует план квартиры на уроке" } }
                        ],
                        mistake_or_joke: "Хочеш дізнатися хитрість? Найкращий спосіб запам'ятати слово — сказати його вголос тричі. Спробуємо?"
                    }
                }
            },
            3: {
                days: {
                    1: {
                        topic: "Речі вдома",
                        is_safety: false,
                        hint: {
                            uk: "Питальне слово «Kde» означає «де», а «hračka» — це «іграшка»!",
                            ru: "Вопросительное слово «Kde» означает «где», а «hračka» — это «игрушка»!"
                        },
                        tracks: {
                            junior: {
                                phrase: "Kde je moja hračka?",
                                translation: "Де моя іграшка?",
                                words: ["Kde je", "moja hračka"],
                                intro: "Kde je moja hračka? Hľadajme spolu!"
                            },
                            middle: {
                                phrase: "Kde je moja hračka? Tu je!",
                                translation: "Де моя іграшка? Ось вона!",
                                words: ["Kde je", "moja hračka", "Tu je"],
                                intro: "Kde je moja hračka? Tu je!"
                            },
                            senior: {
                                phrase: "Nemôžem nájsť svoju hračku. Ach, tu je, pod posteľou!",
                                translation: "Не можу знайти іграшку. Ах, ось вона, під ліжком!",
                                words: ["Nemôžem nájsť", "hračku", "pod posteľou"],
                                intro: "Nemôžem nájsť svoju hračku."
                            }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🧸", title: { uk: "Шукає іграшку вдома", ru: "Ищет игрушку дома" } },
                            { id: 2, title_icon: "🔍", title: { uk: "Питає, де річ у гостях", ru: "Спрашивает, где вещь в гостях" } },
                            { id: 3, title_icon: "👶", title: { uk: "Допомагає молодшому братику знайти річ", ru: "Помогает младшему брату найти вещь" } },
                            { id: 4, title_icon: "📖", title: { uk: "Питає вчительку, де його зошит", ru: "Спрашивает учительницу, где его тетрадь" } }
                        ],
                        mistake_or_joke: "А знаєш, чому мені подобається вчити тебе словацької? Бо разом веселіше, навіть коли помиляємось!"
                    },
                    2: {
                        topic: "🛡️ Безпека: особисті дані",
                        is_safety: true,
                        hint: {
                            uk: "«Moja adresa je tajomstvo» означає «Моя адреса — це секрет». Свою адресу можна казати тільки батькам!",
                            ru: "«Moja adresa je tajomstvo» означает «Мой адрес — это секрет». Свой адрес можно говорить только родителям!"
                        },
                        tracks: {
                            junior: {
                                phrase: "Moja adresa je tajomstvo.",
                                translation: "Моя адреса — це секрет.",
                                words: ["Moja adresa", "tajomstvo"],
                                intro: "Moja adresa je tajomstvo. Nikomu ju nehovor!"
                            },
                            middle: {
                                phrase: "Moja adresa je tajomstvo — vedia ju len rodičia.",
                                translation: "Моя адреса — секрет, її знають лише батьки.",
                                words: ["Moja adresa", "tajomstvo", "vedia", "rodičia"],
                                intro: "Povedz: Moja adresa je tajomstvo — vedia ju len rodičia."
                            },
                            senior: {
                                phrase: "Svoju adresu hovorím len rodičom alebo učiteľom, ktorých poznám.",
                                translation: "Свою адресу я кажу лише батькам або вчителям, яких знаю.",
                                words: ["Svoju adresu", "hovorím", "rodičom", "učiteľom", "poznám"],
                                intro: "Svoju adresu hovorím len rodičom alebo učiteľom, ktorých poznám."
                            }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🚶", title: { uk: "Незнайомець на вулиці питає адресу", ru: "Незнакомец на улице спрашивает адрес" } },
                            { id: 2, title_icon: "📞", title: { uk: "Дзвінок з невідомого номера питає, де живеш", ru: "Звонок с неизвестного номера спрашивает, где живешь" } },
                            { id: 3, title_icon: "🎮", title: { uk: "Онлайн-гра просить вказати адресу", ru: "Онлайн-игра просит указать адрес" } },
                            { id: 4, title_icon: "💻", title: { uk: "Новий друг в інтернеті просить адресу", ru: "Новый «друг» в интернете просит адрес" } }
                        ],
                        mistake_or_joke: null
                    },
                    3: {
                        topic: "У класі",
                        is_safety: false,
                        hint: {
                            uk: "Учителька — довге слово, розбий: у-чи-тель-ка.",
                            ru: "Учительница — длинное слово, разбей: у-чи-тель-ни-ца."
                        },
                        tracks: {
                            junior: { phrase: "Moja trieda.", translation: "Мій клас.", words: ["Moja", "trieda"], intro: "Toto je moja trieda!" },
                            middle: { phrase: "Toto je moja trieda. Toto je moja učiteľka.", translation: "Це мій клас. Це моя вчителька.", words: ["Toto je", "moja trieda", "Toto je", "moja učiteľka"], intro: "Toto je moja trieda. Toto je moja učiteľka." },
                            senior: { phrase: "Toto je moja trieda a moja nová učiteľka, teším sa na ňu.", translation: "Це мій клас і моя нова вчителька, я тішуся знайомству з нею.", words: ["Toto je moja trieda", "a moja nová učiteľka", "teším sa", "na ňu"], intro: "Toto je moja trieda a moja nová učiteľka." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🏫", title: { uk: "Перший день у новому класі", ru: "Первый день в новом классе" } },
                            { id: 2, title_icon: "👩‍🏫", title: { uk: "Знайомство з новою вчителькою", ru: "Знакомство с новой учительницей" } },
                            { id: 3, title_icon: "📝", title: { uk: "Показує клас другові", ru: "Показывает класс другу" } },
                            { id: 4, title_icon: "🖼️", title: { uk: "Малює свій клас удома", ru: "Рисует свой класс дома" } }
                        ],
                        mistake_or_joke: "Цей матеріал ще уточнюється — скоро тут буде повноцінний урок!"
                    }
                }
            },
            4: {
                days: {
                    1: {
                        topic: "Шкільні речі",
                        is_safety: false,
                        hint: {
                            uk: "«Potrebujem» означає «мені потрібно».",
                            ru: "«Potrebujem» означает «мне нужно»."
                        },
                        tracks: {
                            junior: { phrase: "Pero, zošit.", translation: "Ручка, зошит.", words: ["Pero", "zošit"], intro: "Potrebujem pero a zošit." },
                            middle: { phrase: "Potrebujem pero a zošit.", translation: "Мені потрібні ручка і зошит.", words: ["Potrebujem", "pero", "a", "zošit"], intro: "Potrebujem pero a zošit." },
                            senior: { phrase: "Potrebujem pero, zošit a učebnicu do školy.", translation: "Мені потрібні ручка, зошит і підручник до школи.", words: ["Potrebujem pero", "zošit", "a učebnicu", "do školy"], intro: "Potrebujem pero, zošit a učebnicu do školy." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🎒", title: { uk: "Збирає портфель зранку", ru: "Собирает портфель утром" } },
                            { id: 2, title_icon: "🖊️", title: { uk: "Просить ручку в однокласника", ru: "Просит ручку у одноклассника" } },
                            { id: 3, title_icon: "🛒", title: { uk: "Купує шкільне приладдя в магазині", ru: "Покупает школьные принадлежности в магазине" } },
                            { id: 4, title_icon: "📚", title: { uk: "Показує зошит учительці", ru: "Показывает тетрадь учительнице" } }
                        ],
                        mistake_or_joke: "Цей матеріал ще уточнюється — скоро тут буде повноцінний урок!"
                    },
                    2: {
                        topic: "Розклад та предмети",
                        is_safety: false,
                        hint: {
                            uk: "Telesná výchova — фізкультура.",
                            ru: "Telesná výchova — физкультура."
                        },
                        tracks: {
                            junior: { phrase: "Matematika, telocvik.", translation: "Математика, фізкультура.", words: ["Matematika", "telocvik"], intro: "Dnes mám matematiku a telocvik." },
                            middle: { phrase: "Dnes mám matematiku a telesnú výchovu.", translation: "Сьогодні у мене математика і фізкультура.", words: ["Dnes mám", "matematiku", "a telesnú", "výchovu"], intro: "Dnes mám matematiku a telesnú výchovu." },
                            senior: { phrase: "Dnes mám matematiku, telesnú výchovu a ešte dejepis.", translation: "Сьогодні у мене математика, фізкультура та ще історія.", words: ["Dnes mám matematiku", "telesnú výchovu", "a ešte", "dejepis"], intro: "Dnes mám matematiku, telesnú výchovu a ešte dejepis." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "📅", title: { uk: "Дивиться розклад уроків", ru: "Смотрит расписание уроков" } },
                            { id: 2, title_icon: "🧮", title: { uk: "Розповідає, який зараз урок", ru: "Рассказывает, какой сейчас урок" } },
                            { id: 3, title_icon: "🏃", title: { uk: "Готується до фізкультури", ru: "Готовится к физкультуре" } },
                            { id: 4, title_icon: "👩‍🏫", title: { uk: "Питає вчительку про розклад на завтра", ru: "Спрашивает учительницу про расписание на завтра" } }
                        ],
                        mistake_or_joke: "Цей матеріал ще уточнюється — скоро тут буде повноцінний урок!"
                    },
                    3: {
                        topic: "🛡️ Безпека: дорога до школи",
                        is_safety: true,
                        hint: {
                            uk: "Ніколи не йди з незнайомцями.",
                            ru: "Никогда не ходи с незнакомцами."
                        },
                        tracks: {
                            junior: { phrase: "Idem so susedom.", translation: "Йду з сусідом.", words: ["Idem", "so susedom"], intro: "Idem do školy so susedom, ktorého poznajú rodičia." },
                            middle: { phrase: "Idem do školy len s tým, koho poznajú moji rodičia.", translation: "Я йду до школи лише з тим, кого знають мої батьки.", words: ["Idem do školy", "len s tým", "koho poznajú", "moji rodičia"], intro: "Idem do školy len s tým, koho poznajú moji rodičia." },
                            senior: { phrase: "Cestu do školy si vždy volím s niekým, koho poznajú moji rodičia.", translation: "Дорогу до школи я завжди обираю з тим, кого знають мої батьки.", words: ["Cestu do školy", "si vždy volím", "s niekým", "koho poznajú moji rodičia"], intro: "Cestu do školy si vždy volím s niekým, koho poznajú moji rodičia." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🚸", title: { uk: "Йде до школи знайомою дорогою", ru: "Идёт в школу знакомой дорогой" } },
                            { id: 2, title_icon: "🚗", title: { uk: "Незнайомець пропонує підвезти до школи", ru: "Незнакомец предлагает подвезти до школы" } },
                            { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Домовляється з батьками про дорогу до школи", ru: "Договаривается с родителями о дороге в школу" } },
                            { id: 4, title_icon: "🛡️", title: { uk: "Пояснює правило другові", ru: "Объясняет правило другу" } }
                        ],
                        mistake_or_joke: null
                    }
                }
            }
        }
    },
    2: {
        theme: "Їжа, місто та транспорт",
        weeks: {
            1: {
                days: {
                    1: {
                        topic: "Улюблена їжа",
                        is_safety: false,
                        hint: {
                            uk: "«Mám rád» каже хлопчик, «Mám rada» — дівчинка. Різниця лише в одній літері!",
                            ru: "«Mám rád» говорит мальчик, «Mám rada» — девочка. Разница всего в одной букве!"
                        },
                        tracks: {
                            junior: { phrase: "Jablko, chlieb.", translation: "Яблуко, хліб.", words: ["Jablko", "chlieb"], intro: "Mám rád jablko a chlieb." },
                            middle: { phrase: "Mám rád/rada jablká a chlieb.", translation: "Я люблю яблука і хліб.", words: ["Mám rád/rada", "jablká", "a chlieb"], intro: "Mám rád jablká a chlieb." },
                            senior: { phrase: "Najradšej mám jablká a chlieb, ale skúšam aj nové jedlá.", translation: "Найбільше я люблю яблука і хліб, але пробую й нові страви.", words: ["Najradšej mám", "jablká a chlieb", "ale skúšam", "aj nové jedlá"], intro: "Najradšej mám jablká a chlieb." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🍎", title: { uk: "Обирає перекус у шкільній їдальні", ru: "Выбирает перекус в школьной столовой" } },
                            { id: 2, title_icon: "🧺", title: { uk: "Розповідає мамі, що любить їсти", ru: "Рассказывает маме, что любит есть" } },
                            { id: 3, title_icon: "🎒", title: { uk: "Ділиться перекусом з другом на перерві", ru: "Делится перекусом с другом на перемене" } },
                            { id: 4, title_icon: "🛒", title: { uk: "Обирає фрукти в магазині разом з мамою", ru: "Выбирает фрукты в магазине вместе с мамой" } }
                        ],
                        mistake_or_joke: "Ой, я щойно назвала хліб «яблуком»! Навіть Оксана іноді плутає слова."
                    },
                    2: {
                        topic: "За столом",
                        is_safety: false,
                        hint: {
                            uk: "«Prosím» підходить до будь-якого ввічливого прохання — запам'ятай це слово назавжди!",
                            ru: "«Prosím» подходит для любой вежливой просьбы — запомни это слово навсегда!"
                        },
                        tracks: {
                            junior: { phrase: "Vodu, prosím.", translation: "Води, будь ласка.", words: ["Vodu", "prosím"], intro: "Chcem vodu, prosím." },
                            middle: { phrase: "Prosím, môžem dostať vodu?", translation: "Будь ласка, можна мені води?", words: ["Prosím", "môžem dostať", "vodu"], intro: "Prosím, môžem dostať vodu?" },
                            senior: { phrase: "Prosím, môžem dostať pohár vody? Ďakujem pekne.", translation: "Будь ласка, можна мені склянку води? Дуже дякую.", words: ["Prosím", "môžem dostať", "pohár vody", "Ďakujem pekne"], intro: "Prosím, môžem dostať pohár vody?" }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🍽️", title: { uk: "Просить води за обіднім столом удома", ru: "Просит воды за обеденным столом дома" } },
                            { id: 2, title_icon: "🏫", title: { uk: "Просить води в шкільній їдальні", ru: "Просит воды в школьной столовой" } },
                            { id: 3, title_icon: "🎂", title: { uk: "Просить води на дні народження друга", ru: "Просит воды на дне рождения друга" } },
                            { id: 4, title_icon: "☕", title: { uk: "Просить води в гостях у сусідів", ru: "Просит воды в гостях у соседей" } }
                        ],
                        mistake_or_joke: "Секунду, я мало не сказала «пиво» замість «вода»! Дуже схожі слова, будь обережний."
                    },
                    3: {
                        topic: "Свята кухня",
                        is_safety: false,
                        hint: {
                            uk: "«Voňa výborne» — чудово пахне. Гарна фраза, щоб зробити комплімент кухарю!",
                            ru: "«Voňa výborne» — чудесно пахнет. Хорошая фраза, чтобы сделать комплимент повару!"
                        },
                        tracks: {
                            junior: { phrase: "Voňa dobre!", translation: "Пахне добре!", words: ["Voňa", "dobre"], intro: "Mmm, to voňa dobre!" },
                            middle: { phrase: "Toto voňa výborne! Čo je to?", translation: "Це чудово пахне! Що це таке?", words: ["Toto voňa", "výborne", "Čo je to"], intro: "Toto voňa výborne! Čo je to?" },
                            senior: { phrase: "Toto voňa naozaj výborne, čo si to uvarila?", translation: "Це справді чудово пахне, що ти приготувала?", words: ["Toto voňa", "naozaj výborne", "čo si to", "uvarila"], intro: "Toto voňa naozaj výborne!" }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🍲", title: { uk: "Заходить на кухню, де готують святкову вечерю", ru: "Заходит на кухню, где готовят праздничный ужин" } },
                            { id: 2, title_icon: "🎄", title: { uk: "Куштує страву на святковому ярмарку", ru: "Пробует блюдо на праздничной ярмарке" } },
                            { id: 3, title_icon: "👵", title: { uk: "Хвалить страву бабусі-словачки", ru: "Хвалит блюдо словацкой бабушке" } },
                            { id: 4, title_icon: "🏠", title: { uk: "Приходить у гості й нюхає щось смачне", ru: "Приходит в гости и чувствует вкусный запах" } }
                        ],
                        mistake_or_joke: "Хвилинку, я так захопилась запахом, що забула слово! Зараз згадаю."
                    }
                }
            },
            2: {
                days: {
                    1: {
                        topic: "🛡️ Безпека: частування від чужих",
                        is_safety: true,
                        hint: {
                            uk: "Головне правило: солодощі й частування бере лише від людей, яких знають батьки.",
                            ru: "Главное правило: сладости и угощения берём только от людей, которых знают родители."
                        },
                        tracks: {
                            junior: { phrase: "Nie, ďakujem.", translation: "Ні, дякую.", words: ["Nie", "ďakujem"], intro: "Nie, ďakujem, neberiem to." },
                            middle: { phrase: "Neberiem sladkosti od cudzích ľudí.", translation: "Я не беру солодощі від незнайомих людей.", words: ["Neberiem", "sladkosti", "od cudzích", "ľudí"], intro: "Neberiem sladkosti od cudzích ľudí." },
                            senior: { phrase: "Sladkosti neberiem od nikoho, koho nepoznajú moji rodičia.", translation: "Я не беру солодощі від нікого, кого не знають мої батьки.", words: ["Sladkosti neberiem", "od nikoho", "koho nepoznajú", "moji rodičia"], intro: "Sladkosti neberiem od nikoho, koho nepoznajú moji rodičia." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🍬", title: { uk: "Незнайомець пропонує цукерку на вулиці", ru: "Незнакомец предлагает конфету на улице" } },
                            { id: 2, title_icon: "🎪", title: { uk: "Хтось незнайомий частує на ярмарку", ru: "Кто-то незнакомый угощает на ярмарке" } },
                            { id: 3, title_icon: "🚪", title: { uk: "Дзвонять у двері з подарунком для «дитини»", ru: "Звонят в дверь с подарком для «ребёнка»" } },
                            { id: 4, title_icon: "🏞️", title: { uk: "На дитячому майданчику пропонують морозиво", ru: "На детской площадке предлагают мороженое" } }
                        ],
                        mistake_or_joke: null
                    },
                    2: {
                        topic: "У місті",
                        is_safety: false,
                        hint: {
                            uk: "«Najbližší» означає «найближчий» — корисне слово, коли щось шукаєш у місті.",
                            ru: "«Najbližší» означает «ближайший» — полезное слово, когда что-то ищешь в городе."
                        },
                        tracks: {
                            junior: { phrase: "Kde je obchod?", translation: "Де магазин?", words: ["Kde je", "obchod"], intro: "Kde je tu obchod?" },
                            middle: { phrase: "Kde je najbližší obchod?", translation: "Де найближчий магазин?", words: ["Kde je", "najbližší", "obchod"], intro: "Kde je najbližší obchod?" },
                            senior: { phrase: "Prepáčte, viete mi povedať, kde je najbližší obchod?", translation: "Перепрошую, ви можете сказати, де найближчий магазин?", words: ["Prepáčte", "viete mi povedať", "kde je", "najbližší obchod"], intro: "Prepáčte, viete mi povedať, kde je najbližší obchod?" }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🚶", title: { uk: "Питає перехожого дорогу до магазину", ru: "Спрашивает прохожего дорогу до магазина" } },
                            { id: 2, title_icon: "🏙️", title: { uk: "Гуляє новим містом з батьками", ru: "Гуляет по новому городу с родителями" } },
                            { id: 3, title_icon: "🏪", title: { uk: "Шукає крамницю з улюбленими солодощами", ru: "Ищет магазин с любимыми сладостями" } },
                            { id: 4, title_icon: "🗺️", title: { uk: "Дивиться на карту міста разом з татом", ru: "Смотрит на карту города вместе с папой" } }
                        ],
                        mistake_or_joke: "Ой, я показала не в той бік! Навіть я іноді плутаю ліво і право."
                    },
                    3: {
                        topic: "Транспорт",
                        is_safety: false,
                        hint: {
                            uk: "«Autobus» звучить майже як українською — легко запам'ятати!",
                            ru: "«Autobus» звучит почти как по-русски — легко запомнить!"
                        },
                        tracks: {
                            junior: { phrase: "Autobus do centra?", translation: "Автобус до центру?", words: ["Autobus", "do centra"], intro: "Tento autobus ide do centra?" },
                            middle: { phrase: "Tento autobus ide do centra?", translation: "Цей автобус їде до центру?", words: ["Tento autobus", "ide", "do centra"], intro: "Tento autobus ide do centra?" },
                            senior: { phrase: "Prepáčte, ide tento autobus smerom do centra mesta?", translation: "Перепрошую, цей автобус їде у напрямку центру міста?", words: ["Prepáčte", "ide tento autobus", "smerom", "do centra mesta"], intro: "Prepáčte, ide tento autobus smerom do centra mesta?" }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🚌", title: { uk: "Питає водія автобуса, чи їде він у центр", ru: "Спрашивает водителя автобуса, едет ли он в центр" } },
                            { id: 2, title_icon: "🚏", title: { uk: "Чекає на зупинці разом з мамою", ru: "Ждёт на остановке вместе с мамой" } },
                            { id: 3, title_icon: "🚋", title: { uk: "Уточнює маршрут трамвая у пасажира", ru: "Уточняет маршрут трамвая у пассажира" } },
                            { id: 4, title_icon: "🎫", title: { uk: "Купує квиток на автобус у автоматі", ru: "Покупает билет на автобус в автомате" } }
                        ],
                        mistake_or_joke: "Стривай, це ж не той автобус! Добре, що я вмію перепитати."
                    }
                }
            },
            3: {
                days: {
                    1: {
                        topic: "Орієнтування в місті",
                        is_safety: false,
                        hint: {
                            uk: "«Námestie» — площа. Важливе слово для орієнтування в будь-якому словацькому місті.",
                            ru: "«Námestie» — площадь. Важное слово для ориентирования в любом словацком городе."
                        },
                        tracks: {
                            junior: { phrase: "Kde je námestie?", translation: "Де площа?", words: ["Kde je", "námestie"], intro: "Kde je tu námestie?" },
                            middle: { phrase: "Prepáčte, ako sa dostanem na námestie?", translation: "Перепрошую, як мені дістатися до площі?", words: ["Prepáčte", "ako sa dostanem", "na námestie"], intro: "Ako sa dostanem na námestie?" },
                            senior: { phrase: "Prepáčte, mohli by ste mi ukázať cestu na hlavné námestie?", translation: "Перепрошую, ви могли б показати мені дорогу до головної площі?", words: ["Prepáčte", "mohli by ste", "mi ukázať cestu", "na hlavné námestie"], intro: "Mohli by ste mi ukázať cestu na hlavné námestie?" }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🧭", title: { uk: "Питає дорогу до площі в туристичному центрі", ru: "Спрашивает дорогу до площади в туристическом центре" } },
                            { id: 2, title_icon: "👮", title: { uk: "Питає поліцейського, як пройти на площу", ru: "Спрашивает полицейского, как пройти на площадь" } },
                            { id: 3, title_icon: "🏛️", title: { uk: "Шукає головну площу під час екскурсії", ru: "Ищет главную площадь во время экскурсии" } },
                            { id: 4, title_icon: "📍", title: { uk: "Звіряється з картою в телефоні мами", ru: "Сверяется с картой в телефоне мамы" } }
                        ],
                        mistake_or_joke: "Ой, я щойно послала тебе не туди! Добре, що словаки завжди раді допомогти повторно."
                    },
                    2: {
                        topic: "🛡️ Безпека: чужі авто",
                        is_safety: true,
                        hint: {
                            uk: "Ніколи не сідай у машину до людини, яку не знають твої батьки — навіть якщо пропонують підвезти.",
                            ru: "Никогда не садись в машину к человеку, которого не знают твои родители — даже если предлагают подвезти."
                        },
                        tracks: {
                            junior: { phrase: "Nesadám k cudzím.", translation: "Я не сідаю до чужих.", words: ["Nesadám", "k cudzím"], intro: "Nesadám do auta k cudzím ľuďom." },
                            middle: { phrase: "Nenastupujem do auta k cudziemu človeku.", translation: "Я не сідаю в машину до незнайомої людини.", words: ["Nenastupujem", "do auta", "k cudziemu", "človeku"], intro: "Nenastupujem do auta k cudziemu človeku." },
                            senior: { phrase: "Do auta nikdy nesadám k človeku, ktorého nepoznajú moji rodičia.", translation: "Я ніколи не сідаю в машину до людини, яку не знають мої батьки.", words: ["Do auta nikdy", "nesadám", "k človeku", "ktorého nepoznajú moji rodičia"], intro: "Do auta nikdy nesadám k človeku, ktorého nepoznajú moji rodičia." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🚗", title: { uk: "Незнайомець пропонує підвезти зі школи", ru: "Незнакомец предлагает подвезти из школы" } },
                            { id: 2, title_icon: "🅿️", title: { uk: "На парковці хтось кличе сісти в машину", ru: "На парковке кто-то зовёт сесть в машину" } },
                            { id: 3, title_icon: "☔", title: { uk: "Незнайомець пропонує «підвезти» в дощ", ru: "Незнакомец предлагает «подвезти» в дождь" } },
                            { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Пояснює правило молодшій сестрі", ru: "Объясняет правило младшей сестре" } }
                        ],
                        mistake_or_joke: null
                    },
                    3: {
                        topic: "Погода",
                        is_safety: false,
                        hint: {
                            uk: "«Prší» — йде дощ. Коротке слово, легко запам'ятати разом з парасолькою в руці!",
                            ru: "«Prší» — идёт дождь. Короткое слово, легко запомнить вместе с зонтиком в руке!"
                        },
                        tracks: {
                            junior: { phrase: "Zima. Teplo. Prší.", translation: "Холодно. Тепло. Дощ.", words: ["Zima", "Teplo", "Prší"], intro: "Dnes je zima a prší." },
                            middle: { phrase: "Dnes je zima / teplo / prší.", translation: "Сьогодні холодно / тепло / йде дощ.", words: ["Dnes je", "zima", "teplo", "prší"], intro: "Dnes je vonku zima." },
                            senior: { phrase: "Dnes je vonku zima a možno bude aj pršať.", translation: "Сьогодні надворі холодно, і, можливо, ще й дощ піде.", words: ["Dnes je vonku", "zima", "a možno", "bude aj pršať"], intro: "Dnes je vonku zima a možno bude aj pršať." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🌧️", title: { uk: "Дивиться у вікно й розповідає про погоду", ru: "Смотрит в окно и рассказывает о погоде" } },
                            { id: 2, title_icon: "🌤️", title: { uk: "Обговорює погоду з однокласником", ru: "Обсуждает погоду с одноклассником" } },
                            { id: 3, title_icon: "☂️", title: { uk: "Питає маму, чи брати парасольку", ru: "Спрашивает маму, брать ли зонт" } },
                            { id: 4, title_icon: "📺", title: { uk: "Дивиться прогноз погоди по телевізору", ru: "Смотрит прогноз погоды по телевизору" } }
                        ],
                        mistake_or_joke: "Ой, я сказала «сонячно», хоча за вікном дощ! Треба уважніше дивитись у вікно."
                    }
                }
            },
            4: {
                days: {
                    1: {
                        topic: "Одяг по сезону",
                        is_safety: false,
                        hint: {
                            uk: "«Bunda» — куртка. У холодну погоду це слово точно знадобиться!",
                            ru: "«Bunda» — куртка. В холодную погоду это слово точно пригодится!"
                        },
                        tracks: {
                            junior: { phrase: "Teplá bunda.", translation: "Тепла куртка.", words: ["Teplá", "bunda"], intro: "Potrebujem teplú bundu." },
                            middle: { phrase: "Potrebujem teplú bundu.", translation: "Мені потрібна тепла куртка.", words: ["Potrebujem", "teplú", "bundu"], intro: "Potrebujem teplú bundu." },
                            senior: { phrase: "Potrebujem teplú bundu a čiapku, lebo vonku je chladno.", translation: "Мені потрібна тепла куртка і шапка, бо надворі холодно.", words: ["Potrebujem teplú bundu", "a čiapku", "lebo vonku", "je chladno"], intro: "Potrebujem teplú bundu a čiapku." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🧥", title: { uk: "Одягається перед виходом на вулицю взимку", ru: "Одевается перед выходом на улицу зимой" } },
                            { id: 2, title_icon: "🛍️", title: { uk: "Обирає куртку в магазині з мамою", ru: "Выбирает куртку в магазине с мамой" } },
                            { id: 3, title_icon: "🏫", title: { uk: "Каже вчительці, що замерз на прогулянці", ru: "Говорит учительнице, что замёрз на прогулке" } },
                            { id: 4, title_icon: "⛄", title: { uk: "Збирається гратися на снігу", ru: "Собирается играть на снегу" } }
                        ],
                        mistake_or_joke: "Стривай, я мало не вдягла тобі літню кепку взимку! Дякую, що виправив."
                    },
                    2: {
                        topic: "Зимовий ярмарок",
                        is_safety: false,
                        hint: {
                            uk: "«Koľko stojí» — скільки коштує. Дуже корисна фраза на будь-якому ярмарку чи в магазині.",
                            ru: "«Koľko stojí» — сколько стоит. Очень полезная фраза на любой ярмарке или в магазине."
                        },
                        tracks: {
                            junior: { phrase: "Koľko stojí?", translation: "Скільки коштує?", words: ["Koľko", "stojí"], intro: "Koľko to stojí?" },
                            middle: { phrase: "Koľko to stojí?", translation: "Скільки це коштує?", words: ["Koľko", "to stojí"], intro: "Koľko to stojí, prosím?" },
                            senior: { phrase: "Prepáčte, koľko to stojí a dá sa to kúpiť aj lacnejšie?", translation: "Перепрошую, скільки це коштує і чи можна купити дешевше?", words: ["Prepáčte", "koľko to stojí", "a dá sa to", "kúpiť aj lacnejšie"], intro: "Koľko to stojí a dá sa to kúpiť aj lacnejšie?" }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🎪", title: { uk: "Питає ціну на іграшку на різдвяному ярмарку", ru: "Спрашивает цену на игрушку на рождественской ярмарке" } },
                            { id: 2, title_icon: "🍬", title: { uk: "Купує солодощі на ярмарковому прилавку", ru: "Покупает сладости на ярмарочном прилавке" } },
                            { id: 3, title_icon: "🎁", title: { uk: "Обирає подарунок для мами на ярмарку", ru: "Выбирает подарок для мамы на ярмарке" } },
                            { id: 4, title_icon: "🎡", title: { uk: "Питає, скільки коштує квиток на карусель", ru: "Спрашивает, сколько стоит билет на карусель" } }
                        ],
                        mistake_or_joke: "Ой, я почула ціну і аж здивувалась! Добре, що завжди можна перепитати."
                    },
                    3: {
                        topic: "🛡️ Безпека: загубився в натовпі",
                        is_safety: true,
                        hint: {
                            uk: "Якщо загубився — залишайся на місці й голосно клич маму або тата. Не блукай сам у пошуках.",
                            ru: "Если потерялся — оставайся на месте и громко зови маму или папу. Не броди сам в поисках."
                        },
                        tracks: {
                            junior: { phrase: "Zavolám mamu.", translation: "Покличу маму.", words: ["Zavolám", "mamu"], intro: "Ak sa stratím, zavolám mamu." },
                            middle: { phrase: "Ak sa stratím, zostanem stáť a zavolám mamu.", translation: "Якщо загублюся, залишуся стояти й покличу маму.", words: ["Ak sa stratím", "zostanem stáť", "a zavolám", "mamu"], intro: "Ak sa stratím, zostanem stáť a zavolám mamu." },
                            senior: { phrase: "Ak sa stratím v dave, zostanem na mieste a zavolám mame alebo požiadam o pomoc predavača.", translation: "Якщо загублюся в натовпі, залишуся на місці й подзвоню мамі або попрошу допомоги в продавця.", words: ["Ak sa stratím v dave", "zostanem na mieste", "a zavolám mame", "alebo požiadam o pomoc predavača"], intro: "Ak sa stratím v dave, zostanem na mieste a zavolám mame." }
                        },
                        scenarios: [
                            { id: 1, title_icon: "🎪", title: { uk: "Загубився серед натовпу на ярмарку", ru: "Потерялся среди толпы на ярмарке" } },
                            { id: 2, title_icon: "🏬", title: { uk: "Не бачить батьків у великому торговому центрі", ru: "Не видит родителей в большом торговом центре" } },
                            { id: 3, title_icon: "🚉", title: { uk: "Розгубився на людному вокзалі", ru: "Растерялся на людном вокзале" } },
                            { id: 4, title_icon: "👮", title: { uk: "Звертається по допомогу до продавця чи охоронця", ru: "Обращается за помощью к продавцу или охраннику" } }
                        ],
                        mistake_or_joke: null
                    }
                }
            }
        }
    }
};

curriculumCatalog[3] = {
    theme: "Тіло, покупки та дружба",
    weeks: {
        1: {
            days: {
                1: {
                    topic: "Частини тіла",
                    is_safety: false,
                    hint: {
                        uk: "«Bolí ma...» — у мене болить... Далі просто додай назву частини тіла.",
                        ru: "«Bolí ma...» — у меня болит... Дальше просто добавь название части тела."
                    },
                    tracks: {
                        junior: { phrase: "Bolí hlava.", translation: "Болить голова.", words: ["Bolí", "hlava"], intro: "Bolí ma hlava." },
                        middle: { phrase: "Bolí ma hlava / brucho / ruka.", translation: "У мене болить голова / живіт / рука.", words: ["Bolí ma", "hlava", "brucho", "ruka"], intro: "Bolí ma hlava." },
                        senior: { phrase: "Bolí ma hlava a trochu aj brucho, necítim sa najlepšie.", translation: "У мене болить голова і трохи живіт, я почуваюся не найкраще.", words: ["Bolí ma hlava", "a trochu aj brucho", "necítim sa", "najlepšie"], intro: "Bolí ma hlava a trochu aj brucho." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🤕", title: { uk: "Каже мамі, що болить голова", ru: "Говорит маме, что болит голова" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Каже вчительці, що погано почувається", ru: "Говорит учительнице, что плохо себя чувствует" } },
                        { id: 3, title_icon: "🏥", title: { uk: "Показує лікарю, де болить", ru: "Показывает врачу, где болит" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Скаржиться татові після падіння", ru: "Жалуется папе после падения" } }
                    ],
                    mistake_or_joke: "Ой, я показала не на ту частину тіла! Навіть я іноді плутаю ліву й праву руку."
                },
                2: {
                    topic: "У лікаря",
                    is_safety: false,
                    hint: {
                        uk: "«Necítim sa dobre» — універсальна фраза, коли просто погано, навіть якщо не знаєш точно, що саме болить.",
                        ru: "«Necítim sa dobre» — универсальная фраза, когда просто плохо, даже если не знаешь точно, что именно болит."
                    },
                    tracks: {
                        junior: { phrase: "Necítim sa dobre.", translation: "Я почуваюся погано.", words: ["Necítim sa", "dobre"], intro: "Necítim sa dnes dobre." },
                        middle: { phrase: "Necítim sa dobre.", translation: "Я почуваюся погано.", words: ["Necítim", "sa dobre"], intro: "Necítim sa dobre, mamka." },
                        senior: { phrase: "Necítim sa dobre, pán doktor, mám horúčku a bolí ma hrdlo.", translation: "Я почуваюся погано, пане лікарю, у мене температура і болить горло.", words: ["Necítim sa dobre", "pán doktor", "mám horúčku", "a bolí ma hrdlo"], intro: "Necítim sa dobre, mám horúčku." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🩺", title: { uk: "На прийомі в дитячого лікаря", ru: "На приёме у детского врача" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Просить вчительку відпустити додому", ru: "Просит учительницу отпустить домой" } },
                        { id: 3, title_icon: "🤒", title: { uk: "Прокидається зранку з температурою", ru: "Просыпается утром с температурой" } },
                        { id: 4, title_icon: "💊", title: { uk: "Розповідає медсестрі про самопочуття", ru: "Рассказывает медсестре о самочувствии" } }
                    ],
                    mistake_or_joke: "Секунду, лікарю потрібно точно сказати, де болить — я теж колись плутала слова."
                },
                3: {
                    topic: "Гігієна",
                    is_safety: false,
                    hint: {
                        uk: "«Umyl som si ruky» — я помив руки. Хороша звичка казати це вголос перед їжею!",
                        ru: "«Umyl som si ruky» — я помыл руки. Хорошая привычка говорить это вслух перед едой!"
                    },
                    tracks: {
                        junior: { phrase: "Umyl ruky.", translation: "Помив руки.", words: ["Umyl", "ruky"], intro: "Umyl som si ruky." },
                        middle: { phrase: "Umyl som si ruky.", translation: "Я помив руки.", words: ["Umyl som si", "ruky"], intro: "Umyl som si ruky pred jedlom." },
                        senior: { phrase: "Umyl som si ruky pred jedlom, ako to mám vždy robiť.", translation: "Я помив руки перед їжею, як завжди маю робити.", words: ["Umyl som si ruky", "pred jedlom", "ako to mám", "vždy robiť"], intro: "Umyl som si ruky pred jedlom." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🧼", title: { uk: "Миє руки перед обідом удома", ru: "Моет руки перед обедом дома" } },
                        { id: 2, title_icon: "🍽️", title: { uk: "Показує мамі чисті руки перед столом", ru: "Показывает маме чистые руки перед столом" } },
                        { id: 3, title_icon: "🏫", title: { uk: "Миє руки в шкільній вбиральні", ru: "Моет руки в школьном туалете" } },
                        { id: 4, title_icon: "🧴", title: { uk: "Нагадує молодшому братику мити руки", ru: "Напоминает младшему брату мыть руки" } }
                    ],
                    mistake_or_joke: "Ой, я забула вимкнути воду! Добре, що ти нагадав."
                }
            }
        },
        2: {
            days: {
                1: {
                    topic: "🛡️ Безпека: моє тіло належить мені",
                    is_safety: true,
                    hint: {
                        uk: "Якщо щось не так — скажи про це дорослому, якому довіряєш. Це не соромно, це правильно.",
                        ru: "Если что-то не так — скажи об этом взрослому, которому доверяешь. Это не стыдно, это правильно."
                    },
                    tracks: {
                        junior: { phrase: "Moje telo je moje.", translation: "Моє тіло — моє.", words: ["Moje telo", "je moje"], intro: "Moje telo je len moje." },
                        middle: { phrase: "Moje telo patrí len mne.", translation: "Моє тіло належить лише мені.", words: ["Moje telo", "patrí", "len mne"], intro: "Moje telo patrí len mne." },
                        senior: { phrase: "Moje telo patrí len mne. Ak niečo nie je v poriadku, poviem to dospelému, ktorému dôverujem.", translation: "Моє тіло належить лише мені. Якщо щось не так, я скажу про це дорослому, якому довіряю.", words: ["Moje telo patrí", "len mne", "Ak niečo nie je v poriadku", "poviem to dospelému, ktorému dôverujem"], intro: "Moje telo patrí len mne." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🙅", title: { uk: "Каже «ні», коли хтось торкається без дозволу", ru: "Говорит «нет», когда кто-то трогает без разрешения" } },
                        { id: 2, title_icon: "👨‍👩‍👧", title: { uk: "Розповідає батькам, що щось було неприємно", ru: "Рассказывает родителям, что что-то было неприятно" } },
                        { id: 3, title_icon: "👩‍🏫", title: { uk: "Довіряє вчительці й розповідає про проблему", ru: "Доверяет учительнице и рассказывает о проблеме" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Пояснює правило другові", ru: "Объясняет правило другу" } }
                    ],
                    mistake_or_joke: null
                },
                2: {
                    topic: "У магазині",
                    is_safety: false,
                    hint: {
                        uk: "«Chcem kúpiť» — я хочу купити. Ввічливий і зрозумілий спосіб сказати, що тобі треба в магазині.",
                        ru: "«Chcem kúpiť» — я хочу купить. Вежливый и понятный способ сказать, что тебе нужно в магазине."
                    },
                    tracks: {
                        junior: { phrase: "Toto, prosím.", translation: "Це, будь ласка.", words: ["Toto", "prosím"], intro: "Chcem toto, prosím." },
                        middle: { phrase: "Chcem kúpiť toto, prosím.", translation: "Я хочу купити це, будь ласка.", words: ["Chcem kúpiť", "toto", "prosím"], intro: "Chcem kúpiť toto, prosím." },
                        senior: { phrase: "Chcela by som si kúpiť toto, prosím, môžete mi to zabaliť?", translation: "Я хотіла б купити це, будь ласка, можете мені це загорнути?", words: ["Chcela by som", "si kúpiť toto", "prosím", "môžete mi to zabaliť"], intro: "Chcela by som si kúpiť toto, prosím." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🛒", title: { uk: "Обирає товар на касі в магазині", ru: "Выбирает товар на кассе в магазине" } },
                        { id: 2, title_icon: "📚", title: { uk: "Купує зошит у книгарні", ru: "Покупает тетрадь в книжном магазине" } },
                        { id: 3, title_icon: "🍭", title: { uk: "Купує солодощі за власні кишенькові гроші", ru: "Покупает сладости на свои карманные деньги" } },
                        { id: 4, title_icon: "🎁", title: { uk: "Обирає подарунок другові в магазині", ru: "Выбирает подарок другу в магазине" } }
                    ],
                    mistake_or_joke: "Ой, я мало не забула сказати «будь ласка»! Ввічливість — це важливо."
                },
                3: {
                    topic: "Гроші та ціни",
                    is_safety: false,
                    hint: {
                        uk: "«Drahé» — дорого, «lacné» — дешево. Протилежні слова легше запам'ятати парою.",
                        ru: "«Drahé» — дорого, «lacné» — дёшево. Противоположные слова легче запомнить парой."
                    },
                    tracks: {
                        junior: { phrase: "Drahé? Lacné?", translation: "Дорого? Дешево?", words: ["Drahé", "Lacné"], intro: "Je to drahé alebo lacné?" },
                        middle: { phrase: "Koľko to stojí? Je to drahé/lacné.", translation: "Скільки це коштує? Це дорого/дешево.", words: ["Koľko to stojí", "Je to", "drahé", "lacné"], intro: "Koľko to stojí? Je to drahé?" },
                        senior: { phrase: "Koľko to stojí a myslíte, že je to drahé alebo skôr lacné?", translation: "Скільки це коштує і як гадаєте, це дорого чи скоріш дешево?", words: ["Koľko to stojí", "a myslíte", "že je to drahé", "alebo skôr lacné"], intro: "Koľko to stojí a myslíte, že je to drahé?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "💰", title: { uk: "Порівнює ціни двох товарів у магазині", ru: "Сравнивает цены двух товаров в магазине" } },
                        { id: 2, title_icon: "🧸", title: { uk: "Питає, чи дорога іграшка", ru: "Спрашивает, дорогая ли игрушка" } },
                        { id: 3, title_icon: "🍎", title: { uk: "Обговорює з мамою ціну фруктів", ru: "Обсуждает с мамой цену фруктов" } },
                        { id: 4, title_icon: "👕", title: { uk: "Дізнається ціну нового светра", ru: "Узнаёт цену нового свитера" } }
                    ],
                    mistake_or_joke: "Стривай, я почула не ту ціну! Завжди корисно перепитати ще раз."
                }
            }
        },
        3: {
            days: {
                1: {
                    topic: "Примірка та вибір",
                    is_safety: false,
                    hint: {
                        uk: "«Vyskúšať» — приміряти або спробувати. Корисне слово і в магазині одягу, і на пробі нової страви.",
                        ru: "«Vyskúšať» — примерить или попробовать. Полезное слово и в магазине одежды, и при пробе нового блюда."
                    },
                    tracks: {
                        junior: { phrase: "Môžem skúsiť?", translation: "Можна спробувати?", words: ["Môžem", "skúsiť"], intro: "Môžem si to skúsiť?" },
                        middle: { phrase: "Môžem si to vyskúšať?", translation: "Можна мені це приміряти?", words: ["Môžem si to", "vyskúšať"], intro: "Môžem si to vyskúšať, prosím?" },
                        senior: { phrase: "Prepáčte, môžem si to vyskúšať v prímerkovej kabínke?", translation: "Перепрошую, можна мені це приміряти в примірочній кабінці?", words: ["Prepáčte", "môžem si to", "vyskúšať", "v prímerkovej kabínke"], intro: "Môžem si to vyskúšať v prímerkovej kabínke?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "👗", title: { uk: "Просить приміряти сукню в магазині одягу", ru: "Просит примерить платье в магазине одежды" } },
                        { id: 2, title_icon: "👟", title: { uk: "Приміряє нові кросівки", ru: "Примеряет новые кроссовки" } },
                        { id: 3, title_icon: "🎩", title: { uk: "Приміряє капелюх на ярмарку", ru: "Примеряет шляпу на ярмарке" } },
                        { id: 4, title_icon: "🕶️", title: { uk: "Просить приміряти окуляри в магазині", ru: "Просит примерить очки в магазине" } }
                    ],
                    mistake_or_joke: "Ой, я взяла не той розмір! Завжди краще спочатку приміряти."
                },
                2: {
                    topic: "🛡️ Безпека: гроші та картки",
                    is_safety: true,
                    hint: {
                        uk: "Гроші й платіжна картка — це не для чужих людей. Тільки батьки можуть їх просити.",
                        ru: "Деньги и платёжная карта — не для чужих людей. Только родители могут их просить."
                    },
                    tracks: {
                        junior: { phrase: "Peniaze len rodičom.", translation: "Гроші лише батькам.", words: ["Peniaze", "len rodičom"], intro: "Peniaze dávam len rodičom." },
                        middle: { phrase: "Nedávam peniaze ani kartu nikomu okrem rodičov.", translation: "Я не даю гроші чи картку нікому, крім батьків.", words: ["Nedávam peniaze", "ani kartu", "nikomu", "okrem rodičov"], intro: "Nedávam peniaze ani kartu nikomu okrem rodičov." },
                        senior: { phrase: "Svoje peniaze ani platobnú kartu nedávam nikomu okrem svojich rodičov.", translation: "Свої гроші чи платіжну картку я не даю нікому, крім своїх батьків.", words: ["Svoje peniaze", "ani platobnú kartu", "nedávam nikomu", "okrem svojich rodičov"], intro: "Svoje peniaze ani platobnú kartu nedávam nikomu okrem svojich rodičov." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "💳", title: { uk: "Хтось незнайомий просить позичити картку", ru: "Кто-то незнакомый просит одолжить карту" } },
                        { id: 2, title_icon: "👦", title: { uk: "Однокласник просить дати гроші", ru: "Одноклассник просит дать деньги" } },
                        { id: 3, title_icon: "💻", title: { uk: "В інтернет-грі просять дані картки", ru: "В интернет-игре просят данные карты" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Пояснює правило молодшій сестрі", ru: "Объясняет правило младшей сестре" } }
                    ],
                    mistake_or_joke: null
                },
                3: {
                    topic: "Почуття",
                    is_safety: false,
                    hint: {
                        uk: "«Šťastný» — щасливий, «smutný» — сумний. Хлопчик каже «šťastný», дівчинка — «šťastná».",
                        ru: "«Šťastný» — счастливый, «smutný» — грустный. Мальчик говорит «šťastný», девочка — «šťastná»."
                    },
                    tracks: {
                        junior: { phrase: "Som šťastný.", translation: "Я щасливий.", words: ["Som", "šťastný"], intro: "Dnes som šťastný." },
                        middle: { phrase: "Som šťastný/šťastná. Som smutný/smutná.", translation: "Я щасливий/щаслива. Я сумний/сумна.", words: ["Som šťastný", "šťastná", "Som smutný", "smutná"], intro: "Dnes som šťastný, a včera som bol smutný." },
                        senior: { phrase: "Dnes som naozaj šťastná, ale včera som bola trochu smutná.", translation: "Сьогодні я справді щаслива, але вчора була трохи сумна.", words: ["Dnes som naozaj", "šťastná", "ale včera", "som bola trochu smutná"], intro: "Dnes som naozaj šťastná." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "😊", title: { uk: "Розповідає мамі, що сьогодні щасливий", ru: "Рассказывает маме, что сегодня счастлив" } },
                        { id: 2, title_icon: "😢", title: { uk: "Каже вчительці, що сумує", ru: "Говорит учительнице, что грустит" } },
                        { id: 3, title_icon: "🎨", title: { uk: "Малює свій настрій на уроці малювання", ru: "Рисует своё настроение на уроке рисования" } },
                        { id: 4, title_icon: "🤗", title: { uk: "Ділиться почуттями з другом", ru: "Делится чувствами с другом" } }
                    ],
                    mistake_or_joke: "Ой, я переплутала «щасливий» і «сумний»! Настрій буває різний, як і слова про нього."
                }
            }
        },
        4: {
            days: {
                1: {
                    topic: "Гра з другом",
                    is_safety: false,
                    hint: {
                        uk: "«Chceš sa hrať?» — хочеш гратися? Найпростіший спосіб завести нового друга на майданчику.",
                        ru: "«Chceš sa hrať?» — хочешь играть? Самый простой способ завести нового друга на площадке."
                    },
                    tracks: {
                        junior: { phrase: "Hráš sa?", translation: "Граєшся?", words: ["Hráš", "sa"], intro: "Chceš sa hrať?" },
                        middle: { phrase: "Chceš sa so mnou hrať?", translation: "Хочеш зі мною погратися?", words: ["Chceš sa", "so mnou", "hrať"], intro: "Chceš sa so mnou hrať?" },
                        senior: { phrase: "Chceš sa so mnou dnes poobede hrať na ihrisku?", translation: "Хочеш зі мною сьогодні пополудні погратися на майданчику?", words: ["Chceš sa so mnou", "dnes poobede", "hrať", "na ihrisku"], intro: "Chceš sa so mnou dnes poobede hrať na ihrisku?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🏞️", title: { uk: "Запрошує пограти на дитячому майданчику", ru: "Приглашает поиграть на детской площадке" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Запрошує однокласника пограти на перерві", ru: "Приглашает одноклассника поиграть на перемене" } },
                        { id: 3, title_icon: "⚽", title: { uk: "Запрошує сусідського хлопчика на футбол", ru: "Приглашает соседского мальчика на футбол" } },
                        { id: 4, title_icon: "🧩", title: { uk: "Запрошує гостей пограти в настільну гру", ru: "Приглашает гостей поиграть в настольную игру" } }
                    ],
                    mistake_or_joke: "Ой, я так зраділа грі, що забула запитати ім'я! Спробуємо ще раз."
                },
                2: {
                    topic: "Друг з інтернету",
                    is_safety: false,
                    hint: {
                        uk: "Онлайн-друзі теж бувають — головне пам'ятати правила безпеки, про які поговоримо далі.",
                        ru: "Онлайн-друзья тоже бывают — главное помнить правила безопасности, о которых поговорим дальше."
                    },
                    tracks: {
                        junior: { phrase: "Kamarát z netu.", translation: "Друг з інтернету.", words: ["Kamarát", "z netu"], intro: "Toto je môj kamarát z netu." },
                        middle: { phrase: "Toto je moja kamarátka/kamarát z internetu.", translation: "Це моя подруга/мій друг з інтернету.", words: ["Toto je", "moja kamarátka", "kamarát", "z internetu"], intro: "Toto je moja kamarátka z internetu." },
                        senior: { phrase: "Toto je môj kamarát z internetu, spoznali sme sa v online hre.", translation: "Це мій друг з інтернету, ми познайомилися в онлайн-грі.", words: ["Toto je môj kamarát", "z internetu", "spoznali sme sa", "v online hre"], intro: "Toto je môj kamarát z internetu." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎮", title: { uk: "Розповідає мамі про друга з онлайн-гри", ru: "Рассказывает маме о друге из онлайн-игры" } },
                        { id: 2, title_icon: "💬", title: { uk: "Пише повідомлення другові з інтернету", ru: "Пишет сообщение другу из интернета" } },
                        { id: 3, title_icon: "🏫", title: { uk: "Розповідає однокласникам про онлайн-знайомство", ru: "Рассказывает одноклассникам о знакомстве онлайн" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Показує батькам переписку з другом", ru: "Показывает родителям переписку с другом" } }
                    ],
                    mistake_or_joke: "Стривай, я мало не написала не те ім'я! Онлайн теж треба бути уважним."
                },
                3: {
                    topic: "🛡️ Безпека: інтернет",
                    is_safety: true,
                    hint: {
                        uk: "Свою адресу і назву школи ніколи не пиши незнайомим людям в інтернеті — навіть якщо здається, що вони «друзі».",
                        ru: "Свой адрес и название школы никогда не пиши незнакомым людям в интернете — даже если кажется, что они «друзья»."
                    },
                    tracks: {
                        junior: { phrase: "Adresu nepíšem.", translation: "Адресу не пишу.", words: ["Adresu", "nepíšem"], intro: "Adresu nikomu nepíšem." },
                        middle: { phrase: "Nepíšem cudzím ľuďom na internete svoju adresu ani školu.", translation: "Я не пишу чужим людям в інтернеті свою адресу чи школу.", words: ["Nepíšem cudzím ľuďom", "na internete", "svoju adresu", "ani školu"], intro: "Nepíšem cudzím ľuďom na internete svoju adresu ani školu." },
                        senior: { phrase: "Cudzím ľuďom na internete nikdy nepíšem svoju adresu ani názov školy.", translation: "Чужим людям в інтернеті я ніколи не пишу свою адресу чи назву школи.", words: ["Cudzím ľuďom", "na internete", "nikdy nepíšem", "svoju adresu ani názov školy"], intro: "Cudzím ľuďom na internete nikdy nepíšem svoju adresu ani názov školy." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "💻", title: { uk: "Онлайн-друг питає адресу школи", ru: "Онлайн-друг спрашивает адрес школы" } },
                        { id: 2, title_icon: "🎮", title: { uk: "В грі просять написати, де живеш", ru: "В игре просят написать, где живёшь" } },
                        { id: 3, title_icon: "📱", title: { uk: "Незнайомець у чаті питає особисті дані", ru: "Незнакомец в чате спрашивает личные данные" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Розповідає батькам про підозріле повідомлення", ru: "Рассказывает родителям о подозрительном сообщении" } }
                    ],
                    mistake_or_joke: null
                }
            }
        }
    }
};

curriculumCatalog[4] = {
    theme: "Свята, природа та повторення",
    weeks: {
        1: {
            days: {
                1: {
                    topic: "Словацьке свято",
                    is_safety: false,
                    hint: {
                        uk: "«Sviatok» — свято. У Словаччині багато чудових традиційних свят протягом року.",
                        ru: "«Sviatok» — праздник. В Словакии много замечательных традиционных праздников в течение года."
                    },
                    tracks: {
                        junior: { phrase: "Slovenský sviatok.", translation: "Словацьке свято.", words: ["Slovenský", "sviatok"], intro: "Toto je slovenský sviatok!" },
                        middle: { phrase: "Toto je slovenský sviatok.", translation: "Це словацьке свято.", words: ["Toto je", "slovenský", "sviatok"], intro: "Toto je slovenský sviatok." },
                        senior: { phrase: "Toto je jeden z krásnych slovenských sviatkov, oslavujeme ho každý rok.", translation: "Це одне з чудових словацьких свят, ми святкуємо його щороку.", words: ["Toto je jeden", "z krásnych slovenských sviatkov", "oslavujeme ho", "každý rok"], intro: "Toto je jeden z krásnych slovenských sviatkov." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎉", title: { uk: "Бере участь у словацькому святі в школі", ru: "Участвует в словацком празднике в школе" } },
                        { id: 2, title_icon: "🏘️", title: { uk: "Іде на святкування з сусідами", ru: "Идёт на празднование с соседями" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Розповідає бабусі про нове свято", ru: "Рассказывает бабушке о новом празднике" } },
                        { id: 4, title_icon: "🎊", title: { uk: "Питає вчительку, що це за свято", ru: "Спрашивает учительницу, что это за праздник" } }
                    ],
                    mistake_or_joke: "Ой, я переплутала назву свята! Традицій багато, всі одразу і не запам'ятаєш."
                },
                2: {
                    topic: "Спільний спів",
                    is_safety: false,
                    hint: {
                        uk: "«Zaspievajme!» — заспіваймо! Пісні — чудовий спосіб швидко вивчити нові слова.",
                        ru: "«Zaspievajme!» — давайте споём! Песни — отличный способ быстро выучить новые слова."
                    },
                    tracks: {
                        junior: { phrase: "Zaspievajme!", translation: "Заспіваймо!", words: ["Zaspievajme"], intro: "Poď, zaspievajme spolu!" },
                        middle: { phrase: "Zaspievajme spolu pieseň!", translation: "Заспіваймо разом пісню!", words: ["Zaspievajme", "spolu", "pieseň"], intro: "Zaspievajme spolu pieseň!" },
                        senior: { phrase: "Poď, zaspievajme si spolu túto peknú slovenskú pieseň!", translation: "Ходи, заспіваймо разом цю гарну словацьку пісню!", words: ["Poď, zaspievajme si", "spolu", "túto peknú", "slovenskú pieseň"], intro: "Poď, zaspievajme si spolu túto peknú slovenskú pieseň!" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎤", title: { uk: "Співає на святковому концерті в школі", ru: "Поёт на праздничном концерте в школе" } },
                        { id: 2, title_icon: "🎪", title: { uk: "Запрошує друга заспівати на ярмарку", ru: "Приглашает друга спеть на ярмарке" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Співає традиційну пісню з родиною", ru: "Поёт традиционную песню с семьёй" } },
                        { id: 4, title_icon: "🎶", title: { uk: "Розучує пісню з учителькою музики", ru: "Разучивает песню с учительницей музыки" } }
                    ],
                    mistake_or_joke: "Ой, я заспівала не в той куплет! Навіть я іноді збиваюся."
                },
                3: {
                    topic: "Домовляємось про зустріч",
                    is_safety: false,
                    hint: {
                        uk: "«Kde sa stretneme?» — де ми зустрінемось? Корисно домовитись заздалегідь, особливо на святі з натовпом людей.",
                        ru: "«Kde sa stretneme?» — где мы встретимся? Полезно договориться заранее, особенно на празднике с толпой людей."
                    },
                    tracks: {
                        junior: { phrase: "Kde sa stretneme?", translation: "Де зустрінемось?", words: ["Kde sa", "stretneme"], intro: "Kde sa dnes stretneme?" },
                        middle: { phrase: "Kde sa stretneme po programe?", translation: "Де зустрінемось після програми?", words: ["Kde sa stretneme", "po programe"], intro: "Kde sa stretneme po programe?" },
                        senior: { phrase: "Prepáčte, kde presne sa všetci stretneme po skončení programu?", translation: "Перепрошую, де саме ми всі зустрінемось після завершення програми?", words: ["Prepáčte", "kde presne", "sa všetci stretneme", "po skončení programu"], intro: "Kde presne sa všetci stretneme po skončení programu?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🤝", title: { uk: "Домовляється з батьками про місце зустрічі на святі", ru: "Договаривается с родителями о месте встречи на празднике" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Домовляється з класом про зустріч після концерту", ru: "Договаривается с классом о встрече после концерта" } },
                        { id: 3, title_icon: "👫", title: { uk: "Призначає зустріч другу біля каруселі", ru: "Назначает встречу другу у карусели" } },
                        { id: 4, title_icon: "📍", title: { uk: "Уточнює місце зустрічі з вчителькою", ru: "Уточняет место встречи с учительницей" } }
                    ],
                    mistake_or_joke: "Стривай, я назвала не те місце! Добре, що завжди можна уточнити ще раз."
                }
            }
        },
        2: {
            days: {
                1: {
                    topic: "🛡️ Безпека: завжди знаю, де батьки",
                    is_safety: true,
                    hint: {
                        uk: "На святі чи в натовпі завжди тримайся близько до батьків і знай, де вони.",
                        ru: "На празднике или в толпе всегда держись близко к родителям и знай, где они."
                    },
                    tracks: {
                        junior: { phrase: "Viem, kde je mama.", translation: "Знаю, де мама.", words: ["Viem", "kde je mama"], intro: "Vždy viem, kde je moja mama." },
                        middle: { phrase: "Na sviatku vždy viem, kde sú mama a otec.", translation: "На святі я завжди знаю, де мама і тато.", words: ["Na sviatku", "vždy viem", "kde sú", "mama a otec"], intro: "Na sviatku vždy viem, kde sú mama a otec." },
                        senior: { phrase: "Aj v hustom dave na sviatku vždy viem presne, kde sú moji rodičia.", translation: "Навіть у щільному натовпі на святі я завжди точно знаю, де мої батьки.", words: ["Aj v hustom dave", "na sviatku", "vždy viem presne", "kde sú moji rodičia"], intro: "Aj v hustom dave na sviatku vždy viem presne, kde sú moji rodičia." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎪", title: { uk: "На святковому ярмарку тримається поруч з мамою", ru: "На праздничной ярмарке держится рядом с мамой" } },
                        { id: 2, title_icon: "🎆", title: { uk: "На феєрверку домовляється, де стояти", ru: "На фейерверке договаривается, где стоять" } },
                        { id: 3, title_icon: "👀", title: { uk: "Озирається, щоб побачити батьків у натовпі", ru: "Оглядывается, чтобы увидеть родителей в толпе" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Пояснює правило молодшому братику", ru: "Объясняет правило младшему брату" } }
                    ],
                    mistake_or_joke: null
                },
                2: {
                    topic: "Тварини на святі",
                    is_safety: false,
                    hint: {
                        uk: "«Zvieratko» — зменшувальна форма слова «тварина», звучить особливо мило.",
                        ru: "«Zvieratko» — уменьшительная форма слова «животное», звучит особенно мило."
                    },
                    tracks: {
                        junior: { phrase: "Pekné zvieratko!", translation: "Гарна тваринка!", words: ["Pekné", "zvieratko"], intro: "Aké pekné zvieratko!" },
                        middle: { phrase: "Pozri, aké krásne zvieratko!", translation: "Подивись, яка красива тваринка!", words: ["Pozri", "aké krásne", "zvieratko"], intro: "Pozri, aké krásne zvieratko!" },
                        senior: { phrase: "Pozri, aké krásne zvieratko, vieš, ako sa volá?", translation: "Подивись, яка красива тваринка, ти знаєш, як вона зветься?", words: ["Pozri, aké krásne", "zvieratko", "vieš, ako sa", "volá"], intro: "Pozri, aké krásne zvieratko, vieš, ako sa volá?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🐴", title: { uk: "Бачить коня на ярмарковому подвір'ї", ru: "Видит лошадь на ярмарочном дворе" } },
                        { id: 2, title_icon: "🦆", title: { uk: "Годує качок біля ставка на святі", ru: "Кормит уток у пруда на празднике" } },
                        { id: 3, title_icon: "🐐", title: { uk: "Гладить козу в контактному зоопарку", ru: "Гладит козу в контактном зоопарке" } },
                        { id: 4, title_icon: "🐿️", title: { uk: "Показує татові білку в парку", ru: "Показывает папе белку в парке" } }
                    ],
                    mistake_or_joke: "Ой, я назвала козу конем! Тваринки бувають дуже схожі, коли поспішаєш."
                },
                3: {
                    topic: "Прогулянка в ліс",
                    is_safety: false,
                    hint: {
                        uk: "«Prechádzka» — прогулянка. Довге слово, але звучить дуже мелодійно.",
                        ru: "«Prechádzka» — прогулка. Длинное слово, но звучит очень мелодично."
                    },
                    tracks: {
                        junior: { phrase: "Ideme do lesa.", translation: "Йдемо в ліс.", words: ["Ideme", "do lesa"], intro: "Poďme sa prejsť do lesa." },
                        middle: { phrase: "Ideme na prechádzku do lesa.", translation: "Йдемо на прогулянку в ліс.", words: ["Ideme", "na prechádzku", "do lesa"], intro: "Ideme na prechádzku do lesa." },
                        senior: { phrase: "Dnes poobede ideme na peknú prechádzku do lesa s celou rodinou.", translation: "Сьогодні пополудні йдемо на гарну прогулянку в ліс з усією родиною.", words: ["Dnes poobede", "ideme na peknú prechádzku", "do lesa", "s celou rodinou"], intro: "Dnes poobede ideme na peknú prechádzku do lesa s celou rodinou." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🌲", title: { uk: "Збирається на прогулянку в ліс з родиною", ru: "Собирается на прогулку в лес с семьёй" } },
                        { id: 2, title_icon: "🍂", title: { uk: "Розповідає другові про похід у ліс", ru: "Рассказывает другу о походе в лес" } },
                        { id: 3, title_icon: "🎒", title: { uk: "Пакує рюкзак перед прогулянкою", ru: "Собирает рюкзак перед прогулкой" } },
                        { id: 4, title_icon: "🍄", title: { uk: "Шукає гриби разом з дідусем", ru: "Ищет грибы вместе с дедушкой" } }
                    ],
                    mistake_or_joke: "Секунду, я мало не забула взяти воду з собою! У лісі це важливо."
                }
            }
        },
        3: {
            days: {
                1: {
                    topic: "Пікнік на природі",
                    is_safety: false,
                    hint: {
                        uk: "«Sadneme si» — сядьмо. Гарна фраза, коли готуєшся до пікніка на природі.",
                        ru: "«Sadneme si» — сядем. Хорошая фраза, когда готовишься к пикнику на природе."
                    },
                    tracks: {
                        junior: { phrase: "Sadneme si tu.", translation: "Сядьмо тут.", words: ["Sadneme si", "tu"], intro: "Poďme, sadneme si tu." },
                        middle: { phrase: "Sadneme si tu a najeme sa.", translation: "Сядьмо тут і поїмо.", words: ["Sadneme si tu", "a najeme sa"], intro: "Sadneme si tu a najeme sa." },
                        senior: { phrase: "Poďme si sadnúť sem na deku a spolu sa najesť.", translation: "Ходімо сядьмо тут на ковдру і разом поїмо.", words: ["Poďme si sadnúť", "sem na deku", "a spolu", "sa najesť"], intro: "Poďme si sadnúť sem na deku a spolu sa najesť." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🧺", title: { uk: "Розстеляє ковдру для пікніка в парку", ru: "Расстилает одеяло для пикника в парке" } },
                        { id: 2, title_icon: "🌳", title: { uk: "Обирає гарне місце під деревом у лісі", ru: "Выбирает хорошее место под деревом в лесу" } },
                        { id: 3, title_icon: "🥪", title: { uk: "Запрошує друзів пообідати разом на природі", ru: "Приглашает друзей пообедать вместе на природе" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Допомагає мамі розкласти їжу на пікніку", ru: "Помогает маме разложить еду на пикнике" } }
                    ],
                    mistake_or_joke: "Ой, я сіла на мурашник! Наступного разу оберемо місце уважніше."
                },
                2: {
                    topic: "🛡️ Безпека: номер 112",
                    is_safety: true,
                    hint: {
                        uk: "112 — єдиний екстрений номер у всій Європі. Він працює навіть без грошей на телефоні.",
                        ru: "112 — единый экстренный номер по всей Европе. Он работает даже без денег на телефоне."
                    },
                    tracks: {
                        junior: { phrase: "Číslo 112.", translation: "Номер 112.", words: ["Číslo", "112"], intro: "Poznám číslo 112." },
                        middle: { phrase: "Číslo 112 zachraňuje. Viem, ako ho vytočiť.", translation: "Номер 112 рятує. Я знаю, як його набрати.", words: ["Číslo 112", "zachraňuje", "Viem, ako ho", "vytočiť"], intro: "Číslo 112 zachraňuje. Viem, ako ho vytočiť." },
                        senior: { phrase: "Viem, že číslo 112 privolá pomoc, a viem presne, ako ho vytočiť v núdzi.", translation: "Я знаю, що номер 112 викличе допомогу, і знаю точно, як його набрати в надзвичайній ситуації.", words: ["Viem, že číslo 112", "privolá pomoc", "a viem presne", "ako ho vytočiť v núdzi"], intro: "Viem, že číslo 112 privolá pomoc." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🚨", title: { uk: "Пояснює батькам, що знає екстрений номер", ru: "Объясняет родителям, что знает экстренный номер" } },
                        { id: 2, title_icon: "👩‍🏫", title: { uk: "Вчителька питає клас, хто пам'ятає номер 112", ru: "Учительница спрашивает класс, кто помнит номер 112" } },
                        { id: 3, title_icon: "📱", title: { uk: "Показує другові, як зберегти номер у телефоні", ru: "Показывает другу, как сохранить номер в телефоне" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Повторює правило вдома з мамою", ru: "Повторяет правило дома с мамой" } }
                    ],
                    mistake_or_joke: null
                },
                3: {
                    topic: "Розповідаю про себе",
                    is_safety: false,
                    hint: {
                        uk: "Це підсумковий день — об'єднай усе, що вивчив: привітання, родину і клас, в одну розповідь про себе!",
                        ru: "Это итоговый день — объедини всё, что выучил: приветствие, семью и класс, в один рассказ о себе!"
                    },
                    tracks: {
                        junior: { phrase: "Ahoj! Mama, trieda.", translation: "Привіт! Мама, клас.", words: ["Ahoj", "Mama", "trieda"], intro: "Ahoj! Toto je moja mama a moja trieda." },
                        middle: { phrase: "Ahoj, ako sa voláš? Toto je moja rodina a moja trieda.", translation: "Привіт, як тебе звати? Це моя родина і мій клас.", words: ["Ahoj, ako sa voláš", "Toto je", "moja rodina", "a moja trieda"], intro: "Ahoj, ako sa voláš? Toto je moja rodina a moja trieda." },
                        senior: { phrase: "Ahoj, volám sa Oksana. Toto je moja rodina a toto je moja trieda v škole.", translation: "Привіт, мене звати Оксана. Це моя родина, а це мій клас у школі.", words: ["Ahoj, volám sa Oksana", "Toto je moja rodina", "a toto je", "moja trieda v škole"], intro: "Ahoj, volám sa Oksana. Toto je moja rodina a toto je moja trieda v škole." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎤", title: { uk: "Розповідає про себе на першому уроці нового семестру", ru: "Рассказывает о себе на первом уроке нового семестра" } },
                        { id: 2, title_icon: "📸", title: { uk: "Показує фото родини й класу новому другові", ru: "Показывает фото семьи и класса новому другу" } },
                        { id: 3, title_icon: "🏕️", title: { uk: "Знайомиться з дітьми в літньому таборі", ru: "Знакомится с детьми в летнем лагере" } },
                        { id: 4, title_icon: "🎬", title: { uk: "Записує коротке відео-знайомство про себе", ru: "Записывает короткое видео-знакомство о себе" } }
                    ],
                    mistake_or_joke: "Ого, я стільки всього розповіла одразу! Добре, що ми це вже вивчили."
                }
            }
        },
        4: {
            days: {
                1: {
                    topic: "У магазині (повторення)",
                    is_safety: false,
                    hint: {
                        uk: "Ще один підсумковий день — об'єднуємо «де магазин» і «скільки коштує» в одну корисну розмову.",
                        ru: "Ещё один итоговый день — объединяем «где магазин» и «сколько стоит» в один полезный разговор."
                    },
                    tracks: {
                        junior: { phrase: "Obchod. Koľko?", translation: "Магазин. Скільки?", words: ["Obchod", "Koľko"], intro: "Kde je obchod a koľko to stojí?" },
                        middle: { phrase: "Kde je obchod? Koľko to stojí?", translation: "Де магазин? Скільки це коштує?", words: ["Kde je", "obchod", "Koľko to", "stojí"], intro: "Kde je obchod? Koľko to stojí?" },
                        senior: { phrase: "Prepáčte, kde je najbližší obchod a koľko stoja tieto veci?", translation: "Перепрошую, де найближчий магазин і скільки коштують ці речі?", words: ["Prepáčte", "kde je najbližší obchod", "a koľko stoja", "tieto veci"], intro: "Prepáčte, kde je najbližší obchod a koľko stoja tieto veci?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🛍️", title: { uk: "Шукає магазин і питає ціну одразу", ru: "Ищет магазин и спрашивает цену сразу" } },
                        { id: 2, title_icon: "🎁", title: { uk: "Обирає подарунок і питає, скільки коштує", ru: "Выбирает подарок и спрашивает, сколько стоит" } },
                        { id: 3, title_icon: "🍭", title: { uk: "Купує ласощі на кишенькові гроші", ru: "Покупает сладости на карманные деньги" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Допомагає мамі з покупками у новому місті", ru: "Помогает маме с покупками в новом городе" } }
                    ],
                    mistake_or_joke: "Ой, я одразу забула про ввічливе «prosím»! Гарна звичка — казати його завжди."
                },
                2: {
                    topic: "Мій настрій і безпека онлайн",
                    is_safety: false,
                    hint: {
                        uk: "Ще один підсумок: розповідаємо про настрій і одразу пригадуємо правило безпеки в інтернеті.",
                        ru: "Ещё один итог: рассказываем о настроении и сразу вспоминаем правило безопасности в интернете."
                    },
                    tracks: {
                        junior: { phrase: "Som šťastný.", translation: "Я щасливий.", words: ["Som", "šťastný"], intro: "Dnes som šťastný." },
                        middle: { phrase: "Som šťastný. Nepíšem cudzím adresu.", translation: "Я щасливий. Не пишу чужим адресу.", words: ["Som šťastný", "Nepíšem cudzím", "adresu"], intro: "Som šťastný. Nepíšem cudzím adresu." },
                        senior: { phrase: "Som dnes šťastná a viem, že cudzím ľuďom na internete nikdy nepíšem svoju adresu.", translation: "Я сьогодні щаслива і знаю, що чужим людям в інтернеті ніколи не пишу свою адресу.", words: ["Som dnes šťastná", "a viem", "že cudzím ľuďom na internete", "nikdy nepíšem svoju adresu"], intro: "Som dnes šťastná a viem, že cudzím ľuďom na internete nikdy nepíšem svoju adresu." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "😊", title: { uk: "Ділиться гарним настроєм з мамою після школи", ru: "Делится хорошим настроением с мамой после школы" } },
                        { id: 2, title_icon: "💻", title: { uk: "Розповідає, чому не пише свою адресу онлайн", ru: "Рассказывает, почему не пишет свой адрес онлайн" } },
                        { id: 3, title_icon: "👫", title: { uk: "Обговорює з другом правила безпеки в інтернеті", ru: "Обсуждает с другом правила безопасности в интернете" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Нагадує собі правило перед онлайн-грою", ru: "Напоминает себе правило перед онлайн-игрой" } }
                    ],
                    mistake_or_joke: "Ого, я поєднала одразу дві теми в одну фразу! Ми справді багато вивчили."
                },
                3: {
                    topic: "🛡️ Безпека: підсумок захисту",
                    is_safety: true,
                    hint: {
                        uk: "Головний підсумок місяця: ввічливо відмовляй незнайомцям, тримайся ближче до батьків і пам'ятай номер 112.",
                        ru: "Главный итог месяца: вежливо отказывай незнакомцам, держись ближе к родителям и помни номер 112."
                    },
                    tracks: {
                        junior: { phrase: "Nie, ďakujem. Idem k mame.", translation: "Ні, дякую. Йду до мами.", words: ["Nie, ďakujem", "Idem k mame"], intro: "Nie, ďakujem, idem k mame." },
                        middle: { phrase: "Prepáčte, nemám záujem. Idem za rodičmi.", translation: "Перепрошую, мене це не цікавить. Йду до батьків.", words: ["Prepáčte", "nemám záujem", "Idem za", "rodičmi"], intro: "Prepáčte, nemám záujem. Idem za rodičmi." },
                        senior: { phrase: "Prepáčte, nemám záujem, idem za rodičmi, oni ma čakajú a viem aj číslo 112.", translation: "Перепрошую, мене це не цікавить, я йду до батьків, вони на мене чекають, і я знаю номер 112.", words: ["Prepáčte, nemám záujem", "idem za rodičmi", "oni ma čakajú", "a viem aj číslo 112"], intro: "Prepáčte, nemám záujem, idem za rodičmi, oni ma čakajú a viem aj číslo 112." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🚶", title: { uk: "Ввічливо відмовляє незнайомцю на вулиці", ru: "Вежливо отказывает незнакомцу на улице" } },
                        { id: 2, title_icon: "🎪", title: { uk: "Йде до батьків, коли хтось чужий заговорює на ярмарку", ru: "Идёт к родителям, когда кто-то чужой заговаривает на ярмарке" } },
                        { id: 3, title_icon: "🛡️", title: { uk: "Впевнено повторює всі правила безпеки поспіль", ru: "Уверенно повторяет все правила безопасности подряд" } },
                        { id: 4, title_icon: "🏆", title: { uk: "Пишається, що вивчив стільки корисних фраз", ru: "Гордится, что выучил столько полезных фраз" } }
                    ],
                    mistake_or_joke: null
                }
            }
        }
    }
};

curriculumCatalog[5] = {
    theme: "Кольори, хобі та тварини",
    weeks: {
        1: {
            days: {
                1: {
                    topic: "Кольори",
                    is_safety: false,
                    hint: {
                        uk: "«Červené» — червоне. Слово змінюється залежно від предмета, але поки досить запам'ятати основну форму.",
                        ru: "«Červené» — красное. Слово меняется в зависимости от предмета, но пока достаточно запомнить основную форму."
                    },
                    tracks: {
                        junior: { phrase: "Červené.", translation: "Червоне.", words: ["Červené"], intro: "Toto je červené." },
                        middle: { phrase: "Aká farba je to? Toto je červené.", translation: "Який це колір? Це червоне.", words: ["Aká farba", "je to", "Toto je", "červené"], intro: "Aká farba je to? Toto je červené." },
                        senior: { phrase: "Aká je to farba? Myslím, že je to jasne červené alebo možno oranžové.", translation: "Який це колір? Думаю, це яскраво-червоний або, можливо, оранжевий.", words: ["Aká je to farba", "Myslím, že je to", "jasne červené", "alebo možno oranžové"], intro: "Aká je to farba? Myslím, že je to jasne červené." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎨", title: { uk: "Називає кольори олівців на уроці малювання", ru: "Называет цвета карандашей на уроке рисования" } },
                        { id: 2, title_icon: "👕", title: { uk: "Обирає футболку улюбленого кольору", ru: "Выбирает футболку любимого цвета" } },
                        { id: 3, title_icon: "🌈", title: { uk: "Показує веселку татові", ru: "Показывает радугу папе" } },
                        { id: 4, title_icon: "🖍️", title: { uk: "Просить у друга олівець потрібного кольору", ru: "Просит у друга карандаш нужного цвета" } }
                    ],
                    mistake_or_joke: "Ой, я назвала жовтий замість червоного! Кольори іноді так легко переплутати."
                },
                2: {
                    topic: "Форми",
                    is_safety: false,
                    hint: {
                        uk: "«Kruh, štvorec, trojuholník» — коло, квадрат, трикутник. Три базові форми на все життя!",
                        ru: "«Kruh, štvorec, trojuholník» — круг, квадрат, треугольник. Три базовые формы на всю жизнь!"
                    },
                    tracks: {
                        junior: { phrase: "Kruh, štvorec.", translation: "Коло, квадрат.", words: ["Kruh", "štvorec"], intro: "Toto je kruh a toto je štvorec." },
                        middle: { phrase: "Toto je kruh, štvorec a trojuholník.", translation: "Це коло, квадрат і трикутник.", words: ["Toto je", "kruh", "štvorec", "a trojuholník"], intro: "Toto je kruh, štvorec a trojuholník." },
                        senior: { phrase: "Toto je kruh, toto štvorec a toto trojuholník, vieš ich rozoznať?", translation: "Це коло, це квадрат, а це трикутник, ти можеш їх розрізнити?", words: ["Toto je kruh", "toto štvorec", "a toto trojuholník", "vieš ich rozoznať"], intro: "Toto je kruh, toto štvorec a toto trojuholník." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "📐", title: { uk: "Вивчає форми на уроці математики", ru: "Изучает формы на уроке математики" } },
                        { id: 2, title_icon: "🧩", title: { uk: "Складає пазл із геометричних форм", ru: "Собирает пазл из геометрических форм" } },
                        { id: 3, title_icon: "🎨", title: { uk: "Малює будиночок з різних форм", ru: "Рисует домик из разных форм" } },
                        { id: 4, title_icon: "🍕", title: { uk: "Порівнює форму піци й коробки", ru: "Сравнивает форму пиццы и коробки" } }
                    ],
                    mistake_or_joke: "Хвилинку, я мало не назвала квадрат трикутником! Форми бувають підступні."
                },
                3: {
                    topic: "Рахуємо",
                    is_safety: false,
                    hint: {
                        uk: "Найкращий спосіб вивчити числа — рахувати вголос кожного дня, наприклад сходинки.",
                        ru: "Лучший способ выучить числа — считать вслух каждый день, например ступеньки."
                    },
                    tracks: {
                        junior: { phrase: "Jeden, dva, tri.", translation: "Один, два, три.", words: ["Jeden", "dva", "tri"], intro: "Vieme počítať: jeden, dva, tri!" },
                        middle: { phrase: "Viem počítať do desať.", translation: "Я вмію рахувати до десяти.", words: ["Viem počítať", "do desať"], intro: "Viem počítať do desať." },
                        senior: { phrase: "Viem počítať po slovensky až do dvadsať.", translation: "Я вмію рахувати словацькою аж до двадцяти.", words: ["Viem počítať", "po slovensky", "až do", "dvadsať"], intro: "Viem počítať po slovensky až do dvadsať." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🔢", title: { uk: "Рахує сходинки, піднімаючись додому", ru: "Считает ступеньки, поднимаясь домой" } },
                        { id: 2, title_icon: "🍬", title: { uk: "Рахує цукерки, ділячись з другом", ru: "Считает конфеты, делясь с другом" } },
                        { id: 3, title_icon: "⚽", title: { uk: "Рахує голи під час гри у футбол", ru: "Считает голы во время игры в футбол" } },
                        { id: 4, title_icon: "👩‍🏫", title: { uk: "Рахує разом з учителькою на уроці", ru: "Считает вместе с учительницей на уроке" } }
                    ],
                    mistake_or_joke: "Ой, я пропустила число сім! Рахувати швидко — непросто навіть для мене."
                }
            }
        },
        2: {
            days: {
                1: {
                    topic: "🛡️ Безпека: знаю номер мами",
                    is_safety: true,
                    hint: {
                        uk: "Знати номер телефону мами й тата напам'ять — важлива навичка на випадок, якщо загубишся.",
                        ru: "Знать номер телефона мамы и папы наизусть — важный навык на случай, если потеряешься."
                    },
                    tracks: {
                        junior: { phrase: "Viem číslo mamy.", translation: "Знаю номер мами.", words: ["Viem", "číslo mamy"], intro: "Viem číslo telefónu mamy." },
                        middle: { phrase: "Poznám telefónne číslo mamy naspamäť.", translation: "Я знаю номер телефону мами напам'ять.", words: ["Poznám", "telefónne číslo mamy", "naspamäť"], intro: "Poznám telefónne číslo mamy naspamäť." },
                        senior: { phrase: "Poznám telefónne číslo mamy aj otca naspamäť, keby som ich potreboval.", translation: "Я знаю номер телефону мами й тата напам'ять, якщо вони мені знадобляться.", words: ["Poznám telefónne číslo", "mamy aj otca", "naspamäť", "keby som ich potreboval"], intro: "Poznám telefónne číslo mamy aj otca naspamäť." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "📞", title: { uk: "Показує вчительці, що знає номер мами", ru: "Показывает учительнице, что знает номер мамы" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Розповідає номер мами на випадок екстреної ситуації в школі", ru: "Рассказывает номер мамы на случай экстренной ситуации в школе" } },
                        { id: 3, title_icon: "🛡️", title: { uk: "Тренується повторювати номер разом з татом", ru: "Тренируется повторять номер вместе с папой" } },
                        { id: 4, title_icon: "👫", title: { uk: "Ділиться порадою з другом, чому це важливо", ru: "Делится советом с другом, почему это важно" } }
                    ],
                    mistake_or_joke: null
                },
                2: {
                    topic: "Ким я хочу стати",
                    is_safety: false,
                    hint: {
                        uk: "«Chcem byť ako...» — хочу бути схожим на... Гарна фраза, щоб розповісти про мрії.",
                        ru: "«Chcem byť ako...» — хочу быть похожим на... Хорошая фраза, чтобы рассказать о мечтах."
                    },
                    tracks: {
                        junior: { phrase: "Chcem byť ako mama.", translation: "Хочу бути як мама.", words: ["Chcem byť", "ako mama"], intro: "Chcem byť raz ako mama." },
                        middle: { phrase: "Chcem byť ako moja mama alebo otec.", translation: "Хочу бути як моя мама або тато.", words: ["Chcem byť", "ako moja mama", "alebo otec"], intro: "Chcem byť ako moja mama alebo otec." },
                        senior: { phrase: "Keď vyrastiem, chcem robiť podobnú prácu ako moja mama alebo otec.", translation: "Коли виросту, хочу займатись схожою роботою, як моя мама чи тато.", words: ["Keď vyrastiem", "chcem robiť", "podobnú prácu ako", "moja mama alebo otec"], intro: "Keď vyrastiem, chcem robiť podobnú prácu ako moja mama alebo otec." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "👩‍⚕️", title: { uk: "Розповідає, ким хоче стати, на уроці", ru: "Рассказывает, кем хочет стать, на уроке" } },
                        { id: 2, title_icon: "👨‍👩‍👧", title: { uk: "Ділиться мрією про професію з батьками", ru: "Делится мечтой о профессии с родителями" } },
                        { id: 3, title_icon: "🎨", title: { uk: "Малює себе в майбутній професії", ru: "Рисует себя в будущей профессии" } },
                        { id: 4, title_icon: "👫", title: { uk: "Обговорює мрії про майбутнє з другом", ru: "Обсуждает мечты о будущем с другом" } }
                    ],
                    mistake_or_joke: "Ого, скільки цікавих професій можна назвати! Я теж колись мріяла стати вчителькою."
                },
                3: {
                    topic: "Моє хобі",
                    is_safety: false,
                    hint: {
                        uk: "«Rád/rada» — хлопчик каже «rád», дівчинка — «rada», коли розповідає, що любить робити.",
                        ru: "«Rád/rada» — мальчик говорит «rád», девочка — «rada», когда рассказывает, что любит делать."
                    },
                    tracks: {
                        junior: { phrase: "Kreslím, spievam.", translation: "Малюю, співаю.", words: ["Kreslím", "spievam"], intro: "Rád kreslím a spievam." },
                        middle: { phrase: "Rád/rada kreslím a spievam.", translation: "Я люблю малювати і співати.", words: ["Rád/rada", "kreslím", "a spievam"], intro: "Rád kreslím a spievam." },
                        senior: { phrase: "Vo voľnom čase najradšej kreslím, spievam a čítam knihy.", translation: "У вільний час найбільше люблю малювати, співати і читати книги.", words: ["Vo voľnom čase", "najradšej kreslím", "spievam", "a čítam knihy"], intro: "Vo voľnom čase najradšej kreslím, spievam a čítam knihy." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎨", title: { uk: "Розповідає новому другові про своє хобі", ru: "Рассказывает новому другу о своём хобби" } },
                        { id: 2, title_icon: "🎤", title: { uk: "Ділиться захопленням зі шкільним гуртком", ru: "Делится увлечением со школьным кружком" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Показує малюнок батькам", ru: "Показывает рисунок родителям" } },
                        { id: 4, title_icon: "📖", title: { uk: "Розповідає вчительці про улюблену книгу", ru: "Рассказывает учительнице о любимой книге" } }
                    ],
                    mistake_or_joke: "Ой, я забула згадати своє улюблене хобі — читання! Люблю книжки понад усе."
                }
            }
        },
        3: {
            days: {
                1: {
                    topic: "Активний відпочинок",
                    is_safety: false,
                    hint: {
                        uk: "«Futbal, tanec» звучать майже так само, як українською — легко запам'ятати відразу.",
                        ru: "«Futbal, tanec» звучат почти так же, как по-русски — легко запомнить сразу."
                    },
                    tracks: {
                        junior: { phrase: "Futbal, tanec.", translation: "Футбол, танець.", words: ["Futbal", "tanec"], intro: "Hrám futbal a tancujem." },
                        middle: { phrase: "Hrám futbal a tancujem.", translation: "Граю у футбол і танцюю.", words: ["Hrám", "futbal", "a tancujem"], intro: "Hrám futbal a tancujem." },
                        senior: { phrase: "Rád hrám futbal a moja sestra zase chodí tancovať.", translation: "Я люблю грати у футбол, а моя сестра ходить на танці.", words: ["Rád hrám futbal", "a moja sestra", "zase chodí", "tancovať"], intro: "Rád hrám futbal a moja sestra zase chodí tancovať." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "⚽", title: { uk: "Розповідає тренеру, що любить футбол", ru: "Рассказывает тренеру, что любит футбол" } },
                        { id: 2, title_icon: "💃", title: { uk: "Запрошує друга на танцювальний гурток", ru: "Приглашает друга на танцевальный кружок" } },
                        { id: 3, title_icon: "🏫", title: { uk: "Розповідає класу про своє захоплення спортом", ru: "Рассказывает классу о своём увлечении спортом" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Показує батькам новий танцювальний рух", ru: "Показывает родителям новое танцевальное движение" } }
                    ],
                    mistake_or_joke: "Ой, я закрутилась і трохи заплуталась у словах! Танці — це весело, навіть коли помиляєшся."
                },
                2: {
                    topic: "🛡️ Безпека: не надсилаю фото",
                    is_safety: true,
                    hint: {
                        uk: "Свої фотографії ніколи не надсилай незнайомим людям в інтернеті, навіть якщо здається, що вони добрі.",
                        ru: "Свои фотографии никогда не отправляй незнакомым людям в интернете, даже если кажется, что они добрые."
                    },
                    tracks: {
                        junior: { phrase: "Fotky neposielam.", translation: "Фото не надсилаю.", words: ["Fotky", "neposielam"], intro: "Svoje fotky nikomu neposielam." },
                        middle: { phrase: "Nikdy neposielam svoje fotky cudzím ľuďom online.", translation: "Ніколи не надсилаю свої фото чужим людям онлайн.", words: ["Nikdy neposielam", "svoje fotky", "cudzím ľuďom", "online"], intro: "Nikdy neposielam svoje fotky cudzím ľuďom online." },
                        senior: { phrase: "Cudzím ľuďom na internete nikdy neposielam svoje fotky, ani keď mi niečo ponúkajú.", translation: "Чужим людям в інтернеті я ніколи не надсилаю свої фото, навіть якщо мені щось пропонують.", words: ["Cudzím ľuďom na internete", "nikdy neposielam", "svoje fotky", "ani keď mi niečo ponúkajú"], intro: "Cudzím ľuďom na internete nikdy neposielam svoje fotky." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "📱", title: { uk: "Онлайн-знайомий просить надіслати фото", ru: "Онлайн-знакомый просит отправить фото" } },
                        { id: 2, title_icon: "🎮", title: { uk: "У грі пропонують «бонус» за фото", ru: "В игре предлагают «бонус» за фото" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Розповідає батькам про підозріле прохання", ru: "Рассказывает родителям о подозрительной просьбе" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Пояснює правило молодшій сестрі", ru: "Объясняет правило младшей сестре" } }
                    ],
                    mistake_or_joke: null
                },
                3: {
                    topic: "Домашні улюбленці",
                    is_safety: false,
                    hint: {
                        uk: "«Pes» — пес, «mačka» — кішка. Два найпоширеніші домашні улюбленці словацькою.",
                        ru: "«Pes» — пёс, «mačka» — кошка. Два самых распространённых домашних питомца по-словацки."
                    },
                    tracks: {
                        junior: { phrase: "Pes, mačka.", translation: "Пес, кішка.", words: ["Pes", "mačka"], intro: "Mám psa a mačku." },
                        middle: { phrase: "Mám psa a mačku.", translation: "У мене є пес і кішка.", words: ["Mám", "psa", "a mačku"], intro: "Mám psa a mačku." },
                        senior: { phrase: "Doma mám psa a mačku, hráme sa spolu každý deň.", translation: "Вдома у мене є пес і кішка, ми граємось разом щодня.", words: ["Doma mám", "psa a mačku", "hráme sa spolu", "každý deň"], intro: "Doma mám psa a mačku, hráme sa spolu každý deň." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🐶", title: { uk: "Знайомить друга зі своїм песиком", ru: "Знакомит друга со своей собакой" } },
                        { id: 2, title_icon: "🐱", title: { uk: "Розповідає вчительці про свою кішку", ru: "Рассказывает учительнице о своей кошке" } },
                        { id: 3, title_icon: "🏘️", title: { uk: "Показує сусідам нового домашнього улюбленця", ru: "Показывает соседям нового домашнего питомца" } },
                        { id: 4, title_icon: "🎨", title: { uk: "Малює свого улюбленця на уроці", ru: "Рисует своего питомца на уроке" } }
                    ],
                    mistake_or_joke: "Ой, я назвала кішку песиком! Обидва такі пухнасті, що я іноді плутаю."
                }
            }
        },
        4: {
            days: {
                1: {
                    topic: "На фермі",
                    is_safety: false,
                    hint: {
                        uk: "«Krava, kôň» — корова, кінь. Класичні тварини, яких можна побачити на будь-якій фермі.",
                        ru: "«Krava, kôň» — корова, конь. Классические животные, которых можно увидеть на любой ферме."
                    },
                    tracks: {
                        junior: { phrase: "Krava, kôň.", translation: "Корова, кінь.", words: ["Krava", "kôň"], intro: "Toto je krava a toto kôň." },
                        middle: { phrase: "Na farme sú kravy a kone.", translation: "На фермі є корови й коні.", words: ["Na farme", "sú kravy", "a kone"], intro: "Na farme sú kravy a kone." },
                        senior: { phrase: "Na farme sme videli kravy, kone a ešte veľa sliepok.", translation: "На фермі ми бачили корів, коней і ще багато курей.", words: ["Na farme sme videli", "kravy, kone", "a ešte", "veľa sliepok"], intro: "Na farme sme videli kravy, kone a ešte veľa sliepok." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🐄", title: { uk: "Відвідує ферму разом зі шкільним класом", ru: "Посещает ферму вместе со школьным классом" } },
                        { id: 2, title_icon: "🐔", title: { uk: "Годує курей у бабусиному господарстві", ru: "Кормит кур в бабушкином хозяйстве" } },
                        { id: 3, title_icon: "🐴", title: { uk: "Катається на поні на фермі", ru: "Катается на пони на ферме" } },
                        { id: 4, title_icon: "📸", title: { uk: "Фотографує тварин на фермі для проєкту", ru: "Фотографирует животных на ферме для проекта" } }
                    ],
                    mistake_or_joke: "Ой, я мало не назвала коня коровою! На фермі стільки тварин одразу."
                },
                2: {
                    topic: "Догляд за улюбленцем",
                    is_safety: false,
                    hint: {
                        uk: "«Kŕmim» — годую. Турбота про тварину — це щоденний обов'язок і приємність одночасно.",
                        ru: "«Kŕmim» — кормлю. Забота о животном — это ежедневная обязанность и приятность одновременно."
                    },
                    tracks: {
                        junior: { phrase: "Kŕmim psa.", translation: "Годую пса.", words: ["Kŕmim", "psa"], intro: "Každý deň kŕmim psa." },
                        middle: { phrase: "Kŕmim svojho psa každý deň.", translation: "Я годую свого пса щодня.", words: ["Kŕmim", "svojho psa", "každý deň"], intro: "Kŕmim svojho psa každý deň." },
                        senior: { phrase: "Každý deň kŕmim svojho psa a chodím s ním na prechádzku.", translation: "Щодня я годую свого пса і гуляю з ним.", words: ["Každý deň kŕmim", "svojho psa", "a chodím s ním", "na prechádzku"], intro: "Každý deň kŕmim svojho psa a chodím s ním na prechádzku." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🐕", title: { uk: "Годує собаку вранці перед школою", ru: "Кормит собаку утром перед школой" } },
                        { id: 2, title_icon: "🚶", title: { uk: "Вигулює пса разом з татом", ru: "Выгуливает пса вместе с папой" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Розповідає батькам про свої обов'язки з улюбленцем", ru: "Рассказывает родителям о своих обязанностях с питомцем" } },
                        { id: 4, title_icon: "🏫", title: { uk: "Розповідає класу про турботу про тварин", ru: "Рассказывает классу о заботе о животных" } }
                    ],
                    mistake_or_joke: "Ой, я мало не забула про воду для песика! Турбота про тварину — це серйозна справа."
                },
                3: {
                    topic: "🛡️ Безпека: чужі тварини",
                    is_safety: true,
                    hint: {
                        uk: "Навіть найдобріша на вигляд чужа тварина може налякатись. Завжди спочатку питай дозволу в господаря.",
                        ru: "Даже самое добродушное на вид чужое животное может испугаться. Всегда сначала спрашивай разрешения у хозяина."
                    },
                    tracks: {
                        junior: { phrase: "Nehladkám cudze zviera.", translation: "Не гладжу чужу тварину.", words: ["Nehladkám", "cudze zviera"], intro: "Nehladkám cudzie zvieratá." },
                        middle: { phrase: "Nehladkám cudzie zvieratá bez dovolenia majiteľa.", translation: "Я не гладжу чужих тварин без дозволу господаря.", words: ["Nehladkám cudzie zvieratá", "bez dovolenia", "majiteľa"], intro: "Nehladkám cudzie zvieratá bez dovolenia majiteľa." },
                        senior: { phrase: "Cudzie zviera nikdy nehladkám, kým sa nespýtam majiteľa, či môžem.", translation: "Чужу тварину я ніколи не гладжу, поки не запитаю господаря, чи можна.", words: ["Cudzie zviera", "nikdy nehladkám", "kým sa nespýtam", "majiteľa, či môžem"], intro: "Cudzie zviera nikdy nehladkám, kým sa nespýtam majiteľa, či môžem." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🐕", title: { uk: "Бачить незнайомого собаку в парку", ru: "Видит незнакомую собаку в парке" } },
                        { id: 2, title_icon: "🐈", title: { uk: "Хоче погладити сусідську кішку", ru: "Хочет погладить соседскую кошку" } },
                        { id: 3, title_icon: "🙋", title: { uk: "Питає дозволу в господаря перед тим, як погладити", ru: "Спрашивает разрешения у хозяина перед тем, как погладить" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Пояснює правило молодшому братику", ru: "Объясняет правило младшему брату" } }
                    ],
                    mistake_or_joke: null
                }
            }
        }
    }
};

curriculumCatalog[6] = {
    theme: "Техніка, дружба та подорожі",
    weeks: {
        1: {
            days: {
                1: {
                    topic: "Моя техніка",
                    is_safety: false,
                    hint: {
                        uk: "«Telefón, tablet» звучать майже так само, як українською — легко впізнати одразу.",
                        ru: "«Telefón, tablet» звучат почти так же, как по-русски — легко узнать сразу."
                    },
                    tracks: {
                        junior: { phrase: "Telefón, tablet.", translation: "Телефон, планшет.", words: ["Telefón", "tablet"], intro: "Toto je môj telefón a tablet." },
                        middle: { phrase: "Toto je môj telefón a tablet.", translation: "Це мій телефон і планшет.", words: ["Toto je", "môj telefón", "a tablet"], intro: "Toto je môj telefón a tablet." },
                        senior: { phrase: "Toto je môj telefón a toto môj tablet, dostal som ich od rodičov.", translation: "Це мій телефон, а це мій планшет, я отримав їх від батьків.", words: ["Toto je môj telefón", "a toto môj tablet", "dostal som ich", "od rodičov"], intro: "Toto je môj telefón a toto môj tablet, dostal som ich od rodičov." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "📱", title: { uk: "Показує другові новий телефон", ru: "Показывает другу новый телефон" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Розповідає класу про свій планшет", ru: "Рассказывает классу о своём планшете" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Дякує батькам за подарунок", ru: "Благодарит родителей за подарок" } },
                        { id: 4, title_icon: "🎒", title: { uk: "Складає техніку в портфель обережно", ru: "Складывает технику в портфель бережно" } }
                    ],
                    mistake_or_joke: "Ой, я мало не переплутала телефон і планшет! Обидва такі схожі на вигляд."
                },
                2: {
                    topic: "Ігри на планшеті",
                    is_safety: false,
                    hint: {
                        uk: "«S dovolením rodičov» — з дозволу батьків. Важлива умова для будь-яких ігор в інтернеті.",
                        ru: "«S dovolením rodičov» — с разрешения родителей. Важное условие для любых игр в интернете."
                    },
                    tracks: {
                        junior: { phrase: "Hrám na tablete.", translation: "Граю на планшеті.", words: ["Hrám", "na tablete"], intro: "Hrám hry na tablete." },
                        middle: { phrase: "Hrám hry na tablete.", translation: "Граю в ігри на планшеті.", words: ["Hrám", "hry", "na tablete"], intro: "Hrám hry na tablete." },
                        senior: { phrase: "Rád hrám hry na tablete, ale iba s dovolením rodičov.", translation: "Я люблю грати в ігри на планшеті, але лише з дозволу батьків.", words: ["Rád hrám hry", "na tablete", "ale iba", "s dovolením rodičov"], intro: "Rád hrám hry na tablete, ale iba s dovolením rodičov." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎮", title: { uk: "Питає батьків дозволу пограти на планшеті", ru: "Спрашивает у родителей разрешения поиграть на планшете" } },
                        { id: 2, title_icon: "⏰", title: { uk: "Домовляється про час гри з мамою", ru: "Договаривается о времени игры с мамой" } },
                        { id: 3, title_icon: "👫", title: { uk: "Грає разом з другом в одну гру", ru: "Играет вместе с другом в одну игру" } },
                        { id: 4, title_icon: "🏆", title: { uk: "Хизується новим рекордом у грі", ru: "Хвастается новым рекордом в игре" } }
                    ],
                    mistake_or_joke: "Стривай, я забула спитати дозволу спочатку! Правило важливе навіть для мене."
                },
                3: {
                    topic: "Дзвінок бабусі",
                    is_safety: false,
                    hint: {
                        uk: "«Voláme cez video» — телефонуємо через відео. Чудовий спосіб не втрачати зв'язок із родиною далеко.",
                        ru: "«Voláme cez video» — звоним по видео. Отличный способ не терять связь с семьёй вдали."
                    },
                    tracks: {
                        junior: { phrase: "Voláme babke.", translation: "Дзвонимо бабусі.", words: ["Voláme", "babke"], intro: "Poďme zavolať babke." },
                        middle: { phrase: "Voláme starým rodičom cez video.", translation: "Дзвонимо бабусі й дідусю через відео.", words: ["Voláme", "starým rodičom", "cez video"], intro: "Voláme starým rodičom cez video." },
                        senior: { phrase: "Každý týždeň voláme starým rodičom cez video, aby sme im ukázali, čo je nové.", translation: "Щотижня ми дзвонимо бабусі й дідусю через відео, щоб показати їм, що нового.", words: ["Každý týždeň voláme", "starým rodičom cez video", "aby sme im ukázali", "čo je nové"], intro: "Každý týždeň voláme starým rodičom cez video." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "📞", title: { uk: "Телефонує бабусі через відеозв'язок у неділю", ru: "Звонит бабушке по видеосвязи в воскресенье" } },
                        { id: 2, title_icon: "🖼️", title: { uk: "Показує бабусі малюнок через екран", ru: "Показывает бабушке рисунок через экран" } },
                        { id: 3, title_icon: "🎂", title: { uk: "Вітає дідуся з днем народження по відео", ru: "Поздравляет дедушку с днём рождения по видео" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Допомагає мамі налаштувати відеодзвінок", ru: "Помогает маме настроить видеозвонок" } }
                    ],
                    mistake_or_joke: "Ой, я забула увімкнути камеру! Бабуся точно чекає, щоб мене побачити."
                }
            }
        },
        2: {
            days: {
                1: {
                    topic: "🛡️ Безпека: моє секретне слово",
                    is_safety: true,
                    hint: {
                        uk: "Пароль — це секрет, який знають лише батьки. Його не можна казати нікому іншому, навіть друзям.",
                        ru: "Пароль — это секрет, который знают только родители. Его нельзя говорить никому другому, даже друзьям."
                    },
                    tracks: {
                        junior: { phrase: "Heslo je tajné.", translation: "Пароль — секретний.", words: ["Heslo", "je tajné"], intro: "Moje heslo je tajné." },
                        middle: { phrase: "Svoje heslo nehovorím nikomu okrem rodičov.", translation: "Свій пароль я не кажу нікому, крім батьків.", words: ["Svoje heslo", "nehovorím nikomu", "okrem rodičov"], intro: "Svoje heslo nehovorím nikomu okrem rodičov." },
                        senior: { phrase: "Svoje heslo nikdy nehovorím nikomu okrem svojich rodičov.", translation: "Свій пароль я ніколи не кажу нікому, крім своїх батьків.", words: ["Svoje heslo", "nikdy nehovorím", "nikomu", "okrem svojich rodičov"], intro: "Svoje heslo nikdy nehovorím nikomu okrem svojich rodičov." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🔑", title: { uk: "Однокласник просить пароль від гри", ru: "Одноклассник просит пароль от игры" } },
                        { id: 2, title_icon: "💻", title: { uk: "Незнайомий у чаті просить пароль", ru: "Незнакомый в чате просит пароль" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Пояснює батькам, що пароль — це секрет", ru: "Объясняет родителям, что пароль — это секрет" } },
                        { id: 4, title_icon: "🛡️", title: { uk: "Розповідає другові, чому не можна ділитись паролем", ru: "Рассказывает другу, почему нельзя делиться паролем" } }
                    ],
                    mistake_or_joke: null
                },
                2: {
                    topic: "Що таке добрий друг",
                    is_safety: false,
                    hint: {
                        uk: "«Počúva» — слухає. Справжній друг завжди уважно слухає і допомагає, коли потрібно.",
                        ru: "«Počúva» — слушает. Настоящий друг всегда внимательно слушает и помогает, когда нужно."
                    },
                    tracks: {
                        junior: { phrase: "Dobrý kamarát.", translation: "Добрий друг.", words: ["Dobrý", "kamarát"], intro: "Máš dobrého kamaráta?" },
                        middle: { phrase: "Dobrý kamarát ma počúva.", translation: "Добрий друг мене слухає.", words: ["Dobrý kamarát", "ma počúva"], intro: "Dobrý kamarát ma vždy počúva." },
                        senior: { phrase: "Dobrý kamarát ma vždy počúva a pomáha mi, keď to potrebujem.", translation: "Добрий друг завжди мене слухає і допомагає мені, коли це потрібно.", words: ["Dobrý kamarát", "ma vždy počúva", "a pomáha mi", "keď to potrebujem"], intro: "Dobrý kamarát ma vždy počúva a pomáha mi, keď to potrebujem." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "👫", title: { uk: "Дякує другові за підтримку в школі", ru: "Благодарит друга за поддержку в школе" } },
                        { id: 2, title_icon: "🤝", title: { uk: "Допомагає другові, який засмучений", ru: "Помогает другу, который расстроен" } },
                        { id: 3, title_icon: "👩‍🏫", title: { uk: "Розповідає вчительці, який у нього хороший друг", ru: "Рассказывает учительнице, какой у него хороший друг" } },
                        { id: 4, title_icon: "🎨", title: { uk: "Малює малюнок для найкращого друга", ru: "Рисует рисунок для лучшего друга" } }
                    ],
                    mistake_or_joke: "Ого, я так розчулилась, розповідаючи про дружбу! Хороші друзі — це справжній скарб."
                },
                3: {
                    topic: "Вибачення",
                    is_safety: false,
                    hint: {
                        uk: "«Prepáč» — вибач. Коротке й важливе слово, яке допомагає помиритись з другом.",
                        ru: "«Prepáč» — извини. Короткое и важное слово, которое помогает помириться с другом."
                    },
                    tracks: {
                        junior: { phrase: "Prepáč.", translation: "Вибач.", words: ["Prepáč"], intro: "Prepáč mi, prosím." },
                        middle: { phrase: "Prepáč, nechcel/nechcela som ťa nahnevať.", translation: "Вибач, я не хотів/хотіла тебе розсердити.", words: ["Prepáč", "nechcel/nechcela som", "ťa nahnevať"], intro: "Prepáč, nechcel som ťa nahnevať." },
                        senior: { phrase: "Prepáč, naozaj som ťa nechcel nahnevať, môžeme sa zase hrať spolu?", translation: "Вибач, я справді не хотів тебе розсердити, можемо знову гратись разом?", words: ["Prepáč", "naozaj som ťa", "nechcel nahnevať", "môžeme sa zase hrať spolu"], intro: "Prepáč, naozaj som ťa nechcel nahnevať." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🤗", title: { uk: "Вибачається перед другом після сварки", ru: "Извиняется перед другом после ссоры" } },
                        { id: 2, title_icon: "🏫", title: { uk: "Вибачається перед вчителькою за запізнення", ru: "Извиняется перед учительницей за опоздание" } },
                        { id: 3, title_icon: "👨‍👩‍👧", title: { uk: "Вибачається перед батьками за розбиту чашку", ru: "Извиняется перед родителями за разбитую чашку" } },
                        { id: 4, title_icon: "👫", title: { uk: "Мириться з братом після суперечки", ru: "Мирится с братом после спора" } }
                    ],
                    mistake_or_joke: "Ой, я забула вибачитись одразу! Краще сказати «prepáč» якомога швидше."
                }
            }
        },
        3: {
            days: {
                1: {
                    topic: "Прошу допомоги",
                    is_safety: false,
                    hint: {
                        uk: "«Pomôžeš mi?» — допоможеш мені? Не соромся просити допомоги, коли щось не виходить.",
                        ru: "«Pomôžeš mi?» — поможешь мне? Не стесняйся просить помощи, когда что-то не получается."
                    },
                    tracks: {
                        junior: { phrase: "Pomôžeš mi?", translation: "Допоможеш мені?", words: ["Pomôžeš", "mi"], intro: "Môžeš mi pomôcť?" },
                        middle: { phrase: "Môžeš mi pomôcť, prosím?", translation: "Можеш мені допомогти, будь ласка?", words: ["Môžeš mi", "pomôcť", "prosím"], intro: "Môžeš mi pomôcť, prosím?" },
                        senior: { phrase: "Prepáč, môžeš mi prosím pomôcť s touto úlohou?", translation: "Вибач, можеш мені, будь ласка, допомогти з цим завданням?", words: ["Prepáč", "môžeš mi prosím", "pomôcť", "s touto úlohou"], intro: "Prepáč, môžeš mi prosím pomôcť s touto úlohou?" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "📚", title: { uk: "Просить однокласника допомогти з домашнім завданням", ru: "Просит одноклассника помочь с домашним заданием" } },
                        { id: 2, title_icon: "🧩", title: { uk: "Просить допомоги зібрати складний пазл", ru: "Просит помощи собрать сложный пазл" } },
                        { id: 3, title_icon: "👩‍🏫", title: { uk: "Звертається до вчительки з питанням", ru: "Обращается к учительнице с вопросом" } },
                        { id: 4, title_icon: "🎒", title: { uk: "Просить допомогти застібнути рюкзак", ru: "Просит помочь застегнуть рюкзак" } }
                    ],
                    mistake_or_joke: "Ой, я так соромилась попросити допомогу! А насправді це зовсім не соромно."
                },
                2: {
                    topic: "🛡️ Безпека: розповідаю дорослому",
                    is_safety: true,
                    hint: {
                        uk: "Якщо хтось ображає чи кривдить — обов'язково розкажи про це дорослому, якому довіряєш. Це не ябедництво.",
                        ru: "Если кто-то обижает или причиняет вред — обязательно расскажи об этом взрослому, которому доверяешь. Это не ябедничество."
                    },
                    tracks: {
                        junior: { phrase: "Poviem to mame.", translation: "Скажу це мамі.", words: ["Poviem", "to mame"], intro: "Ak sa niečo stane, poviem to mame." },
                        middle: { phrase: "Ak ma niekto uráža, poviem to dospelému.", translation: "Якщо хтось мене ображає, я скажу про це дорослому.", words: ["Ak ma niekto", "uráža", "poviem to", "dospelému"], intro: "Ak ma niekto uráža, poviem to dospelému." },
                        senior: { phrase: "Ak sa ma niekto v škole snaží uraziť alebo ubližovať, vždy to poviem dospelému, ktorému dôverujem.", translation: "Якщо хтось у школі намагається мене образити чи скривдити, я завжди розповідаю про це дорослому, якому довіряю.", words: ["Ak sa ma niekto v škole", "snaží uraziť alebo ubližovať", "vždy to poviem", "dospelému, ktorému dôverujem"], intro: "Ak sa ma niekto v škole snaží uraziť alebo ubližovať, vždy to poviem dospelému, ktorému dôverujem." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "😢", title: { uk: "Розповідає мамі, що однокласник його образив", ru: "Рассказывает маме, что одноклассник его обидел" } },
                        { id: 2, title_icon: "👩‍🏫", title: { uk: "Звертається до вчительки за допомогою", ru: "Обращается к учительнице за помощью" } },
                        { id: 3, title_icon: "🛡️", title: { uk: "Пояснює другові, чому важливо розповідати дорослим", ru: "Объясняет другу, почему важно рассказывать взрослым" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Довіряє татові неприємну ситуацію", ru: "Доверяет папе неприятную ситуацию" } }
                    ],
                    mistake_or_joke: null
                },
                3: {
                    topic: "Мій день народження",
                    is_safety: false,
                    hint: {
                        uk: "«Mám narodeniny!» — у мене день народження! Радісна фраза для особливого дня.",
                        ru: "«Mám narodeniny!» — у меня день рождения! Радостная фраза для особенного дня."
                    },
                    tracks: {
                        junior: { phrase: "Mám narodeniny!", translation: "У мене день народження!", words: ["Mám", "narodeniny"], intro: "Dnes mám narodeniny!" },
                        middle: { phrase: "Dnes mám narodeniny!", translation: "Сьогодні у мене день народження!", words: ["Dnes mám", "narodeniny"], intro: "Dnes mám narodeniny!" },
                        senior: { phrase: "Dnes mám narodeniny a večer oslavujeme s celou rodinou.", translation: "Сьогодні у мене день народження, і ввечері ми святкуємо всією родиною.", words: ["Dnes mám narodeniny", "a večer", "oslavujeme", "s celou rodinou"], intro: "Dnes mám narodeniny a večer oslavujeme s celou rodinou." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎂", title: { uk: "Розповідає класу, що сьогодні його день народження", ru: "Рассказывает классу, что сегодня его день рождения" } },
                        { id: 2, title_icon: "🎈", title: { uk: "Запрошує друзів на святкування", ru: "Приглашает друзей на празднование" } },
                        { id: 3, title_icon: "🎁", title: { uk: "Дякує за подарунки на святі", ru: "Благодарит за подарки на празднике" } },
                        { id: 4, title_icon: "👨‍👩‍👧", title: { uk: "Святкує день народження з родиною", ru: "Празднует день рождения с семьёй" } }
                    ],
                    mistake_or_joke: "Ого, вітаю з днем народження! Навіть я радію разом з тобою."
                }
            }
        },
        4: {
            days: {
                1: {
                    topic: "Дякую за подарунок",
                    is_safety: false,
                    hint: {
                        uk: "«Ďakujem pekne» — дуже дякую. Ввічливий і теплий спосіб подякувати за щось приємне.",
                        ru: "«Ďakujem pekne» — большое спасибо. Вежливый и тёплый способ поблагодарить за что-то приятное."
                    },
                    tracks: {
                        junior: { phrase: "Ďakujem!", translation: "Дякую!", words: ["Ďakujem"], intro: "Ďakujem veľmi pekne!" },
                        middle: { phrase: "Ďakujem za darček!", translation: "Дякую за подарунок!", words: ["Ďakujem", "za darček"], intro: "Ďakujem za darček!" },
                        senior: { phrase: "Ďakujem pekne za tento krásny darček, veľmi sa mi páči!", translation: "Дуже дякую за цей чудовий подарунок, він мені дуже подобається!", words: ["Ďakujem pekne", "za tento krásny darček", "veľmi sa mi", "páči"], intro: "Ďakujem pekne za tento krásny darček, veľmi sa mi páči!" }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🎁", title: { uk: "Дякує бабусі за подарунок на день народження", ru: "Благодарит бабушку за подарок на день рождения" } },
                        { id: 2, title_icon: "🎄", title: { uk: "Дякує за подарунок під ялинкою", ru: "Благодарит за подарок под ёлкой" } },
                        { id: 3, title_icon: "👫", title: { uk: "Дякує другові за приємний сюрприз", ru: "Благодарит друга за приятный сюрприз" } },
                        { id: 4, title_icon: "👩‍🏫", title: { uk: "Дякує вчительці за похвалу", ru: "Благодарит учительницу за похвалу" } }
                    ],
                    mistake_or_joke: "Ой, я мало не забула сказати «дякую»! Ввічливість — це завжди приємно."
                },
                2: {
                    topic: "Плануємо подорож",
                    is_safety: false,
                    hint: {
                        uk: "«Výlet» — подорож, екскурсія. Слово стане в пригоді, коли плануєш поїздку з родиною чи класом.",
                        ru: "«Výlet» — поездка, экскурсия. Слово пригодится, когда планируешь поездку с семьёй или классом."
                    },
                    tracks: {
                        junior: { phrase: "Ideme na výlet.", translation: "Їдемо в подорож.", words: ["Ideme", "na výlet"], intro: "Zajtra ideme na výlet!" },
                        middle: { phrase: "Ideme na výlet autom alebo vlakom.", translation: "Їдемо в подорож на машині або поїздом.", words: ["Ideme na výlet", "autom", "alebo vlakom"], intro: "Ideme na výlet autom alebo vlakom." },
                        senior: { phrase: "Tento víkend ideme na výlet, možno autom, možno vlakom.", translation: "Цих вихідних ми їдемо в подорож, можливо, машиною, можливо, поїздом.", words: ["Tento víkend", "ideme na výlet", "možno autom", "možno vlakom"], intro: "Tento víkend ideme na výlet, možno autom, možno vlakom." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🚂", title: { uk: "Планує подорож поїздом з родиною", ru: "Планирует поездку на поезде с семьёй" } },
                        { id: 2, title_icon: "🚗", title: { uk: "Обговорює маршрут подорожі з татом", ru: "Обсуждает маршрут поездки с папой" } },
                        { id: 3, title_icon: "🏫", title: { uk: "Розповідає класу про шкільну екскурсію", ru: "Рассказывает классу о школьной экскурсии" } },
                        { id: 4, title_icon: "🎒", title: { uk: "Пакує речі перед подорожжю", ru: "Собирает вещи перед поездкой" } }
                    ],
                    mistake_or_joke: "Ой, я мало не забула карту! Подорож без плану — це справжня пригода."
                },
                3: {
                    topic: "🛡️ Безпека: загубився на виїзді",
                    is_safety: true,
                    hint: {
                        uk: "Якщо загубився під час подорожі — шукай людину в уніформі (працівника вокзалу, охоронця) і попроси допомоги.",
                        ru: "Если потерялся во время поездки — ищи человека в форме (работника вокзала, охранника) и попроси помощи."
                    },
                    tracks: {
                        junior: { phrase: "Hľadám uniformu.", translation: "Шукаю уніформу.", words: ["Hľadám", "uniformu"], intro: "Ak sa stratím, hľadám niekoho v uniforme." },
                        middle: { phrase: "Ak sa stratím na výlete, hľadám niekoho v uniforme.", translation: "Якщо загублюся в подорожі, шукаю когось в уніформі.", words: ["Ak sa stratím", "na výlete", "hľadám niekoho", "v uniforme"], intro: "Ak sa stratím na výlete, hľadám niekoho v uniforme." },
                        senior: { phrase: "Ak sa na výlete stratím, hľadám niekoho v uniforme alebo pracovníka a poprosím o pomoc.", translation: "Якщо я загублюся під час подорожі, шукаю когось в уніформі або працівника і прошу про допомогу.", words: ["Ak sa na výlete stratím", "hľadám niekoho v uniforme", "alebo pracovníka", "a poprosím o pomoc"], intro: "Ak sa na výlete stratím, hľadám niekoho v uniforme alebo pracovníka a poprosím o pomoc." }
                    },
                    scenarios: [
                        { id: 1, title_icon: "🚉", title: { uk: "Загубився на вокзалі під час подорожі", ru: "Потерялся на вокзале во время поездки" } },
                        { id: 2, title_icon: "✈️", title: { uk: "Не бачить батьків в аеропорту", ru: "Не видит родителей в аэропорту" } },
                        { id: 3, title_icon: "👮", title: { uk: "Звертається до працівника в уніформі по допомогу", ru: "Обращается к работнику в форме за помощью" } },
                        { id: 4, title_icon: "🏆", title: { uk: "Пишається, що знає всі правила безпеки", ru: "Гордится, что знает все правила безопасности" } }
                    ],
                    mistake_or_joke: null
                }
            }
        }
    }
};

// Metadata for dynamically building Months 3-12 on the fly if chosen
const monthMetadata = {
    3: {
        theme: "Школа та шлях до школи",
        weeks: {
            1: { topic: "У класі", phrase: "Toto je moja trieda. Toto je moja učiteľka.", is_safety: false, hint: "Učiteľka — довге слово, розбий: у-чи-тель-ка." },
            2: { topic: "Шкільні речі", phrase: "Potrebujem pero a zošit.", is_safety: false, hint: "«Potrebujem» означає «мені потрібно»." },
            3: { topic: "Розклад та предмети", phrase: "Dnes mám matematiku a telesnú výchovu.", is_safety: false, hint: "Telesná výchova — фізкультура." },
            4: { topic: "🛡️ Безпека: дорога до школи", phrase: "Idem do školy len s tým, koho poznajú moji rodičia", is_safety: true, hint: "Ніколи не йди з незнайомцями." }
        }
    },
    4: {
        theme: "Їжа та святковий стіл",
        weeks: {
            1: { topic: "Улюблена їжа", phrase: "Mám rád jablká a chlieb.", is_safety: false, hint: "«Mám rád» (хлопчик) / «Mám rada» (дівчинка)." },
            2: { topic: "За столом", phrase: "Prosím, môžem dostať vodu?", is_safety: false, hint: "«Prosím» підходить до будь-якого прохання." },
            3: { topic: "Свята кухня", phrase: "Toto voňa výborne! Čo je to?", is_safety: false, hint: "«Voňa výborne» — чудово пахне." },
            4: { topic: "🛡️ Безпека: частування", phrase: "Neberiem sladkosti od cudzích ľudí", is_safety: true, hint: "Твердо відмовляйся від їжі сторонніх." }
        }
    },
    5: {
        theme: "Місто та транспорт",
        weeks: {
            1: { topic: "У місті", phrase: "Kde je najbližší obchod?", is_safety: false, hint: "«Najbližší» — найближчий." },
            2: { topic: "Транспорт", phrase: "Tento autobus ide do centra?", is_safety: false, hint: "«Vlak» — потяг, «autobus» — автобус." },
            3: { topic: "Орієнтування", phrase: "Prepáčte, ako sa dostanem na námestie?", is_safety: false, hint: "«Námestie» — площа." },
            4: { topic: "🛡️ Безпека: транспорт", phrase: "Nenastupujem do auta k cudziemu človeku", is_safety: true, hint: "Ніколи не сідай у чужі машини." }
        }
    },
    6: {
        theme: "Погода, пори року, ярмарок",
        weeks: {
            1: { topic: "Погода", phrase: "Dnes je zima a prší.", is_safety: false, hint: "«Prší» — йде дощ." },
            2: { topic: "Одяг по сезону", phrase: "Potrebujem teplú bundu.", is_safety: false, hint: "«Bunda» — куртка." },
            3: { topic: "Зимовий ярмарок", phrase: "Koľko to stojí?", is_safety: false, hint: "«Koľko stojí» — скільки коштує." },
            4: { topic: "🛡️ Безпека: загубився в натовпі", phrase: "Ak sa stratím, zostanem stáť a zavolám mamu", is_safety: true, hint: "Стій на місці і голосно клич." }
        }
    },
    7: {
        theme: "Тіло та здоров'я",
        weeks: {
            1: { topic: "Частини тіла", phrase: "Bolí ma hlava.", is_safety: false, hint: "«Bolí ma hlava» — болить голова." },
            2: { topic: "У лікаря", phrase: "Necítim sa dobre.", is_safety: false, hint: "«Necítim sa dobre» — почуваюсь погано." },
            3: { topic: "Гігієна та самопочуття", phrase: "Umyl som si ruky pred jedlom.", is_safety: false, hint: "Мий руки перед їжею." },
            4: { topic: "🛡️ Безпека: тілесна автономія", phrase: "Moje telo patrí len mne. Ak niečo nie je v poriadku, poviem то dospelému", is_safety: true, hint: "Кажи дорослим, якщо хтось ображає." }
        }
    },
    8: {
        theme: "Магазин та покупки",
        weeks: {
            1: { topic: "В магазині", phrase: "Chcem kúpiť toto, prosím.", is_safety: false, hint: "«Chcem» — я хочу." },
            2: { topic: "Гроші та ціни", phrase: "Koľko to stojí? Je to drahé/lacné.", is_safety: false, hint: "«Drahé» — дорого, «lacné» — дешево." },
            3: { topic: "Примірка та вибір", phrase: "Môžem si to vyskúšať?", is_safety: false, hint: "«Vyskúšať» — приміряти." },
            4: { topic: "🛡️ Безпека: гроші та картки", phrase: "Nedávam peniaze ani kartu nikomu okrem rodičov", is_safety: true, hint: "Гроші та картки — це секрет." }
        }
    },
    9: {
        theme: "Друзі, почуття, інтернет",
        weeks: {
            1: { topic: "Vranči ta vvečeri", phrase: "Ráno vstávam o siedmej.", is_safety: false, hint: "Ráno = vranči" }
        }
    }
};

function getLegacyLessonData(m, w) {
    if (curriculumCatalog[m] && curriculumCatalog[m].weeks[w]) {
        return curriculumCatalog[m].weeks[w];
    }
    // Dynamic generator fallback for Months 3-12
    const meta = monthMetadata[m];
    if (!meta) return null;
    const weekMeta = meta.weeks[w];
    if (!weekMeta) return null;

    // Build dynamic track phrases
    const rawPhrase = weekMeta.phrase;
    const simplified = rawPhrase.split(' ')[0] + '!'; // simplified junior version
    
    return {
        topic: weekMeta.topic,
        is_safety: weekMeta.is_safety,
        hint: { uk: weekMeta.hint, ru: weekMeta.hint },
        tracks: {
            junior: {
                phrase: simplified,
                translation: simplified === 'Bolí!' ? 'Болить!' : (simplified === 'Dnes!' ? 'Сьогодні!' : 'Це!'),
                words: [simplified.replace('!', '')],
                intro: "Ahoj! Poďme sa zahrať!"
            },
            middle: {
                phrase: rawPhrase,
                translation: rawPhrase,
                words: rawPhrase.split(' '),
                intro: "Ahoj! Ja som Oksana. " + rawPhrase
            },
            senior: {
                phrase: rawPhrase + " Odkiaľ si?",
                translation: rawPhrase + " Звідки ти?",
                words: (rawPhrase + " Odkiaľ si?").split(' '),
                intro: "Ahoj! " + rawPhrase + " Odkiaľ si?"
            }
        },
        scenarios: [
            { id: 1, title_icon: "🚶", title: { uk: `Ситуація у контексті: ${weekMeta.topic} (Крок 1)`, ru: `Ситуация в контексте: ${weekMeta.topic} (Шаг 1)` } },
            { id: 2, title_icon: "💬", title: { uk: `Розмова з однокласником про ${weekMeta.topic}`, ru: `Разговор с одноклассником о ${weekMeta.topic}` } },
            { id: 3, title_icon: "🏫", title: { uk: `Урок у словацькій школі: ${weekMeta.topic}`, ru: `Урок в словацкой школе: ${weekMeta.topic}` } },
            { id: 4, title_icon: "🎮", title: { uk: `Практична життєва гра про ${weekMeta.topic}`, ru: `Практическая жизненная игра о ${weekMeta.topic}` } },
            { id: 5, title_icon: "🛡️", title: { uk: `🏆 Фінал тижня: ${weekMeta.topic}`, ru: `🏆 Финал недели: ${weekMeta.topic}` } }
        ],
        mistake_or_joke: weekMeta.is_safety ? null : "Хвилинку… а як це було? Ах так, згадала!"
    };
}

// Generate the global scenarios wrapper mapping dynamically based on state
const scenarios = new Proxy({}, {
    get: function(target, prop) {
        const idx = parseInt(prop);
        if (isNaN(idx) || idx < 1 || idx > 5) return null;
        
        const data = getLegacyLessonData(currentMonth, currentWeek);
        if (!data) return null;
        
        const trackData = (data.tracks && data.tracks[currentTrack]) ? data.tracks[currentTrack] : (data.tracks ? data.tracks.junior : { phrase: "Dobrý deň!", words: ["Dobrý", "deň!"] });
        const sc = data.scenarios ? data.scenarios[idx - 1] : null;
        if (!sc) return null;

        let scPhrase = sc.phrase || trackData.phrase;
        let scWords = sc.words || trackData.words;
        let scTip = sc.hint || data.hint;
        
        // Scenario-specific distinct phrase variations for Month 1 Week 1
        if (currentMonth === 1 && currentWeek === 1) {
            const m1w1Scenarios = [
                {
                    phrase: "Ahoj! Ako sa máš?",
                    words: ["Ahoj!", "Ako", "sa", "máš?"],
                    tip: { uk: "«Ahoj!» — це найпопулярніше словацьке привітання «Привіт!», а «Ako sa máš?» — «Як справи?»", ru: "«Ahoj!» — это самое популярное словацкое приветствие «Привет!», а «Ako sa máš?» — «Как дела?»" }
                },
                {
                    phrase: "Ďakujem, mám sa veľmi dobre!",
                    words: ["Ďakujem,", "mám", "sa", "veľmi", "dobre!"],
                    tip: { uk: "«Ďakujem» означає «дякую» — зверни увагу на м'який звук 'ď' у слові!", ru: "«Ďakujem» означает «спасибо» — обрати внимание на мягкий звук 'ď' в слове!" }
                },
                {
                    phrase: "Ahoj, ako sa voláš?",
                    words: ["Ahoj,", "ako", "sa", "voláš?"],
                    tip: { uk: "«Ako sa voláš?» — це дружнє запитання «Як тебе звати?»", ru: "«Ako sa voláš?» — это дружеский вопрос «Как тебя зовут?»" }
                },
                {
                    phrase: "Teší ma, ja som Oksana.",
                    words: ["Teší", "ma,", "ja", "som", "Oksana."],
                    tip: { uk: "«Teší ma» означає «Дуже приємно познайомитися»!", ru: "«Teší ma» означает «Очень приятно познакомиться»!" }
                },
                {
                    phrase: "Dovidenia, prajem pekný deň!",
                    words: ["Dovidenia,", "prajem", "pekný", "deň!"],
                    tip: { uk: "«Dovidenia» — ввічливе прощання «До побачення», а «pekný deň» — «гарного дня»!", ru: "«Dovidenia» — вежливое прощание «До свидания», а «pekný deň» — «хорошего дня»!" }
                }
            ];
            const override = m1w1Scenarios[idx - 1];
            if (override) {
                scPhrase = override.phrase;
                scWords = override.words;
                scTip = override.tip;
            }
        }

        return {
            title: { uk: sc.title.uk, ru: sc.title.ru },
            title_icon: sc.title_icon || idx,
            desc: {
                uk: `Завдання: ${sc.title.uk}. Вимовте: "${scPhrase}"`,
                ru: `Задание: ${sc.title.ru}. Произнесите: "${scPhrase}"`
            },
            phrase: scPhrase,
            words: scWords,
            tip: { uk: (scTip ? (scTip[currentLang] || scTip.uk) : ''), ru: (scTip ? (scTip.ru || scTip.uk) : '') },
            phoneticTip: {
                uk: `Будь уважним! Спробуй вимовити чіткіше словацькі звуки. Зверни увагу на '${scWords[0]}'`,
                ru: `Будь внимателен! Попробуй произнести четче словацкие звуки. Обрати внимание на '${scWords[0]}'`
            },
            audioCorrection: scWords[0].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"")
        };
    }
});

// Tutor configuration - only Oksana is active now
const avatarConfig = {
    human: {
        name: { uk: "Оксана (Oksana)", ru: "Оксана (Oksana)" },
        icon: "👩",
        greet: {
            uk: "Давай подивимось, у яких випадках застосовується це слово або вираз. Натисни на кольорові іконки!",
            ru: "Давай посмотрим, в каких случаях применяется это слово или выражение. Нажми на цветные иконки!"
        },
        greetSk: "Pozrime sa, kedy sa toto slovo alebo výraz používa. Klikni na farebné ikonky!"
    }
};

const translations = {
    uk: {
        select_scenario: "Обери життєвий сценарій:",
        nav_playground: "Ігровий простір",
        nav_parent_cabinet: "Батьківський кабінет",
        select_tutor: "Віковий трек:",
        ai_assistant_badge: "ІІ-Помічник",
        exercise_title: "Твоє завдання:",
        btn_listen_task: "Послухати",
        task_desc: "Повтори фразу",
        target_phrase: "Потрібно вимовити:",
        btn_repeat_phrase: "Повторити фразу",
        tip_title: "Підказка від Оксани:",
        tip_listen_label: "Слухати",
        tip_content_default: "«Dobrý deň» — це ввічливе привітання «Добрий день», а буква 'ň' у слові 'deň' вимовляється м'яко, як 'нь'!",
        press_mic: "Натисни мікрофон та говори словацькою",
        accuracy_label: "точність",
        feedback_success: "Чудова вимова!",
        feedback_subtext_success: "Ти правильно вимовив усі звуки. Рухаємося далі!",
        feedback_retry: "Майже вийшло!",
        feedback_subtext_retry: "Зверни увагу на виділені червоним слова і спробуй ще раз.",
        cabinet_welcome_title: "Кабінет безпечного контролю: Батьківський дашборд",
        cabinet_welcome_sub: "Тут ви можете бачити статистику прогресу навчання, досягнення дитини та налаштування конфиденційності GDPR.",
        stat_sessions: "Заняття за тиждень",
        stat_vocab_size: "Вивчено словацьких слів",
        stat_track: "Віковий трек",
        stat_safety_phrases: "Фраз безпеки засвоєно",
        stat_social_milestones: "Рівень адаптації",
        chart_title: "Динаміка занять по днях (хвилини)",
        milestones_title: "Практичні досягнення дитини",
        milestone_1_title: "Знакомство на дитячому майданчику",
        milestone_1_desc: "Дитина вміє представитися, запитати ім'я та запропонувати пограти.",
        milestone_2_title: "Похід у словацький магазин",
        milestone_2_desc: "Дитина може самостійно ввічливо попросити товар та запитати ціну.",
        milestone_3_title: "Безпечна відмова стороннім",
        milestone_3_desc: "Вміння твердо сказати \"Nie, ďakujem\" на пропозицію незнакомця.",
        milestone_4_title: "У словацькій школі / садочку",
        milestone_4_desc: "Розуміння базових команд вчителя, прохання про допомогу чи вихід.",
        milestone_5_title: "Поїздка у громадському транспорті",
        milestone_5_desc: "Спілкування з контролером, купівля та валідація квитка.",
        gdpr_title: "Центр конфиденційності GDPR-K",
        gdpr_sub: "Ми піклуємося про безпеку вашої дитини. Відповідно до регламентів ЄС, записи голосу не зберігаються на наших серверах.",
        btn_export_data: "Експортувати дані прогресу",
        btn_delete_profile: "Видалити профіль дитини",
        footer_legal_text: "Усі права захищені. Платформа відповідає нормам GDPR-K та EU AI Act по роботі з дітьми.",
        chart_days: ["Пн", "Вв", "Ср", "Чт", "Пт", "Сб", "Нд"],
        parent_gate_title: "Доступ лише для батьків",
        parent_gate_sub: "Будь ласка, введіть ваш батьківський ПІН-код.",
        parent_gate_error_msg: "Неправильний ПІН-код, спробуйте ще раз.",
        btn_confirm: "Підтвердити",
        pricing_title: "Тарифні плани",
        pricing_sub: "Оберіть відповідний пакет для повноцінного навчання дитини з ІІ-наставником.",
        plan_popular: "Популярний",
        plan_1_month: "1 місяць",
        plan_3_months: "3 місяці",
        plan_6_months: "6 місяців",
        plan_period_month: "/ міс",
        plan_3_total: "Всього: €24",
        plan_6_total: "Всього: €30",
        feature_1: "Річна програма (12 місяців)",
        feature_2: "Аналіз вимови (Speech API)",
        feature_3: "Родинам: планування та напоминалки",
        btn_choose_plan: "Обрати тариф",
        payment_modal_title: "Оплата банківською картою",
        payment_modal_sub: "Оплата за тарифом",
        card_holder_label: "Власник карти",
        card_number_label: "Номер карти",
        card_expiry_label: "Термін дії",
        payment_error_msg: "Помилка авторизації карти. Перевірте дані.",
        payment_success_title: "Оплата успішна!",
        payment_success_sub: "Дякуємо! Доступ до преміум функцій відкрито.",
        btn_pay: "Сплатити",
        btn_close: "Закрити",
        sub_active_title: "Ваша підписка активна!",
        footer_sponsor_text: "спонсор - Експертний блог по безпеці бізнесу в Європі",
        plan_free_badge: "Рекомендовано",
        plan_free_trial: "Пробний період",
        plan_free_duration: "/ 7 днів",
        plan_free_total: "Всього: €0 на 7 днів",
        btn_start_trial: "Спробувати безкоштовно",
        click_me: "Натисни тут",
        btn_confirm_lesson: "Підтвердити",
        stat_track_select_label: "Віковий трек дитини:",
        trial_active_title: "Ваш пробний період активний!",
        trial_success_msg: "Вітаємо! Ви успішно активували безкоштовний пробний доступ на 7 днів.",
        plan_premium: "Преміум (Оксана)",
        plan_premium_badge: "Преміум-ІІ",
        plan_premium_total: "Всього: €50 на місяць",
        feature_premium_1: "Спілкування з Оксаною в реальному часі",
        feature_premium_2: "Аналіз вимови через Azure Speech",
        feature_premium_3: "Індивідуальний розклад занять",
        premium_lock_title: "Потрібен Преміум-тариф",
        premium_lock_sub: "Для повноцінного доступу до вільного чату з Оксаною та ексклюзивних уроків безпеки потрібен тариф Преміум. Спробуйте безкоштовний тестовий період!",
        btn_upgrade_premium: "Перейти на Преміум (€50/міс)",
        btn_continue_standard: "Продовжити"
    },
    ru: {
        select_scenario: "Выбери жизненный сценарий:",
        nav_playground: "Игровое пространство",
        nav_parent_cabinet: "Родительский кабинет",
        select_tutor: "Возрастной трек:",
        ai_assistant_badge: "ИИ-Помощник",
        exercise_title: "Твое задание:",
        btn_listen_task: "Послушать",
        task_desc: "Повтори фразу",
        target_phrase: "Нужно произнести:",
        btn_repeat_phrase: "Повторить фразу",
        tip_title: "Подсказка от Оксаны:",
        tip_listen_label: "Слушать",
        tip_content_default: "«Dobrý deň» — это вежливое приветствие «Добрый день», а буква 'ň' в слове 'deň' произносится мягко, как 'нь'!",
        press_mic: "Нажми микрофон и говори по-словацки",
        accuracy_label: "точность",
        feedback_success: "Отличное произношение!",
        feedback_subtext_success: "Ты правильно произнес все звуки. Двигаемся дальше!",
        feedback_retry: "Почти получилось!",
        feedback_subtext_retry: "Обрати внимание на выделенные красным слова и попробуй еще раз.",
        cabinet_welcome_title: "Кабинет безопасного контроля: Родительский дашборд",
        cabinet_welcome_sub: "Здесь вы можете видеть статистику прогресса обучения, достижения ребенка и настройки конфиденциальности GDPR.",
        stat_sessions: "Занятия за неделю",
        stat_vocab_size: "Изучено словацких слов",
        stat_track: "Возрастной трек",
        stat_safety_phrases: "Фраз безопасности усвоено",
        stat_social_milestones: "Уровень адаптации",
        chart_title: "Динамика занятий по днях (минуты)",
        milestones_title: "Практические достижения ребенка",
        milestone_1_title: "Знакомство на детской площадке",
        milestone_1_desc: "Ребенок умеет представиться, спросить имя и предложить поиграть.",
        milestone_2_title: "Поход в словацкий магазин",
        milestone_2_desc: "Ребенок может самостоятельно вежливо попросить товар и спросить цену.",
        milestone_3_title: "Безопасный отказ посторонним",
        milestone_3_desc: "Умение твердо сказать \"Nie, ďakujem\" на предложение незнакомца.",
        milestone_4_title: "В словацкой школе / садике",
        milestone_4_desc: "Понимание базовых команд учителя, просьба о помощи или выходе.",
        milestone_5_title: "Поездка в общественном транспорте",
        milestone_5_desc: "Общение с контролером, покупка и валидация билета.",
        gdpr_title: "Центр конфиденциальности GDPR-K",
        gdpr_sub: "Мы заботимся о безопасности вашего ребенка. В соответствии с регламентом ЕС, записи голоса не сохраняются на наших серверах.",
        btn_export_data: "Экспортировать данные прогресса",
        btn_delete_profile: "Удалить профиль ребенка",
        footer_legal_text: "Все права защищены. Платформа соответствует нормам GDPR-K и EU AI Act по работе с детьми.",
        chart_days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],

        parent_gate_title: "Доступ только для родителей",
        parent_gate_sub: "Пожалуйста, введите ваш родительский ПИН-код.",
        parent_gate_error_msg: "Неверный ПИН-код, попробуйте еще раз.",
        btn_confirm: "Подтвердить",
        pricing_title: "Тарифные планы",
        pricing_sub: "Выберите подходящий пакет для полноценного обучения ребенка с ИИ-наставником.",
        plan_popular: "Популярный",
        plan_1_month: "1 месяц",
        plan_3_months: "3 месяца",
        plan_6_months: "6 месяцев",
        plan_period_month: "/ мес",
        plan_3_total: "Всего: €24",
        plan_6_total: "Всего: €30",
        feature_1: "Годовая программа (12 месяцев)",
        feature_2: "Анализ произношения (Speech API)",
        feature_3: "Семьям: планирование и напоминалки",
        btn_choose_plan: "Выбрать тариф",
        payment_modal_title: "Оплата банковской картой",
        payment_modal_sub: "Оплата по тарифу",
        card_holder_label: "Владелец карты",
        card_number_label: "Номер карты",
        card_expiry_label: "Срок действия",
        payment_error_msg: "Ошибка авторизации карты. Проверьте данные.",
        payment_success_title: "Оплата успешна!",
        payment_success_sub: "Спасибо! Доступ к премиум-функциям открыт.",
        btn_pay: "Оплатить",
        btn_close: "Закрыть",
        sub_active_title: "Ваша подписка активна!",
        footer_sponsor_text: "спонсор - Экспертный блог по безопасности бизнеса в Европе",
        plan_free_badge: "Рекомендовано",
        plan_free_trial: "Пробный период",
        plan_free_duration: "/ 7 дней",
        plan_free_total: "Всего: €0 на 7 дней",
        btn_start_trial: "Попробовать бесплатно",
        click_me: "Нажми тут",
        btn_confirm_lesson: "Подтвердить",
        stat_track_select_label: "Возрастной трек ребенка:",
        trial_active_title: "Ваш пробный период активен!",
        trial_success_msg: "Поздравляем! Вы успешно активировали бесплатный пробный доступ на 7 дней.",
        plan_premium: "Премиум (Оксана)",
        plan_premium_badge: "Премиум-ИИ",
        plan_premium_total: "Всего: €50 в месяц",
        feature_premium_1: "Общение с Оксаной в реальном времени",
        feature_premium_2: "Анализ произношения через Azure Speech",
        feature_premium_3: "Индивидуальное расписание занятий",
        premium_lock_title: "Требуется Премиум-тариф",
        premium_lock_sub: "Для полноценного доступа к свободному чату с Оксаной и эксклюзивным урокам безопасности требуется тариф Премиум. Попробуйте бесплатный тестовый период!",
        btn_upgrade_premium: "Перейти на Премиум (€50/мес)",
        btn_continue_standard: "Продолжить"
    }
};

// 3. Tab Navigation (Switch views)
function switchView(view) {
    if (view === 'playground') {
        document.getElementById('playground-view').classList.remove('hidden');
        document.getElementById('cabinet-view').classList.add('hidden');
        document.getElementById('btn-show-playground').classList.add('active');
        document.getElementById('btn-show-cabinet').classList.remove('active');
    } else {
        document.getElementById('playground-view').classList.add('hidden');
        document.getElementById('cabinet-view').classList.remove('hidden');
        document.getElementById('btn-show-playground').classList.remove('active');
        document.getElementById('btn-show-cabinet').classList.add('active');
        
        // Render or update parent chart
        initParentChart();
        // Load schedule UI in parent cabinet
        loadParentScheduleUI();
    }
}

// 4. Multi-language Switching
function switchLanguage(lang) {
    if (lang === 'ua') lang = 'uk';
    currentLang = lang;
    
    // Toggle active state on switcher buttons
    document.getElementById('lang-btn-ua').classList.toggle('active', lang === 'uk');
    document.getElementById('lang-btn-ru').classList.toggle('active', lang === 'ru');
    
    // Update elements with data-i18n attributes
    const elementsToTranslate = document.querySelectorAll('[data-i18n]');
    elementsToTranslate.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = translations[lang][key];
        if (translation) {
            // Check if it has child tags (like icons), update innerHTML accordingly
            if (element.querySelector('i')) {
                const iconHTML = element.querySelector('i').outerHTML;
                element.innerHTML = iconHTML + ' ' + translation;
            } else {
                element.innerHTML = translation;
            }
        }
    });

    // Update active character greetings in the chat history
    updateChatHistoryLanguage();

    // Re-draw chart with translated days labels if dashboard is visible
    if (progressChart) {
        progressChart.data.labels = translations[lang].chart_days;
        progressChart.update();
    }
}

// Helper to keep chat translated
function updateChatHistoryLanguage() {
    const chatContainer = document.getElementById('dialogue-chat');
    chatContainer.innerHTML = ''; // Clear chat
    
    // Add current character greeting
    const greetText = avatarConfig[currentCharacter].greet[currentLang];
    const greetSk = avatarConfig[currentCharacter].greetSk;
    const name = avatarConfig[currentCharacter].name[currentLang];
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble tutor-bubble';
    bubble.innerHTML = `
        <div class="bubble-meta">${name}</div>
        <div class="bubble-text">${greetSk} (${greetText})</div>
    `;
    chatContainer.appendChild(bubble);

    // Update the video subtitle overlay text
    document.getElementById('tutor-speech-text').innerHTML = greetSk;
}

// 4.5. Scenario & Milestone Operations
function selectScenario(num) {
    const isLocked = (num !== 1 && !completedScenarios.includes(num - 1));
    if (isLocked) {
        alert(currentLang === 'uk' ? 'Спочатку вимовте фразу з попереднього завдання в мікрофон!' : 'Сначала произнесите фразу из предыдущего задания в микрофон!');
        return;
    }

    currentScenario = num;
    attemptCount = 0;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`scenario-btn-${i}`);
        if (btn) btn.classList.toggle('active', i === num);
    }
    updateScenarioUI();
    startCurrentScenarioLesson();
}

function updateScenarioUI() {
    // Sync dropdown selectors with current state variables
    const trackSelect = document.getElementById('track-select');
    if (trackSelect) trackSelect.value = currentTrack;
    
    const monthSelect = document.getElementById('month-select');
    if (monthSelect) monthSelect.value = currentMonth.toString();
    
    const weekSelect = document.getElementById('week-select');
    if (weekSelect) weekSelect.value = currentWeek.toString();
    
    const lessonSelect = document.getElementById('lesson-select');
    if (lessonSelect) lessonSelect.value = currentLessonDay.toString();

    // NOTE: the rest of this function used to read from a legacy global
    // `scenarios` object shaped for the old (pre day-based) curriculum
    // format. Since curriculumCatalog now uses the day-based format for
    // every month, that legacy object no longer matches and reading it
    // threw an uncaught error on every single page load (it ran inside
    // DOMContentLoaded), which silently aborted all initialization code
    // after it — this was the root cause of the avatar/voice/unlock bugs
    // reported on 26.07.2026. The real, current rendering of task text,
    // hint text, phrase words, and scenario buttons is handled by
    // onCombinationChange() via buildDayLessonPayload(), so it's safe to
    // stop doing that work here.
    document.getElementById('speech-feedback-card').classList.add('hidden');
}

function updateScenarioButtonsContent() {
    // See note in updateScenarioUI() above — this legacy helper relied on
    // a data shape (data.scenarios[]) that no longer exists now that every
    // month uses the day-based curriculum format, and crashed on every
    // page load. Scenario button active-state is now handled by
    // onCombinationChange(); this function is kept as a safe no-op so any
    // remaining callers don't break.
    return;
}

function _legacyUnusedUpdateScenarioButtonsContent() {
    const data = getLegacyLessonData(currentMonth, currentWeek);
    if (!data) return;
    
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`scenario-btn-${i}`);
        if (!btn) continue;
        
        const sc = data.scenarios[i - 1];
        const isLocked = i !== 1 && !completedScenarios.includes(i - 1);
        const iconSymbol = sc && sc.title_icon ? sc.title_icon : i;

        if (isLocked) {
            btn.innerHTML = `<span class="scenario-icon">${iconSymbol}</span><i class="fa-solid fa-lock scenario-lock-badge"></i>`;
        } else {
            btn.innerHTML = `<span class="scenario-icon">${iconSymbol}</span>`;
        }

        btn.classList.toggle('disabled', isLocked);
        if (isLocked) {
            btn.title = currentLang === 'uk' ? 'Сценарій заблоковано. Пройди попередній!' : 'Сценарий заблокирован. Пройди предыдущий!';
        } else if (sc && sc.title) {
            btn.title = sc.title[currentLang];
        }
    }
}

function updateScenarioButtonsVisibility() {
    updateScenarioButtonsContent();
}

function getSafetyPhrasesMasteredCount() {
    let count = 0;
    for (let m = 1; m <= currentMonth; m++) {
        const maxW = (m === currentMonth) ? currentWeek : 4;
        for (let w = 1; w <= maxW; w++) {
            const weekData = getLegacyLessonData(m, w);
            if (weekData && weekData.is_safety) {
                if (m < currentMonth || w < currentWeek || (m === currentMonth && w === currentWeek && completedScenarios.includes(5))) {
                    count++;
                }
            }
        }
    }
    return count;
}

function unlockMilestone(num) {
    if (!completedScenarios.includes(num)) {
        completedScenarios.push(num);
        saveCompletedScenarios();
    }

    // Set scenario_1_4_completed flag if 1, 2, 3, 4 are completed
    const sc1_4_completed = [1, 2, 3, 4].every(x => completedScenarios.includes(x));
    localStorage.setItem('slovahoj_kids_scenario_1_4_completed', sc1_4_completed ? 'true' : 'false');

    syncMilestonesUI();

    // If all 5 scenarios of the current lesson are now done, the lesson is fully complete
    const allFiveDone = [1, 2, 3, 4, 5].every(x => completedScenarios.includes(x));
    if (allFiveDone && lessonModeActive) {
        onLessonFullyComplete();
    }
}

function onLessonFullyComplete() {
    // Unlock the dropdowns & Confirm button again so the next lesson can be picked
    // without needing to reload the whole page. The screen stays on the completed
    // lesson's content until "Підтвердити" is pressed again for the new selection.
    dropdownsUnlockedForNextLesson = true;
    if (typeof updateDropdownLockState === 'function') {
        updateDropdownLockState();
    }

    const isLastDayOfWeek = currentLessonDay === 3;

    // Play a celebratory avatar reaction — reaction_achievement.mp4 for
    // finishing a day, or reaction_goodbye.mp4 (a warmer "see you soon"
    // moment) for finishing an entire week's 3 days. Both clips already
    // have Oksana's real recorded voice, so no synthetic TTS is needed
    // unless the video itself fails to load.
    const reactionState = isLastDayOfWeek ? 'farewell' : 'achievement';
    const videoPlayedPromise = updateAvatarState(reactionState);
    if (videoPlayedPromise && typeof videoPlayedPromise.then === 'function') {
        videoPlayedPromise.then(played => {
            if (!played) {
                speakSlovak(isLastDayOfWeek ? 'Dovidenia! Teším sa na budúce!' : 'Fantastické! Gratulujem!');
            }
        });
    }

    const msg = isLastDayOfWeek
        ? (currentLang === 'uk'
            ? '🌟 Ти добре навчався і пройшов увесь цей тиждень! Побачимось на наступному тижні — Оксана вже чекає!'
            : '🌟 Ты хорошо занимался и прошёл всю эту неделю! Увидимся на следующей неделе — Оксана уже ждёт!')
        : (currentLang === 'uk'
            ? '🎉 Ти пройшов усі 5 пригод цього уроку! Чудова робота! Тепер можеш перейти до наступного уроку — обери його вгорі та натисни «Підтвердити».'
            : '🎉 Ты прошёл все 5 приключений этого урока! Отличная работа! Теперь можешь перейти к следующему уроку — выбери его вверху и нажми «Подтвердить».');
    appendChatBubble('tutor', msg);
}

// Counts real, unique Slovak words/phrases from every FULLY completed
// lesson-day (all 5 scenario icons done), across the whole course so far —
// replaces an old placeholder formula (completedCount * 12 + 6) that had
// no connection to actual content and inflated wildly after a few lessons.
function calculateTotalWordsLearned() {
    const wordsSet = new Set();
    for (const key in scenarioProgressMap) {
        const doneList = scenarioProgressMap[key] || [];
        if (doneList.length < 5) continue; // only count fully finished days
        const parts = key.split('-');
        if (parts.length < 4) continue;
        const track = parts[0];
        const month = parseInt(parts[1]);
        const week = parseInt(parts[2]);
        const day = parseInt(parts[3]);
        try {
            const dData = curriculumCatalog[month] && curriculumCatalog[month].weeks[week] && curriculumCatalog[month].weeks[week].days[day];
            const trackData = dData && dData.tracks && dData.tracks[track];
            if (trackData && Array.isArray(trackData.words)) {
                trackData.words.forEach(w => wordsSet.add(String(w).toLowerCase()));
            }
        } catch (e) { /* ignore malformed keys */ }
    }
    return wordsSet.size;
}

function syncMilestonesUI() {
    const completedCount = completedScenarios.length;
    
    // Update Sessions Card
    const sessionsVal = document.getElementById('stat-sessions-val');
    if (sessionsVal) {
        sessionsVal.innerHTML = `${currentLessonDay} / 3`;
    }
    
    // Update Vocabulary Card
    const vocabVal = document.getElementById('stat-vocab-val');
    if (vocabVal) {
        const vocabCount = calculateTotalWordsLearned();
        const vocabSuffix = currentLang === 'uk' ? 'слів' : 'слов';
        vocabVal.innerHTML = `${vocabCount} ${vocabSuffix}`;
    }
    
    // Update Track Level Card
    const trackVal = document.getElementById('stat-track-val');
    if (trackVal) {
        let trackStr = '';
        if (currentTrack === 'junior') {
            trackStr = currentLang === 'uk' ? 'Молодший (6-8 років)' : 'Младший (6-8 лет)';
        } else if (currentTrack === 'middle') {
            trackStr = currentLang === 'uk' ? 'Середній (9-11 років)' : 'Средний (9-11 лет)';
        } else {
            trackStr = currentLang === 'uk' ? 'Старший (12-14 років)' : 'Старший (12-14 лет)';
        }
        trackVal.innerHTML = trackStr;
    }
    
    // Update Safety Phrases Card
    const safetyVal = document.getElementById('stat-safety-val');
    if (safetyVal) {
        safetyVal.innerHTML = `${getSafetyPhrasesMasteredCount()}`;
    }
    

    for (let i = 1; i <= 5; i++) {
        const item = document.getElementById(`milestone-${i}`);
        const check = document.getElementById(`milestone-check-${i}`);
        if (!item || !check) continue;
        if (completedScenarios.includes(i)) {
            item.className = 'milestone-item completed';
            check.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        } else {
            item.className = 'milestone-item locked';
            check.innerHTML = '<i class="fa-solid fa-lock"></i>';
        }
    }
    
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`scenario-btn-${i}`);
        if (!btn) continue;
        const isAccessible = (i === 1 || completedScenarios.includes(i - 1));
        btn.disabled = !isAccessible;
        btn.classList.toggle('disabled', !isAccessible);
    }
}

function updateCharacterLevelImage() {
    const avatarImg = document.getElementById('char-avatar-img');
    if (!avatarImg) return;
    
    // Map currentLevel (1-5) to animal evolution Version (1-3)
    let version = 1;
    if (currentLevel >= 5) version = 3;
    else if (currentLevel >= 3) version = 2;

    let src = `${currentCharacter}_level_${version}.png`;
    
    avatarImg.onerror = function() {
        const isAnimal = ['wolf', 'fox', 'raccoon', 'cat'].includes(currentCharacter);
        avatarImg.src = isAnimal ? `${currentCharacter}_level_1.png` : 'tutor_girl.jpg';
        avatarImg.onerror = null;
    };
    avatarImg.src = src;
}

function checkLevelProgress() {
    const completedCount = completedScenarios.length;
    let targetLevel = 1;
    if (completedCount >= 5) targetLevel = 5;
    else if (completedCount >= 4) targetLevel = 4;
    else if (completedCount >= 3) targetLevel = 3;
    else if (completedCount >= 2) targetLevel = 2;

    if (targetLevel !== currentLevel) {
        currentLevel = targetLevel;
        updateCharacterLevelImage();
        
        const msg = currentLang === 'uk' 
            ? `🎉 Вітаємо! Твій наставник виріс до рівня ${currentLevel}!` 
            : `🎉 Поздравляем! Твой наставник вырос до уровня ${currentLevel}!`;
        appendChatBubble('tutor', msg);
    }
}

// 4.6. Chat Operations
function appendChatBubble(sender, text) {
    const chatContainer = document.getElementById('dialogue-chat');
    if (!chatContainer) return;
    
    const bubble = document.createElement('div');
    bubble.className = `bubble ${sender}-bubble`;
    
    const name = sender === 'user' 
        ? (currentLang === 'uk' ? 'Ти' : 'Ты') 
        : avatarConfig[currentCharacter].name[currentLang];
        
    bubble.innerHTML = `
        <div class="bubble-meta">${name}</div>
        <div class="bubble-text">${text}</div>
    `;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTypingIndicator() {
    const chatContainer = document.getElementById('dialogue-chat');
    const bubble = document.createElement('div');
    bubble.className = 'bubble tutor-bubble typing-indicator-bubble';
    bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return bubble;
}

function removeTypingIndicator(element) {
    if (element && element.parentNode) {
        element.parentNode.removeChild(element);
    }
}



// 6. Voice Recording & Pronunciation Evaluation
let recognizer = null;
let activeBrowserRecognition = null;
let currentSpeechSessionId = 0;

function calculateLevenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function evaluateSpokenPhrase(spokenText, targetPhrase) {
    if (!spokenText || typeof spokenText !== 'string' || !spokenText.trim()) {
        return { success: false, error: "No speech heard" };
    }
    
    const cleanSpokenWords = spokenText.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?¡¿"']/g, "")
        .split(/\s+/)
        .filter(Boolean);
        
    const originalTargetWords = targetPhrase.split(/\s+/).filter(Boolean);
    const cleanTargetWords = originalTargetWords.map(w => 
        w.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?¡¿"']/g, "")
    );

    if (cleanSpokenWords.length === 0 || cleanTargetWords.length === 0) {
        return { success: false, error: "No valid words" };
    }

    let matchedPoints = 0;
    const usedSpokenIndices = new Set();

    const wordResults = originalTargetWords.map((origWord, idx) => {
        const cleanTargetWord = cleanTargetWords[idx];

        // 1. Exact Match
        let matchIdx = cleanSpokenWords.findIndex((spk, sIdx) => 
            !usedSpokenIndices.has(sIdx) && spk === cleanTargetWord
        );
        if (matchIdx !== -1) {
            usedSpokenIndices.add(matchIdx);
            matchedPoints += 1.0;
            return {
                word: origWord,
                accuracyScore: 95,
                errorType: "None"
            };
        }

        // 2. Strict Levenshtein Match ONLY for target words with length >= 4
        // (Short words require EXACT match to prevent false positives)
        if (cleanTargetWord.length >= 4) {
            matchIdx = cleanSpokenWords.findIndex((spk, sIdx) => {
                if (usedSpokenIndices.has(sIdx)) return false;
                if (Math.abs(spk.length - cleanTargetWord.length) > 1) return false;
                const maxDist = cleanTargetWord.length <= 5 ? 1 : 2;
                return calculateLevenshtein(spk, cleanTargetWord) <= maxDist;
            });

            if (matchIdx !== -1) {
                usedSpokenIndices.add(matchIdx);
                matchedPoints += 0.7; // Fuzzy match scores 70%
                return {
                    word: origWord,
                    accuracyScore: 70,
                    errorType: "Mispronunciation"
                };
            }
        }

        // Unmatched / Incorrect word
        return {
            word: origWord,
            accuracyScore: 30,
            errorType: "Mispronunciation"
        };
    });

    let overallScore = Math.round((matchedPoints / originalTargetWords.length) * 100);
    
    // Penalize if spoken phrase has far fewer or far more words than target phrase
    const wordCountRatio = cleanSpokenWords.length / cleanTargetWords.length;
    if (wordCountRatio < 0.5 || wordCountRatio > 2.0) {
        overallScore = Math.round(overallScore * 0.7);
    }
    
    overallScore = Math.max(0, Math.min(100, overallScore));

    console.log(`Evaluated speech: "${spokenText}" against target: "${targetPhrase}" -> Score: ${overallScore}%`);

    return {
        success: true,
        accuracyScore: overallScore,
        pronunciationScore: overallScore,
        spokenText: spokenText,
        words: wordResults
    };
}

function startBrowserSpeechRecognition(targetPhrase, sessionId, callback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return false;
    }

    try {
        if (activeBrowserRecognition) {
            try {
                activeBrowserRecognition.onresult = null;
                activeBrowserRecognition.onerror = null;
                activeBrowserRecognition.onend = null;
                activeBrowserRecognition.abort();
            } catch(e){}
            activeBrowserRecognition = null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'sk-SK';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            if (sessionId !== currentSpeechSessionId) {
                console.warn(`[Session ${sessionId}] Ignored stale speech result (active session is ${currentSpeechSessionId})`);
                return;
            }
            const transcript = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript.trim() : '';
            console.log(`[Session ${sessionId}] Web Speech Recognition Result: "${transcript}"`);
            const evalResult = evaluateSpokenPhrase(transcript, targetPhrase);
            callback(evalResult);
        };

        recognition.onerror = (event) => {
            if (sessionId !== currentSpeechSessionId) return;
            console.warn(`[Session ${sessionId}] Web Speech Recognition Error:`, event.error);
            callback({ success: false, error: event.error });
        };

        recognition.onend = () => {
            if (activeBrowserRecognition === recognition) {
                activeBrowserRecognition = null;
            }
        };

        activeBrowserRecognition = recognition;
        recognition.start();
        return true;
    } catch (e) {
        console.error("Failed to initialize Web Speech Recognition:", e);
        return false;
    }
}

async function runAzurePronunciationAssessment(targetPhrase, sessionId, callback) {
    const azureAuth = await getAzureSpeechToken();
    if (!azureAuth) {
        console.warn("Azure Speech token unavailable. Falling back to Browser WebSpeech.");
        return false;
    }

    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(azureAuth.token, azureAuth.region);
        speechConfig.speechRecognitionLanguage = "sk-SK";

        const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

        const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
            targetPhrase,
            SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
            SpeechSDK.PronunciationAssessmentGranularity.Word,
            true
        );

        recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
        pronConfig.applyTo(recognizer);

        recognizer.recognizeOnceAsync(
            result => {
                if (sessionId !== currentSpeechSessionId) {
                    console.warn(`[Session ${sessionId}] Ignored stale Azure result (active session is ${currentSpeechSessionId})`);
                    if (recognizer) {
                        try { recognizer.close(); } catch(e){}
                        recognizer = null;
                    }
                    return;
                }
                if (recognizer) {
                    recognizer.close();
                    recognizer = null;
                }
                
                if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                    const assessmentResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
                    if (assessmentResult) {
                        callback({
                            success: true,
                            accuracyScore: assessmentResult.accuracyScore,
                            pronunciationScore: assessmentResult.pronunciationScore,
                            words: assessmentResult.detailResult.Words.map(w => ({
                                word: w.Word,
                                accuracyScore: w.PronunciationAssessment.AccuracyScore,
                                errorType: w.PronunciationAssessment.ErrorType
                            }))
                        });
                    } else {
                        callback({ success: false, error: "Failed to parse assessment result" });
                    }
                } else {
                    callback({ success: false, error: "Speech not recognized. Reason: " + result.reason });
                }
            },
            err => {
                if (sessionId !== currentSpeechSessionId) return;
                if (recognizer) {
                    try { recognizer.close(); } catch(e){}
                    recognizer = null;
                }
                console.error("Azure Speech Recognition Error:", err);
                callback({ success: false, error: err });
            }
        );
        return true;
    } catch (e) {
        console.error("Azure Speech initialization failed:", e);
        return false;
    }
}

async function toggleSpeechRecording() {
    const recordBtn = document.getElementById('btn-record-speech');
    const recordIcon = document.getElementById('record-icon');
    const statusText = document.getElementById('record-status-text');
    const wave = document.getElementById('recording-wave');

    if (!isRecording) {
        // Increment session ID to cancel any pending previous recognition callbacks
        currentSpeechSessionId++;
        const sessionId = currentSpeechSessionId;

        // Hide previous feedback card
        document.getElementById('speech-feedback-card').classList.add('hidden');

        // Start Recording State
        isRecording = true;
        recordBtn.classList.add('recording');
        recordIcon.className = 'fa-solid fa-square';
        statusText.innerHTML = currentLang === 'uk' ? 'Слухаю тебе... говори!' : 'Слушаю тебя... говори!';
        wave.classList.remove('hidden');
        
        const targetPhrase = lessonModeActive
            ? (getLessonData(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario).pronunciationText)
            : DEMO_PHRASE_DATA.text;

        // 10-second Speech API timeout fallback (prevents frozen screen)
        if (speechTimeoutTimer) clearTimeout(speechTimeoutTimer);
        speechTimeoutTimer = setTimeout(() => {
            if (isRecording) {
                stopSpeechRecording();
                handleSpeechResult({
                    success: false,
                    error: "Timeout: Speech API did not return response within 10 seconds."
                });
                transitionAvatarStateTo(AvatarState.IDLE);
                appendChatBubble('tutor', currentLang === 'uk'
                    ? 'Не вдалося розпізнати вимову вчасно. Натисни мікрофон і спробуй ще раз!'
                    : 'Не удалось распознать речь вовремя. Нажми микрофон и попробуй еще раз!');
            }
        }, 10000);
        
        // 1. Attempt real Azure speech assessment
        const startedAzure = await runAzurePronunciationAssessment(targetPhrase, sessionId, (result) => {
            if (sessionId === currentSpeechSessionId) {
                isSimulatedSpeech = false;
                handleSpeechResult(result);
            }
        });

        // 2. Fallback to Browser Web Speech API (real microphone voice evaluation)
        if (!startedAzure) {
            const startedWebSpeech = startBrowserSpeechRecognition(targetPhrase, sessionId, (result) => {
                if (sessionId === currentSpeechSessionId) {
                    isSimulatedSpeech = false;
                    handleSpeechResult(result);
                }
            });

            if (!startedWebSpeech) {
                isSimulatedSpeech = true;
                recordTimer = setTimeout(() => {
                    if (sessionId === currentSpeechSessionId) {
                        stopSpeechRecording();
                    }
                }, 3000);
            } else {
                isSimulatedSpeech = false;
            }
        } else {
            isSimulatedSpeech = false;
        }
    } else {
        // Force Stop current recording
        if (recognizer) {
            try { recognizer.close(); } catch (e) {}
            recognizer = null;
        }
        if (activeBrowserRecognition) {
            try {
                activeBrowserRecognition.onresult = null;
                activeBrowserRecognition.onerror = null;
                activeBrowserRecognition.onend = null;
                activeBrowserRecognition.abort();
            } catch (e) {}
            activeBrowserRecognition = null;
        }
        if (recordTimer) {
            clearTimeout(recordTimer);
            recordTimer = null;
        }
        if (speechTimeoutTimer) {
            clearTimeout(speechTimeoutTimer);
            speechTimeoutTimer = null;
        }
        stopSpeechRecording();
    }
}

function stopSpeechRecording() {
    const recordBtn = document.getElementById('btn-record-speech');
    const recordIcon = document.getElementById('record-icon');
    const statusText = document.getElementById('record-status-text');
    const wave = document.getElementById('recording-wave');

    isRecording = false;
    recordBtn.classList.remove('recording');
    recordIcon.className = 'fa-solid fa-microphone';
    statusText.innerHTML = currentLang === 'uk' ? 'Аналізую твою вимову...' : 'Анализирую твое произношение...';
    wave.classList.add('hidden');

    if (isSimulatedSpeech) {
        setTimeout(() => {
            handleSpeechResult({
                success: false,
                error: "Speech not recognized. Please try again."
            });
        }, 1000);
    }
}

function handleSpeechResult(result) {
    if (speechTimeoutTimer) {
        clearTimeout(speechTimeoutTimer);
        speechTimeoutTimer = null;
    }
    const feedbackCard = document.getElementById('speech-feedback-card');
    const scoreVal = document.getElementById('pronunciation-score-val');
    const headline = document.getElementById('feedback-headline');
    const subtext = document.getElementById('feedback-subtext');
    const phonemeContainer = document.getElementById('phrase-phoneme-container');
    const statusText = document.getElementById('record-status-text');

    // Reset recording UI state
    isRecording = false;
    document.getElementById('btn-record-speech').classList.remove('recording');
    document.getElementById('record-icon').className = 'fa-solid fa-microphone';
    document.getElementById('recording-wave').classList.add('hidden');

    feedbackCard.classList.remove('hidden');
    statusText.innerHTML = currentLang === 'uk' ? 'Натисни мікрофон та говори словацькою' : 'Нажми микрофон и говори по-словацки';

    if (!result || !result.success) {
        scoreVal.innerHTML = '0%';
        headline.innerHTML = currentLang === 'uk' ? 'Спробуй ще раз' : 'Попробуй еще раз';
        headline.className = 'retry-text';
        subtext.innerHTML = currentLang === 'uk' ? 'Не вдалося розпізнати мову. Перевір мікрофон.' : 'Не удалось распознать речь. Проверь микрофон.';
        updateAvatarState('retry');
        return;
    }

    phonemeContainer.innerHTML = '';
    result.words.forEach(w => {
        const span = document.createElement('span');
        span.className = 'phoneme-word';
        if (w.accuracyScore >= 85) {
            span.classList.add('correct');
        } else if (w.accuracyScore >= 60) {
            span.classList.add('warning');
        } else {
            span.classList.add('incorrect');
        }
        span.innerText = w.word + ' ';
        phonemeContainer.appendChild(span);
    });

    const score = Math.round(result.pronunciationScore || result.accuracyScore || 0);
    scoreVal.innerHTML = `${score}%`;

    // 3 Tiers according to Developer Technical Specification Section 5:
    if (score >= 85) {
        // TIER 1: Score >= 85 (High quality -> reaction_praise.mp4)
        headline.innerHTML = currentLang === 'uk' ? 'Чудово! Відмінна вимова!' : 'Отлично! Прекрасное произношение!';
        headline.className = 'success-text';
        subtext.innerHTML = translations[currentLang].feedback_subtext_success;

        const activeTip = lessonModeActive
            ? getLessonData(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario).hintText
            : DEMO_PHRASE_DATA.hintText;
        const tipEl = document.getElementById('pronunciation-tip-text');
        if (tipEl) tipEl.innerText = activeTip;

        unlockMilestone(currentScenario);
        advanceLessonProgress();
        updateScenarioButtonProgress();

        // Play Avatar video reaction (reaction_praise.mp4 contains Oksana's voice, NO synthetic TTS!)
        const videoPlayedPromise = updateAvatarState('success');
        if (videoPlayedPromise && typeof videoPlayedPromise.then === 'function') {
            videoPlayedPromise.then(played => {
                if (!played) {
                    // Fallback to TTS only if video failed to play
                    speakSlovak("Výborne! Veľmi dobre.");
                }
            });
        }

        const remainingCount = [1, 2, 3, 4, 5].filter(x => !completedScenarios.includes(x)).length;
        const nextIconHint = remainingCount > 0
            ? (currentLang === 'uk'
                ? ` 👉 Тепер натисни на іконку, що світиться, — там наступне завдання!`
                : ` 👉 Теперь нажми на иконку, которая светится, — там следующее задание!`)
            : (currentLang === 'uk'
                ? ` 🎉 Це була остання іконка! Тепер обери наступний день і натисни «Підтвердити».`
                : ` 🎉 Это была последняя иконка! Теперь выбери следующий день и нажми «Подтвердить».`);
        appendChatBubble('tutor', `Výborne! Veľmi dobre. (${currentLang === 'uk' ? 'Чудово! Дуже добре.' : 'Отлично! Очень хорошо.'})${nextIconHint}`);

        checkLevelProgress();

        if (currentScenario === 1) {
            startDropdownSequence();
        }

        if (!isSubscriptionActive() && !childAuthenticated && currentScenario === 1) {
            tutorTrialPassed[currentCharacter] = true;
            // Clean lock screens
            document.getElementById('sub-expired-lock-modal').classList.add('hidden');
            document.getElementById('parent-expiry-modal').classList.add('hidden');
 
            // Update UI & unlock controls
            updateAuthHeaderUI();
            updateDropdownLockState();
            updateScenarioButtonsVisibility();
            updateScenarioUI();

            // Activate subscription banner
            const banner = document.getElementById('subscription-status-banner');
            if (banner) {
                const titleEl = banner.querySelector('.sub-title');
                if (titleEl) {
                    titleEl.setAttribute('data-i18n', 'sub_active_title');
                    titleEl.innerText = currentLang === 'uk' ? 'Ваша підписка активна!' : 'Ваша подписка активна!';
                }
                const expDate = new Date(subscriptionEnd);
                const expString = `${expDate.getDate()}.${expDate.getMonth()+1}.${expDate.getFullYear()}`;
                const detailsEl = banner.querySelector('.sub-details');
                if (detailsEl) {
                    detailsEl.innerText = currentLang === 'uk'
                        ? `Тарифний план: ${currentPaymentPlanName}. Дійсний до ${expString}.`
                        : `Тарифный план: ${currentPaymentPlanName}. Действителен до ${expString}.`;
                }
                banner.classList.remove('hidden');
            }
        } else {
            // Error
            document.getElementById('payment-error').classList.add('hidden');
        }
    } else if (score >= 60) {
        // TIER 2: Score 60-84 (Medium quality -> reaction_soft_correction.mp4)
        headline.innerHTML = currentLang === 'uk' ? 'Майже вийшло!' : 'Почти получилось!';
        headline.className = 'warning-text';
        subtext.innerHTML = currentLang === 'uk' 
            ? 'Майже, спробуй ще раз! Зверни увагу на виділені помаранчевим слова.' 
            : 'Почти получилось, попробуй еще раз! Обрати внимание на выделенные оранжевым слова.';

        const activeTip2 = lessonModeActive
            ? getLessonData(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario).hintText
            : DEMO_PHRASE_DATA.hintText;
        const tipEl2 = document.getElementById('pronunciation-tip-text');
        if (tipEl2) tipEl2.innerText = activeTip2;

        // Play Avatar video reaction (reaction_soft_correction.mp4 contains Oksana's voice, NO synthetic TTS!)
        const videoPlayedPromise = updateAvatarState('retry');
        if (videoPlayedPromise && typeof videoPlayedPromise.then === 'function') {
            videoPlayedPromise.then(played => {
                if (!played) {
                    speakSlovak("Skús to ešte raz.");
                }
            });
        }

        appendChatBubble('tutor', `Skús to ešte raz. (${currentLang === 'uk' ? 'Майже, спробуй ще раз.' : 'Почти, попробуй еще раз.'})`);
    } else {
        // TIER 3: Score < 60 (Low quality -> reaction_soft_correction.mp4)
        headline.innerHTML = currentLang === 'uk' ? 'Спробуй ще раз!' : 'Попробуй еще раз!';
        headline.className = 'retry-text';
        subtext.innerHTML = currentLang === 'uk'
            ? 'Послухай, як вимовляє Оксана, та повтори повільніше.'
            : 'Послушай, как произносит Оксана, и повтори медленнее.';

        const activeTip3 = lessonModeActive
            ? getLessonData(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario).hintText
            : DEMO_PHRASE_DATA.hintText;
        const tipEl3 = document.getElementById('pronunciation-tip-text');
        if (tipEl3) tipEl3.innerText = activeTip3;

        // Play Avatar video reaction (reaction_soft_correction.mp4 contains Oksana's voice, NO synthetic TTS!)
        const videoPlayedPromise = updateAvatarState('retry');
        if (videoPlayedPromise && typeof videoPlayedPromise.then === 'function') {
            videoPlayedPromise.then(played => {
                if (!played) {
                    speakSlovak("Skús to ešte raz.");
                }
            });
        }

        appendChatBubble('tutor', `Skús to ešte raz. (${currentLang === 'uk' ? 'Послухай та повтори ще раз.' : 'Послушай и повтори еще раз.'})`);
    }
}

function startFreeTrial() {
    trackEvent('start_free_trial');
    // Set 7-day trial state
    subscriptionStart = Date.now();
    subscriptionEnd = subscriptionStart + (7 * 24 * 60 * 60 * 1000);
    subscriptionType = 'trial';
    saveSubState();
    
    // Clean any open lock screens
    const lockModal = document.getElementById('sub-expired-lock-modal');
    if (lockModal) lockModal.classList.add('hidden');
    const parentExpModal = document.getElementById('parent-expiry-modal');
    if (parentExpModal) parentExpModal.classList.add('hidden');

    // Update UI components & unlock controls
    updateAuthHeaderUI();
    updateDropdownLockState();
    updateScenarioButtonsContent();
    updateScenarioUI();
 
    // Activate subscription status banner in Parent Cabinet
    const banner = document.getElementById('subscription-status-banner');
    if (banner) {
        banner.classList.remove('hidden');
        const titleEl = banner.querySelector('.sub-title');
        if (titleEl) {
            titleEl.setAttribute('data-i18n', 'trial_active_title');
            titleEl.innerText = currentLang === 'uk' ? 'Ваш пробний 7-денний період активний! 🎁' : 'Ваш пробный 7-дневный период активен! 🎁';
        }
        
        const detailsEl = banner.querySelector('.sub-details');
        if (detailsEl) {
            const expDate = new Date(subscriptionEnd);
            const expString = `${expDate.getDate()}.${expDate.getMonth()+1}.${expDate.getFullYear()}`;
            detailsEl.innerText = currentLang === 'uk'
                ? `Пробний доступ активовано. Дійсний до ${expString}. Усі уроки словацької мови відкрито!`
                : `Пробный доступ активирован. Действителен до ${expString}. Все уроки словацкого языка открыты!`;
        }
    }
    
    alert(currentLang === 'uk' ? 'Вітаємо! Ваш 7-денний безкоштовний період успішно активовано!' : 'Поздравляем! Ваш 7-дневный бесплатный период успешно активирован!');
    switchView('playground');
}

function resetFeedback() {
    attemptCount = 0;
    document.getElementById('speech-feedback-card').classList.add('hidden');
    const sc = scenarios[currentScenario];
    const phraseContainer = document.getElementById('phrase-phoneme-container');
    phraseContainer.innerHTML = '';
    sc.words.forEach(w => {
        const span = document.createElement('span');
        span.className = 'phoneme-word';
        span.innerText = w + ' ';
        phraseContainer.appendChild(span);
    });
    document.getElementById('pronunciation-tip-text').innerHTML = sc.tip[currentLang];
}

const VIDEO_BASE_URL = './videos/';

function safePlayVideo(video, isIdle) {
    if (!video) return Promise.resolve(false);
    video.classList.remove('hidden');
    const fallback = document.getElementById('avatar-fallback');
    if (fallback) fallback.classList.add('hidden');

    try {
        video.currentTime = 0;
    } catch(e) {}

    // Idle is just a silent ambient loop — play it muted straight away so it
    // never triggers the browser's autoplay-with-sound block (and never
    // shows the "no sound" badge, which is only meaningful for real speech).
    if (isIdle) {
        video.muted = true;
        const idlePlay = video.play();
        if (idlePlay !== undefined && typeof idlePlay.then === 'function') {
            return idlePlay.then(() => true).catch(() => false);
        }
        return Promise.resolve(true);
    }

    // Same shared lock as speakBilingualText — don't start a speaking video
    // on top of an ElevenLabs hint that's still playing (or vice versa).
    if (isVoicePlaying) return Promise.resolve(false);

    // Reset video.muted to false so real recorded voice audio plays loud and clear
    video.muted = false;
    isVoicePlaying = true;
    // Safety net: if 'ended'/'error' never fire for some reason, don't leave
    // every voice button permanently blocked — no real phrase clip runs
    // anywhere near this long.
    setTimeout(() => { isVoicePlaying = false; }, 20000);
    const unmuteBadge = document.getElementById('unmute-badge');
    if (unmuteBadge) unmuteBadge.classList.add('hidden');

    const playPromise = video.play();
    if (playPromise !== undefined && typeof playPromise.then === 'function') {
        return playPromise.then(() => true).catch(err => {
            console.warn("Unmuted video play failed/blocked, retrying muted:", err);
            video.muted = true;
            // The browser silently blocked audio-with-autoplay (this happens when
            // playback is triggered from an async callback — e.g. after Azure
            // speech recognition returns — rather than directly inside a click
            // handler). Show a button so a tap can re-enable sound; a direct
            // click always satisfies the browser's autoplay-with-sound policy.
            if (unmuteBadge) unmuteBadge.classList.remove('hidden');
            return video.play().then(() => true).catch(e2 => {
                console.warn("Muted video play also failed:", e2);
                isVoicePlaying = false;
                if (!isIdle) {
                    const fallbackUrl = new URL(VIDEO_BASE_URL + 'reaction_listening.mp4', window.location.href).href;
                    if (video.src !== fallbackUrl) {
                        video.src = fallbackUrl;
                        video.play().catch(() => {});
                    }
                }
                return false;
            });
        });
    }
    return Promise.resolve(true);
}

// Called by tapping the "Немає звуку" badge — a direct click always satisfies
// the browser's autoplay-with-sound requirement, so this reliably restores
// audio for the rest of the session.
function unmuteAvatarVideo() {
    const video = document.getElementById('heygen-video');
    const unmuteBadge = document.getElementById('unmute-badge');
    if (!video) return;
    video.muted = false;
    video.play().catch(() => {});
    if (unmuteBadge) unmuteBadge.classList.add('hidden');
}
window.unmuteAvatarVideo = unmuteAvatarVideo;

function bindVideoStateHandlers() {
    const video = document.getElementById('heygen-video');
    if (!video) return;

    const handleClipEnd = () => {
        isVoicePlaying = false;
        const currentState = video.getAttribute('data-state');
        console.log("Video clip finished playing. Current state:", currentState);
        if (currentState === 'greeting' || currentState === 'greet') {
            // After Oksana's greeting video finishes, seamlessly transition to active lesson UI & video
            applyLessonBinding();
        } else if (currentState !== 'idle') {
            updateAvatarState('idle');
        }
    };

    video.onended = handleClipEnd;
    video.onerror = () => {
        isVoicePlaying = false;
        console.warn("Video clip playback error (missing file), switching to reaction_listening animation");
        const currentState = video.getAttribute('data-state');
        if (currentState !== 'idle') {
            const fallbackUrl = new URL(VIDEO_BASE_URL + 'reaction_listening.mp4', window.location.href).href;
            if (video.src !== fallbackUrl) {
                video.src = fallbackUrl;
                video.play().catch(() => {});
            }
        }
    };

    if (!video.dataset.eventsBound) {
        video.dataset.eventsBound = 'true';
        video.addEventListener('ended', handleClipEnd);
        video.addEventListener('pause', () => {
            if (video.ended && video.getAttribute('data-state') !== 'idle') {
                handleClipEnd();
            }
        });
        video.addEventListener('error', () => {
            if (video.getAttribute('data-state') !== 'idle') {
                updateAvatarState('idle');
            }
        });
    }
}

function updateAvatarState(state) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    console.log("Avatar state updated to:", state);
    const video = document.getElementById('heygen-video');
    const fallback = document.getElementById('avatar-fallback');
    const subtitleEl = document.getElementById('tutor-speech-text');
    if (!video || !fallback) return Promise.resolve(false);
    
    bindVideoStateHandlers();
    
    video.setAttribute('data-state', state);
    
    let videoFile = '';
    let subtitleText = '';
    
    switch(state) {
        case 'thinking':
            videoFile = 'reaction_thinking.mp4';
            subtitleText = currentLang === 'uk' ? 'Розмірковую...' : 'Размышляю...';
            break;
        case 'success':
            videoFile = 'reaction_praise.mp4';
            subtitleText = 'Výborne! Veľmi dobre ti to ide!';
            break;
        case 'retry':
            videoFile = 'reaction_soft_correction.mp4';
            subtitleText = 'Skús to znova, ty to zvládneš!';
            break;
        case 'listening':
            videoFile = 'reaction_listening.mp4';
            subtitleText = currentLang === 'uk' ? 'Слухаю тебе... говори!' : 'Слушаю тебя... говори!';
            break;
        case 'greeting':
        case 'greet':
            videoFile = 'reaction_greeting.mp4';
            subtitleText = 'Ahoj! Volám sa Oksana. Poďme sa spolu učiť slovenské slovíčka!';
            break;
        case 'farewell':
        case 'bye':
            videoFile = 'reaction_goodbye.mp4';
            subtitleText = 'Dovidenia! Teším sa na budúce!';
            break;
        case 'laugh':
            videoFile = 'reaction_laugh.mp4';
            subtitleText = 'Hahaha!';
            break;
        case 'surprise':
            videoFile = 'reaction_surprise.mp4';
            subtitleText = 'Páni! To je super!';
            break;
        case 'idle':
            videoFile = 'reaction_idle.mp4';
            if (scenarios[currentScenario]) {
                subtitleText = scenarios[currentScenario].phrase;
            } else {
                subtitleText = 'Ahoj! Volám sa Oksana. Poďme sa spolu učiť slovenské slovíčka!';
            }
            break;
        case 'achievement':
            videoFile = 'reaction_achievement.mp4';
            subtitleText = 'Fantastické! Gratulujem!';
            break;
        case 'lesson_intro':
        case 'level_1':
        case 'level_2':
        case 'level_3':
        case 'level_4':
        case 'level_5': {
            const padMonth = String(currentMonth).padStart(2, '0');
            const padWeek = String(currentWeek).padStart(2, '0');
            videoFile = `m${padMonth}_w${padWeek}_${currentTrack}.mp4`;
            if (scenarios[currentScenario]) {
                subtitleText = scenarios[currentScenario].phrase;
            }
            break;
        }
        default:
            videoFile = 'reaction_idle.mp4';
            subtitleText = 'Ahoj! Volám sa Oksana. Poďme sa spolu učiť slovenské slovíčka!';
            break;
    }
    
    if (subtitleEl && subtitleText) {
        subtitleEl.innerHTML = subtitleText;
    }

    const isIdle = (state === 'idle');
    video.loop = isIdle;
    if (isIdle) {
        video.setAttribute('loop', 'true');
    } else {
        video.removeAttribute('loop');
    }
    
    const absoluteUrl = new URL(VIDEO_BASE_URL + videoFile, window.location.href).href;
    
    video.src = absoluteUrl;
    try {
        video.currentTime = 0;
        video.load();
    } catch(e) {}

    return safePlayVideo(video, isIdle);
}

// 7. Parent Dashboard: Render Progress Chart
function initParentChart() {
    if (progressChart) return; // Only init once

    const ctx = document.getElementById('progressChart').getContext('2d');
    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: translations[currentLang].chart_days,
            datasets: [{
                label: currentLang === 'uk' ? 'Хвилини занять' : 'Минуты занятий',
                data: [15, 30, 20, 45, 10, 35, 50],
                backgroundColor: 'rgba(11, 71, 166, 0.1)',
                borderColor: '#0b47a6',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#ff9800',
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 60,
                    ticks: { stepSize: 10 }
                }
            }
        }
    });
}


function formatCardNumber(input) {
    let value = input.value.replace(/\D/g, '');
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += value[i];
    }
    input.value = formatted;
}

function formatExpiry(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 2) {
        input.value = value.substring(0, 2) + '/' + value.substring(2, 4);
    } else {
        input.value = value;
    }
}

// Keeps the "Сплатити" button disabled until the VOP agreement checkbox is
// ticked, so a Користувач can't reach Stripe Checkout without confirming
// they've seen the terms first.
function updatePaymentButtonState() {
    const checkbox = document.getElementById('vop-agree-checkbox');
    const submitBtn = document.getElementById('btn-submit-payment');
    if (!checkbox || !submitBtn) return;
    if (checkbox.checked) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        const vopError = document.getElementById('vop-agree-error');
        if (vopError) vopError.classList.add('hidden');
    } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    }
}

async function processPayment() {
    const submitBtn = document.getElementById('btn-submit-payment');
    const email = (currentUserEmail || '').trim();

    // Defense in depth: re-check the VOP agreement server-side-equivalent
    // even though the button is already disabled via updatePaymentButtonState().
    const vopCheckbox = document.getElementById('vop-agree-checkbox');
    if (!vopCheckbox || !vopCheckbox.checked) {
        const vopError = document.getElementById('vop-agree-error');
        if (vopError) vopError.classList.remove('hidden');
        return;
    }

    if (!email) {
        // Registration should always happen before payment in the normal
        // flow, but guard against it just in case.
        alert(currentLang === 'uk'
            ? "Спочатку потрібно зареєструватися, вкажіть email."
            : "Сначала нужно зарегистрироваться, укажите email.");
        return;
    }

    // Figure out which plan was selected, from the amount shown in the modal.
    const plan = Object.values(PRICING_PLANS).find(p => p.price === currentPaymentAmount);
    if (!plan) {
        document.getElementById('payment-error').classList.remove('hidden');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = currentLang === 'uk' ? 'Обробка...' : 'Обработка...';
    }
    document.getElementById('payment-error').classList.add('hidden');

    try {
        // Rewardful (if/when installed) exposes the visitor's referral id
        // here; harmless to omit if it isn't loaded yet.
        const referral = (typeof window !== 'undefined' && window.Rewardful && window.Rewardful.referral) || '';

        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: plan.id, email, referral })
        });

        const data = await response.json();
        if (response.ok && data.url) {
            // Redirect to Stripe's own hosted Checkout page. Nothing about
            // the actual card is ever seen by this site.
            window.location.href = data.url;
            return;
        }

        console.error('Checkout session creation failed:', data);
        document.getElementById('payment-error').classList.remove('hidden');
    } catch (e) {
        console.error('Failed to start checkout:', e);
        document.getElementById('payment-error').classList.remove('hidden');
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = currentLang === 'uk' ? 'Сплатити' : 'Оплатить';
    }
}

// After returning from Stripe Checkout, confirm the real subscription
// status with the server (source of truth) instead of trusting anything
// the browser itself might have set.
async function syncSubscriptionStatusFromServer() {
    const email = (currentUserEmail || '').trim();
    if (!email) return;
    try {
        const response = await fetch(`/api/subscription-status?email=${encodeURIComponent(email)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.active) {
            subscriptionType = 'paid';
            subscriptionStart = Date.now();
            subscriptionEnd = data.currentPeriodEnd ? data.currentPeriodEnd * 1000 : (Date.now() + 30 * 24 * 60 * 60 * 1000);
            saveSubState();
        } else if (data.status === 'canceled' || data.status === 'payment_failed') {
            subscriptionType = 'none';
            saveSubState();
        }
    } catch (e) {
        console.warn('Failed to sync subscription status from server:', e);
    }
}

function handleStripeCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get('payment');
    if (!paymentResult) return;

    if (paymentResult === 'success') {
        syncSubscriptionStatusFromServer().then(() => {
            updateAuthHeaderUI();
            updateDropdownLockState();
            updateScenarioButtonsVisibility();
            updateScenarioUI();
            const modal = document.getElementById('payment-modal');
            if (modal) modal.classList.add('hidden');
            alert(currentLang === 'uk' ? "Оплата успішна! Підписку активовано." : "Оплата прошла успешно! Подписка активирована.");
        });
    }

    // Clean the ?payment=... params out of the URL either way.
    params.delete('payment');
    params.delete('session_id');
    const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, document.title, cleanUrl);
}

// Init App (Defined at the end of the file)


function generateRandomPin(length = 4) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}

function processRegistration() {
    const nameInput = document.getElementById('reg-parent-name');
    const parentName = nameInput ? nameInput.value.trim() : '';
    const email = document.getElementById('reg-email').value.trim();
    const ageInput = document.getElementById('reg-child-age');
    const ageVal = ageInput ? ageInput.value.trim() : '';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const age = parseInt(ageVal);
    
    if (!email || !emailRegex.test(email) || isNaN(age) || age < 6 || age > 14) {
        document.getElementById('reg-error').classList.remove('hidden');
        return;
    }
    document.getElementById('reg-error').classList.add('hidden');

    const regBtn = document.getElementById('btn-submit-registration');
    if (regBtn) { regBtn.disabled = true; }

    // PIN codes are generated here (before the server call) so that if
    // registration succeeds, the server stores these exact codes in Vercel
    // KV — that's what makes login-by-PIN and PIN recovery possible later
    // from any device.
    const newChildPin = generateRandomPin(4);
    const newParentPin = generateRandomPin(6);

    // Server-side check + save (by email, works across any device/browser/
    // incognito) so the same email can't keep getting fresh free trials by
    // just clearing localStorage or switching browsers, and so the PIN
    // codes are recoverable later.
    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, parentName, age, childPin: newChildPin, parentPin: newParentPin })
    })
    .then(res => res.json())
    .then(data => {
        if (regBtn) { regBtn.disabled = false; }
        if (data.alreadyRegistered) {
            document.getElementById('reg-error').innerText = currentLang === 'uk'
                ? "Цей email вже реєструвався раніше. Скористайтесь кнопкою «Вхід за ПІН-кодом», або натисніть «Забули ПІН?», щоб отримати коди повторно на пошту."
                : "Этот email уже регистрировался ранее. Воспользуйтесь кнопкой «Вход по ПИН-коду», или нажмите «Забыли ПИН?», чтобы получить коды повторно на почту.";
            document.getElementById('reg-error').classList.remove('hidden');
            return;
        }
        finishRegistration(email, parentName, age, newChildPin, newParentPin);
    })
    .catch(e => {
        // Deliberately NOT proceeding on network failure anymore: if the
        // server call fails, the PIN codes would never get saved, and the
        // person would be locked out later with no way to recover them.
        console.warn("Registration failed:", e);
        if (regBtn) { regBtn.disabled = false; }
        document.getElementById('reg-error').innerText = currentLang === 'uk'
            ? "Сталася помилка з'єднання. Спробуйте ще раз за кілька секунд."
            : "Произошла ошибка соединения. Попробуйте ещё раз через несколько секунд.";
        document.getElementById('reg-error').classList.remove('hidden');
    });
}

function finishRegistration(email, parentName, age, newChildPin, newParentPin) {
    currentUserEmail = email;
    isRegistered = true;
    childPin = newChildPin;
    parentPin = newParentPin;
    
    if (age >= 12) {
        currentTrack = 'senior';
    } else if (age >= 9) {
        currentTrack = 'middle';
    } else {
        currentTrack = 'junior';
    }
    
    localStorage.setItem('slovahoj_kids_child_age', age.toString());
    if (parentName) {
        localStorage.setItem('slovahoj_kids_parent_name', parentName);
    }

    // Actually start the 7-day free trial — this used to be missing
    // entirely (startFreeTrial() existed but was never called), which
    // meant checkAccessRules() treated every fresh registration as if the
    // trial had already expired.
    subscriptionType = 'trial';
    subscriptionStart = Date.now();
    subscriptionEnd = subscriptionStart + (7 * 24 * 60 * 60 * 1000);

    saveSubState();
    selectTrack(currentTrack);
    
    document.getElementById('reg-child-pin').innerText = childPin;
    document.getElementById('reg-parent-pin').innerText = parentPin;
    document.getElementById('reg-success-details').classList.remove('hidden');
    
    document.getElementById('reg-modal-footer').classList.add('hidden');
    document.getElementById('reg-modal-footer-success').classList.remove('hidden');
    
    updateAuthHeaderUI();
    console.log(`Registered successfully. Parent: ${parentName}, Email: ${email}, Child PIN: ${childPin}, Parent PIN: ${parentPin}`);

    // Picks up test access immediately (see TEST_ACCESS_EMAILS on the
    // server) without waiting for the next page load.
    syncSubscriptionStatusFromServer().then(() => {
        updateAuthHeaderUI();
        updateDropdownLockState();
        updateScenarioButtonsVisibility();
    });
    claimActiveSession();
}

function updateAuthHeaderUI() {
    const authBtnText = document.getElementById('auth-btn-text');
    if (!authBtnText) return;
    if (isRegistered) {
        if (isSubscriptionActive()) {
            authBtnText.innerText = currentLang === 'uk' ? 'Підписка активна (ПІН)' : 'Подписка активна (ПИН)';
        } else {
            authBtnText.innerText = currentLang === 'uk' ? 'Поклич дорослих (Оплата)' : 'Позови взрослых (Оплата)';
        }
    } else {
        authBtnText.innerText = currentLang === 'uk' ? 'Увійти / Зареєструватися' : 'Войти / Зарегистрироваться';
    }
}

function openRegistrationModal() {
    document.getElementById('registration-modal').classList.remove('hidden');
}

// Smart entry point for the header "Увійти / Зареєструватися" button and
// the pricing teaser strip. Someone already registered on this device goes
// straight to the parent-access check; someone new (or on a fresh device)
// gets the PIN-login screen first, which itself offers "Реєструюсь вперше"
// for genuinely new people.
function openAuthEntry() {
    if (isRegistered && parentPin) {
        checkParentAccess();
    } else {
        openLoginPinModal();
    }
}

// --- PIN Login (returning users, any device) ---

function openLoginPinModal() {
    document.getElementById('login-pin-modal').classList.remove('hidden');
}

function closeLoginPinModal() {
    document.getElementById('login-pin-modal').classList.add('hidden');
    document.getElementById('login-pin-error').classList.add('hidden');
    document.getElementById('login-email').value = '';
    document.getElementById('login-pin-input').value = '';
}

function handleLoginPinKey(event) {
    if (event.key === 'Enter') loginWithPin();
}

function loginWithPin() {
    const email = document.getElementById('login-email').value.trim();
    const pin = document.getElementById('login-pin-input').value.trim();
    const errorEl = document.getElementById('login-pin-error');
    errorEl.classList.add('hidden');

    if (!email || !pin) {
        errorEl.innerText = currentLang === 'uk' ? "Введіть Email та ПІН-код." : "Введите Email и ПИН-код.";
        errorEl.classList.remove('hidden');
        return;
    }

    fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, pin })
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (!ok || !data.success) {
            errorEl.innerText = currentLang === 'uk'
                ? "Невірний Email або ПІН-код."
                : "Неверный Email или ПИН-код.";
            errorEl.classList.remove('hidden');
            return;
        }

        currentUserEmail = data.email;
        isRegistered = true;
        childPin = data.childPin;
        parentPin = data.parentPin;

        if (data.age) {
            if (data.age >= 12) currentTrack = 'senior';
            else if (data.age >= 9) currentTrack = 'middle';
            else currentTrack = 'junior';
            localStorage.setItem('slovahoj_kids_child_age', data.age.toString());
        }
        if (data.parentName) {
            localStorage.setItem('slovahoj_kids_parent_name', data.parentName);
        }

        // Restore trial status from the server record so a login from a
        // new device doesn't look like the trial already expired. If the
        // person has since paid, syncSubscriptionStatusFromServer() below
        // will upgrade this to 'paid'; if the trial genuinely ran out,
        // trialEnd will be in the past and this correctly leaves them
        // locked out (that's the real, intended expiry — not a bug).
        if (data.trialEnd && Date.now() <= data.trialEnd) {
            subscriptionType = 'trial';
            subscriptionStart = data.trialStart || (data.trialEnd - 7 * 24 * 60 * 60 * 1000);
            subscriptionEnd = data.trialEnd;
        }

        saveSubState();
        closeLoginPinModal();

        syncSubscriptionStatusFromServer().then(() => {
            updateAuthHeaderUI();
            updateDropdownLockState();
            updateScenarioButtonsVisibility();

            if (data.role === 'parent') {
                setParentVerified(true);
                claimActiveSession();
                switchView('cabinet');
                checkCabinetExpiryAlert();
            } else if (isSubscriptionActive()) {
                childAuthenticated = true;
                sessionStorage.setItem('slovahoj_kids_child_authenticated', 'true');
                claimActiveSession();
                switchView('playground');
            } else {
                document.getElementById('sub-expired-lock-modal').classList.remove('hidden');
            }
        });
    })
    .catch(e => {
        console.warn('PIN login failed:', e);
        errorEl.innerText = currentLang === 'uk' ? "Помилка з'єднання. Спробуйте ще раз." : "Ошибка соединения. Попробуйте ещё раз.";
        errorEl.classList.remove('hidden');
    });
}

// --- Forgot PIN (resend by email) ---

function openForgotPinModal() {
    closeLoginPinModal();
    document.getElementById('forgot-pin-modal').classList.remove('hidden');
}

function closeForgotPinModal() {
    document.getElementById('forgot-pin-modal').classList.add('hidden');
    document.getElementById('forgot-pin-status').classList.add('hidden');
}

function requestPinResend() {
    const email = document.getElementById('forgot-pin-email').value.trim();
    const statusEl = document.getElementById('forgot-pin-status');
    statusEl.classList.remove('hidden');

    if (!email) {
        statusEl.innerText = currentLang === 'uk' ? "Введіть Email." : "Введите Email.";
        return;
    }

    statusEl.innerText = currentLang === 'uk' ? "Надсилаємо..." : "Отправляем...";

    fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', email })
    })
    .then(res => res.json())
    .then(() => {
        statusEl.innerText = currentLang === 'uk'
            ? "Якщо цей email зареєстрований — лист з кодами вже надіслано. Перевірте пошту (в тому числі папку Спам)."
            : "Если этот email зарегистрирован — письмо с кодами уже отправлено. Проверьте почту (включая папку Спам).";
    })
    .catch(() => {
        statusEl.innerText = currentLang === 'uk' ? "Помилка з'єднання." : "Ошибка соединения.";
    });
}

function closeChildProtectionModal() {
    document.getElementById('sub-expired-lock-modal').classList.add('hidden');
}

function proceedToDashboardAfterReg() {
    closeRegistrationModal();
    setParentVerified(true);
    switchView('cabinet');
    
    setTimeout(() => {
        const pricingEl = document.querySelector('.pricing-section');
        if (pricingEl) {
            pricingEl.scrollIntoView({ behavior: 'smooth' });
        }
    }, 300);
}

function verifyChildPin() {
    const pin = document.getElementById('child-gate-pin-input').value.trim();
    if (pin === childPin && isSubscriptionActive()) {
        childAuthenticated = true;
        sessionStorage.setItem('slovahoj_kids_child_authenticated', 'true');
        document.getElementById('child-gate-pin-error').classList.add('hidden');
        closePostTrialModal();
        claimActiveSession();
        alert(currentLang === 'uk' ? "Дитячий доступ активовано! Всі сценарії відкриті." : "Детский доступ активирован! Все сценарии открыты.");
        syncMilestonesUI();
    } else {
        document.getElementById('child-gate-pin-error').innerText = currentLang === 'uk' 
            ? "Неправильний ПІН-код або термін підписки закінчився." 
            : "Неправильный ПИН-код или срок подписки закончился.";
        document.getElementById('child-gate-pin-error').classList.remove('hidden');
    }
}

function handleChildPinKey(event) {
    if (event.key === 'Enter') {
        verifyChildPin();
    }
}

function verifyExpiredChildPin() {
    const pin = document.getElementById('expired-child-pin-input').value.trim();
    if (pin === childPin && isSubscriptionActive()) {
        childAuthenticated = true;
        sessionStorage.setItem('slovahoj_kids_child_authenticated', 'true');
        document.getElementById('expired-child-pin-error').classList.add('hidden');
        document.getElementById('sub-expired-lock-modal').classList.add('hidden');
        claimActiveSession();
        alert(currentLang === 'uk' ? "Доступ поновлено!" : "Доступ возобновлен!");
        syncMilestonesUI();
    } else {
        document.getElementById('expired-child-pin-error').innerText = currentLang === 'uk'
            ? "Неправильний ПІН-код або підписка не продовжена."
            : "Неправильный ПИН-код или подписка не продлена.";
        document.getElementById('expired-child-pin-error').classList.remove('hidden');
    }
}

function handleExpiredChildPinKey(event) {
    if (event.key === 'Enter') {
        verifyExpiredChildPin();
    }
}

function checkParentAccess() {
    if (parentVerified) {
        switchView('cabinet');
        checkCabinetExpiryAlert();
    } else {
        // If not registered on THIS device (e.g. new browser, cleared
        // storage, or a phone that never had the local PIN saved), send
        // them to PIN login first — that modal itself offers "Реєструюсь
        // вперше" for genuinely new people, so nobody who already has an
        // account gets stuck on a registration form that will reject them.
        if (!isRegistered || !parentPin) {
            document.getElementById('login-pin-modal').classList.remove('hidden');
            return;
        }
        document.getElementById('parent-gate-answer').value = '';
        document.getElementById('parent-gate-error').classList.add('hidden');
        document.getElementById('parent-gate-modal').classList.remove('hidden');
        document.getElementById('parent-gate-answer').focus();
    }
}

function checkParentAccessFromLock() {
    document.getElementById('sub-expired-lock-modal').classList.add('hidden');
    checkParentAccess();
}

function verifyParentAnswer() {
    const inputPin = document.getElementById('parent-gate-answer').value.trim();

    if (inputPin === parentPin) {
        setParentVerified(true);
        claimActiveSession();
        switchView('cabinet');
        closeParentGate();
        checkCabinetExpiryAlert();
    } else {
        document.getElementById('parent-gate-error').classList.remove('hidden');
        document.getElementById('parent-gate-answer').value = '';
        document.getElementById('parent-gate-answer').focus();
    }
}

function handleParentGateKey(event) {
    if (event.key === 'Enter') {
        verifyParentAnswer();
    }
}

function closeParentGate() {
    document.getElementById('parent-gate-modal').classList.add('hidden');
    // Ensure that if the playground is locked or limited, the correct lock is restored
    checkAccessRules();
}

let parentExpiryAlertShown = false;

function checkCabinetExpiryAlert() {
    if (isRegistered && subscriptionType !== 'none' && !isSubscriptionActive() && !parentExpiryAlertShown) {
        parentExpiryAlertShown = true;
        setTimeout(() => {
            document.getElementById('parent-expiry-modal').classList.remove('hidden');
        }, 600);
    }
}

// --- Event Analytics Tracking Helper ---
function trackEvent(eventName, eventParams = {}) {
    const payload = {
        event: eventName,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        isRegistered: typeof isRegistered !== 'undefined' ? isRegistered : false,
        subscriptionActive: typeof isSubscriptionActive === 'function' ? isSubscriptionActive() : false,
        currentMonth: typeof currentMonth !== 'undefined' ? currentMonth : 1,
        currentScenario: typeof currentScenario !== 'undefined' ? currentScenario : 1,
        ...eventParams
    };
    console.log("📊 [ANALYTICS EVENT]:", payload);
    try {
        const logs = JSON.parse(localStorage.getItem('slovahoj_analytics_events') || '[]');
        logs.push(payload);
        if (logs.length > 200) logs.shift();
        localStorage.setItem('slovahoj_analytics_events', JSON.stringify(logs));
    } catch (e) {
        console.warn("Could not save analytics log", e);
    }
}

// --- Environment & Feature Flags ---
function checkDevPanelVisibility() {
    const devPanel = document.getElementById('test-dev-panel');
    if (!devPanel) return;

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isDebugUrl = window.location.search.includes('debug=true');
    const isDebugStorage = localStorage.getItem('slovahoj_debug') === 'true';

    if (isLocalhost || isDebugUrl || isDebugStorage) {
        devPanel.classList.remove('hidden');
    } else {
        devPanel.classList.add('hidden');
    }
}

function closeRegistrationModal() {
    trackEvent('registration_modal_closed');
    const modal = document.getElementById('registration-modal');
    if (modal) modal.classList.add('hidden');
}

function closeChildProtectionModal() {
    trackEvent('child_protection_modal_closed');
    const modal = document.getElementById('sub-expired-lock-modal');
    if (modal) modal.classList.add('hidden');
}

function closePostTrialModal() {
    trackEvent('post_trial_modal_closed');
    const modal = document.getElementById('post-trial-modal');
    if (modal) modal.classList.add('hidden');
}

function closeParentExpiryModal() {
    trackEvent('parent_expiry_modal_closed');
    document.getElementById('parent-expiry-modal').classList.add('hidden');
}

function scrollToPricingAndClose() {
    closeParentExpiryModal();
    const pricingEl = document.querySelector('.pricing-section');
    if (pricingEl) {
        pricingEl.scrollIntoView({ behavior: 'smooth' });
    }
}

function simulateSubscriptionExpiration() {
    subscriptionEnd = Date.now() - 1000; // Expired 1 second ago
    saveSubState();
    childAuthenticated = false;
    sessionStorage.setItem('slovahoj_kids_child_authenticated', 'false');
    
    alert("Підписку успішно симульовано як закінчену!");
    switchView('playground');
    checkAccessRules();
}

function resetAllAuthData() {
    currentUserEmail = null;
    parentPin = null;
    childPin = null;
    isRegistered = false;
    subscriptionType = 'none';
    subscriptionStart = 0;
    subscriptionEnd = 0;
    childAuthenticated = false;
    parentExpiryAlertShown = false;
    setParentVerified(false);
    sessionStorage.setItem('slovahoj_kids_child_authenticated', 'false');
    sessionStorage.removeItem('slovahoj_kids_parent_verified');
    
    tutorTrialPassed = {
        human: false
    };
    
    saveSubState();
    saveTutorTrials();
    
    alert("Усі авторизаційні дані скинуто!");
    location.reload();
}

// --- Payment & Subscription Central Pricing Configuration ---
const PRICING_PLANS = {
    '1_month': { id: '1_month', price: 15, nameUk: '1 місяць', nameSk: '1 mesiac', nameRu: '1 месяц' },
    '3_months': { id: '3_months', price: 35, nameUk: '3 місяці', nameSk: '3 mesiace', nameRu: '3 месяца' },
    '12_months': { id: '12_months', price: 99, nameUk: '12 місяців', nameSk: '12 mesiacov', nameRu: '12 месяцев' }
};

let currentPaymentAmount = 35;
let currentPaymentPlanName = '3 місяці';

function openPaymentModal(amount, planName) {
    trackEvent('payment_modal_opened', { amount, planName });
    currentPaymentAmount = amount || 35;
    currentPaymentPlanName = planName || '3 місяці';
    
    // Update UI from single source of truth
    const planNameEl = document.getElementById('payment-plan-name');
    if (planNameEl) planNameEl.innerText = currentPaymentPlanName;
    
    const amountValueEl = document.getElementById('payment-amount-value');
    if (amountValueEl) amountValueEl.innerText = currentPaymentAmount;

    document.getElementById('card-holder').value = '';
    document.getElementById('card-number').value = '';
    document.getElementById('card-expiry').value = '';
    document.getElementById('card-cvv').value = '';
    document.getElementById('payment-error').classList.add('hidden');

    // Reset VOP agreement checkbox each time the modal opens, and keep the
    // pay button disabled until it's ticked again.
    const vopCheckbox = document.getElementById('vop-agree-checkbox');
    if (vopCheckbox) vopCheckbox.checked = false;
    const vopError = document.getElementById('vop-agree-error');
    if (vopError) vopError.classList.add('hidden');
    updatePaymentButtonState();
    
    // Show form and hide success screen in modal
    document.getElementById('payment-main-form').classList.remove('hidden');
    document.getElementById('payment-success-screen').classList.add('hidden');
    document.getElementById('payment-modal-footer').classList.remove('hidden');
    
    // Show modal
    document.getElementById('payment-modal').classList.remove('hidden');
}

function closePaymentModal() {
    trackEvent('payment_modal_closed', { amount: currentPaymentAmount, planName: currentPaymentPlanName });
    document.getElementById('payment-modal').classList.add('hidden');
}

// --- Parent Scheduler & Notifications Implementation ---

function loadParentScheduleUI() {
    const savedSchedule = localStorage.getItem('slovahoj_parent_schedule');
    let schedule = { days: [], time: "" };
    if (savedSchedule) {
        try {
            schedule = JSON.parse(savedSchedule);
        } catch (e) {
            console.error("Error parsing saved schedule", e);
        }
    }
    
    // Update Day Buttons
    for (let day = 1; day <= 7; day++) {
        const btn = document.getElementById(`day-btn-${day}`);
        if (btn) {
            if (schedule.days.includes(day)) {
                btn.style.background = 'var(--primary-color, #0b47a6)';
                btn.style.color = '#ffffff';
                btn.style.borderColor = 'var(--primary-color, #0b47a6)';
            } else {
                btn.style.background = '#ffffff';
                btn.style.color = 'var(--text-dark, #1e293b)';
                btn.style.borderColor = '#cbd5e1';
            }
        }
    }
    
    // Update Time Input
    const timeInput = document.getElementById('schedule-time');
    if (timeInput) {
        timeInput.value = schedule.time || "";
    }
    
    // Update Checkbox for permission
    const notifyChk = document.getElementById('notify-browser-chk');
    if (notifyChk) {
        notifyChk.checked = (Notification.permission === 'granted' && localStorage.getItem('slovahoj_notifications_enabled') === 'true');
    }
}

function toggleScheduleDay(day) {
    const savedSchedule = localStorage.getItem('slovahoj_parent_schedule');
    let schedule = { days: [], time: "" };
    if (savedSchedule) {
        try {
            schedule = JSON.parse(savedSchedule);
        } catch (e) {
            console.error("Error parsing saved schedule", e);
        }
    }
    
    const index = schedule.days.indexOf(day);
    if (index > -1) {
        schedule.days.splice(index, 1);
    } else {
        schedule.days.push(day);
    }
    
    localStorage.setItem('slovahoj_parent_schedule', JSON.stringify(schedule));
    loadParentScheduleUI();
}

function saveParentSchedule() {
    const savedSchedule = localStorage.getItem('slovahoj_parent_schedule');
    let schedule = { days: [], time: "" };
    if (savedSchedule) {
        try {
            schedule = JSON.parse(savedSchedule);
        } catch (e) {
            console.error("Error parsing saved schedule", e);
        }
    }
    
    const timeInput = document.getElementById('schedule-time');
    if (timeInput) {
        schedule.time = timeInput.value;
    }
    
    localStorage.setItem('slovahoj_parent_schedule', JSON.stringify(schedule));

    // Keep the server-side copy in sync too, so the daily reminder cron job
    // always uses the parent's latest chosen days/time.
    if (localStorage.getItem('slovahoj_notifications_enabled') === 'true') {
        syncPushSubscriptionToServer();
    }
}

// Converts the VAPID public key (base64url string from /api/keys) into the
// Uint8Array format the browser's PushManager API requires.
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Registers the Service Worker, subscribes to real browser Push (so
// reminders arrive even when no tab is open, unlike the old in-page-only
// Notification calls), and sends the subscription + current schedule to
// the server so the daily reminder cron job (api/send-scheduled-pushes.js)
// knows who to notify and when.
async function syncPushSubscriptionToServer() {
    const email = (currentUserEmail || '').trim();
    if (!email) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
        const keys = await loadEnv();
        if (!keys || !keys.VAPID_PUBLIC_KEY) {
            console.warn('VAPID public key not available; skipping push subscription.');
            return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keys.VAPID_PUBLIC_KEY)
            });
        }

        const savedSchedule = localStorage.getItem('slovahoj_parent_schedule');
        let schedule = { days: [], time: '' };
        if (savedSchedule) {
            try { schedule = JSON.parse(savedSchedule); } catch (e) {}
        }

        await fetch('/api/save-push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, subscription: subscription.toJSON ? subscription.toJSON() : subscription, schedule })
        });
    } catch (e) {
        console.warn('Push subscription failed (this is non-fatal):', e);
    }
}

function toggleNotificationsPermission() {
    const chk = document.getElementById('notify-browser-chk');
    if (!chk) return;
    
    if (chk.checked) {
        if (!('Notification' in window)) {
            alert(currentLang === 'uk' ? 'Ваш браузер не підтримує push-сповіщення.' : 'Ваш браузер не поддерживает push-уведомления.');
            chk.checked = false;
            localStorage.setItem('slovahoj_notifications_enabled', 'false');
            return;
        }
        
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                localStorage.setItem('slovahoj_notifications_enabled', 'true');
                chk.checked = true;
                // Real push subscription — reminders now arrive even if the
                // site isn't open, not just while this tab is active.
                syncPushSubscriptionToServer();
            } else {
                localStorage.setItem('slovahoj_notifications_enabled', 'false');
                chk.checked = false;
                alert(currentLang === 'uk' 
                    ? 'Дозвіл на сповіщення було відхилено. Будь ласка, увімкніть його в налаштуваннях браузера.' 
                    : 'Разрешение на уведомления было отклонено. Пожалуйста, включите его в настройках браузера.');
            }
        });
    } else {
        localStorage.setItem('slovahoj_notifications_enabled', 'false');
        chk.checked = false;
    }
}

function playAlarmSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, duration, delay) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + delay + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + delay);
            osc.stop(audioCtx.currentTime + delay + duration);
        };
        
        playTone(523.25, 0.5, 0); // C5
        playTone(659.25, 0.5, 0.15); // E5
        playTone(783.99, 0.6, 0.3); // G5
    } catch (e) {
        console.warn("AudioContext playback failed", e);
    }
}

function showToastNotification() {
    const existing = document.getElementById('slovahoj-toast-notification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'slovahoj-toast-notification';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '99999';
    toast.style.background = '#ffffff';
    toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
    toast.style.borderRadius = '12px';
    toast.style.borderLeft = '6px solid var(--primary-color, #0b47a6)';
    toast.style.padding = '16px 20px';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.gap = '10px';
    toast.style.maxWidth = '360px';
    toast.style.animation = 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    
    if (!document.getElementById('slovahoj-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'slovahoj-toast-styles';
        style.innerHTML = `
            @keyframes slideIn {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    const titleText = currentLang === 'uk' ? '⏰ Час займатися!' : '⏰ Время заниматься!';
    const descText = currentLang === 'uk' 
        ? 'Твій персональний урок словацької мови з Оксаною вже починається!' 
        : 'Твой персональный урок словацкого языка с Оксаной уже начинается!';
    const buttonText = currentLang === 'uk' ? 'Почати урок' : 'Начать урок';
    const closeText = currentLang === 'uk' ? 'Закрити' : 'Закрыть';
    
    toast.innerHTML = `
        <div style="font-weight: 700; font-size: 16px; color: var(--primary-color, #0b47a6);">${titleText}</div>
        <div style="font-size: 14px; color: #4b5563; line-height: 1.4;">${descText}</div>
        <div style="display: flex; gap: 10px; margin-top: 5px;">
            <button onclick="switchView('playground'); document.getElementById('slovahoj-toast-notification').remove();" 
                    style="background: var(--primary-color, #0b47a6); color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;">
                ${buttonText}
            </button>
            <button onclick="document.getElementById('slovahoj-toast-notification').remove();" 
                    style="background: #f3f4f6; color: #4b5563; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;">
                ${closeText}
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        const t = document.getElementById('slovahoj-toast-notification');
        if (t) t.remove();
    }, 10000);
}

function testNotificationReminder() {
    playAlarmSound();
    
    const notificationsEnabled = localStorage.getItem('slovahoj_notifications_enabled') === 'true';
    if (notificationsEnabled && Notification.permission === 'granted') {
        const title = currentLang === 'uk' ? 'Словацька мова з Оксаною' : 'Словацкий язык с Оксаной';
        const body = currentLang === 'uk' 
            ? 'Привіт! Час починати наше заняття! Тварини чекають на тебе.' 
            : 'Привет! Время начинать наше занятие! Животные ждут тебя.';
        try {
            new Notification(title, {
                body: body,
                icon: './favicon.ico'
            });
        } catch (e) {
            console.error("Failed to show browser notification", e);
        }
    }
    
    showToastNotification();
}

function checkLessonSchedule() {
    const savedSchedule = localStorage.getItem('slovahoj_parent_schedule');
    if (!savedSchedule) return;
    
    let schedule = null;
    try {
        schedule = JSON.parse(savedSchedule);
    } catch (e) {
        return;
    }
    
    if (!schedule || !schedule.days || schedule.days.length === 0 || !schedule.time) return;
    
    const now = new Date();
    let jsDay = now.getDay();
    let currentDayOfWeek = jsDay === 0 ? 7 : jsDay;
    
    if (!schedule.days.includes(currentDayOfWeek)) return;
    
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeString = `${currentHour}:${currentMinute}`;
    
    if (currentTimeString === schedule.time) {
        const lastTriggered = localStorage.getItem('slovahoj_last_triggered_reminder');
        const triggerIdentifier = `${currentDayOfWeek}-${currentTimeString}`;
        
        if (lastTriggered !== triggerIdentifier) {
            localStorage.setItem('slovahoj_last_triggered_reminder', triggerIdentifier);
            
            playAlarmSound();
            
            const notificationsEnabled = localStorage.getItem('slovahoj_notifications_enabled') === 'true';
            if (notificationsEnabled && Notification.permission === 'granted') {
                const title = currentLang === 'uk' ? 'Словацька мова з Оксаною' : 'Словацкий язык с Оксаной';
                const body = currentLang === 'uk' 
                    ? 'Привіт! Час починати наше заняття! Тварини чекають на тебе.' 
                    : 'Привет! Время начинать наше занятие! Животные ждут тебя.';
                try {
                    new Notification(title, {
                        body: body,
                        icon: './favicon.ico'
                    });
                } catch (e) {
                    console.error("Failed to show browser notification", e);
                }
            }
            
            showToastNotification();
        }
    }
}

function updateDropdownLockState() {
    ['month-select', 'week-select', 'lesson-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            el.classList.remove('disabled-dropdown');
            el.removeAttribute('title');
        }
    });
    const confirmBtn = document.getElementById('btn-confirm-lesson');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('disabled-btn');
        confirmBtn.removeAttribute('title');
    }
}

function checkAccessRules() {
    // If the parent cabinet is currently active, do not apply child locks
    const playground = document.getElementById('playground-view');
    if (playground && playground.classList.contains('hidden')) {
        return true;
    }

    const isSubActive = isSubscriptionActive();
    
    // Check if subscription has expired
    if (isRegistered && !isSubActive && !childAuthenticated) {
        // Show expired lock screen
        document.getElementById('sub-expired-lock-modal').classList.remove('hidden');
        return false;
    }
    
    // If not registered and tutor trial is passed for currentCharacter, lock with post-trial modal
    if (!isRegistered && tutorTrialPassed[currentCharacter]) {
        document.getElementById('post-trial-modal').classList.remove('hidden');
        return false;
    }
    
    // If subscription is inactive (either not registered or expired but child authenticated is false), enforce Scenario 1 only
    if (!isSubActive && !childAuthenticated) {
        if (currentScenario !== 1) {
            currentScenario = 1;
            updateScenarioUI();
            alert(currentLang === 'uk' ? "У пробному режимі доступне лише перше завдання." : "В пробном режиме доступно только первое задание.");
            return false;
        }
    }
    return true;
}

async function speakSlovakAzure(text) {
    const keys = await loadEnv();
    const azureAuth = await getAzureSpeechToken();
    if (!azureAuth) {
        console.warn("Azure Speech token unavailable for TTS. Falling back to browser SpeechSynthesis.");
        speakSlovakBrowser(text);
        return;
    }

    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(azureAuth.token, azureAuth.region);
        const voiceName = (keys && keys.AZURE_SPEECH_VOICE_NAME) ? keys.AZURE_SPEECH_VOICE_NAME : "sk-SK-ViktoriaNeural";
        speechConfig.speechSynthesisVoiceName = voiceName;
        
        const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
        synthesizer.speakTextAsync(
            text,
            result => {
                if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                    console.log("Azure TTS synthesis completed successfully with voice:", voiceName);
                } else {
                    console.error("Azure TTS synthesis failed:", result.errorDetails);
                    speakSlovakBrowser(text);
                }
                synthesizer.close();
            },
            err => {
                console.error("Azure TTS error:", err);
                speakSlovakBrowser(text);
                synthesizer.close();
            }
        );
    } catch (e) {
        console.error("Azure TTS initialization failed:", e);
        speakSlovakBrowser(text);
    }
}

function speakSlovakBrowser(text) {
    if (!text) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'sk-SK';
        utterance.rate = 0.85;
        
        const voices = window.speechSynthesis.getVoices();
        const skVoice = voices.find(v => v.lang.startsWith('sk'));
        if (skVoice) {
            utterance.voice = skVoice;
        }
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
}

function speakSlovak(text) {
    speakSlovakAzure(text);
}

// --- Weekly, Monthly, and Track Selectors ---

function selectTrack(track) {
    firstActionTriggered = true;
    currentTrack = track;
    
    // Toggle active state on track buttons
    const juniorBtn = document.getElementById('track-btn-junior');
    const middleBtn = document.getElementById('track-btn-middle');
    const seniorBtn = document.getElementById('track-btn-senior');
    
    if (juniorBtn) juniorBtn.classList.toggle('active', track === 'junior');
    if (middleBtn) middleBtn.classList.toggle('active', track === 'middle');
    if (seniorBtn) seniorBtn.classList.toggle('active', track === 'senior');
    
    const trackSelect = document.getElementById('track-select');
    if (trackSelect) trackSelect.value = track;
    
    updateScenarioUI();
    updateAvatarState('lesson_intro');
}

function changeMonth(value) {
    firstActionTriggered = true;
    currentMonth = parseInt(value);
    currentWeek = 1;
    currentLessonDay = 1;
    currentScenario = 1;

    const monthSelect = document.getElementById('month-select');
    const weekSelect = document.getElementById('week-select');
    const lessonSelect = document.getElementById('lesson-select');

    if (monthSelect) monthSelect.value = currentMonth.toString();
    if (weekSelect) weekSelect.value = currentWeek.toString();
    if (lessonSelect) lessonSelect.value = currentLessonDay.toString();

    updateScenarioUI();
    startCurrentScenarioLesson();
}

function changeWeek(value) {
    firstActionTriggered = true;
    currentWeek = parseInt(value);
    currentLessonDay = 1;
    currentScenario = 1;

    const weekSelect = document.getElementById('week-select');
    const lessonSelect = document.getElementById('lesson-select');

    if (weekSelect) weekSelect.value = currentWeek.toString();
    if (lessonSelect) lessonSelect.value = currentLessonDay.toString();

    updateScenarioUI();
    startCurrentScenarioLesson();
}

function selectLessonDay(day) {
    firstActionTriggered = true;
    currentLessonDay = parseInt(day);
    currentScenario = currentLessonDay;

    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById('scenario-btn-' + i);
        if (btn) btn.classList.toggle('active', i === currentScenario);
    }

    const lessonSelect = document.getElementById('lesson-select');
    if (lessonSelect) lessonSelect.value = currentLessonDay.toString();

    updateScenarioUI();
    startCurrentScenarioLesson();
}
function exportGDPRData() {
    const data = {
        email: currentUserEmail,
        subscriptionType: subscriptionType,
        subscriptionStart: new Date(subscriptionStart).toISOString(),
        subscriptionEnd: new Date(subscriptionEnd).toISOString(),
        completedScenarios: completedScenarios,
        currentMonth: currentMonth,
        currentWeek: currentWeek,
        currentTrack: currentTrack,
        log: [
            { timestamp: new Date().toISOString(), event: "Profile accessed", details: "GDPR export triggered" },
            { timestamp: new Date().toISOString(), event: "Completed scenarios", details: completedScenarios.join(', ') }
        ]
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slovahoj_gdpr_export_${currentUserEmail || 'anonymous'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function logoutParent() {
    const confirmMsg = currentLang === 'uk'
        ? "Вийти з цього акаунту на цьому пристрої? Прогрес та дані підписки залишаться на сервері — просто увійдіть знову за email та ПІН-кодом, коли завгодно."
        : "Выйти из этого аккаунта на этом устройстве? Прогресс и данные подписки останутся на сервере — просто войдите снова по email и ПИН-коду, когда угодно.";

    if (!confirm(confirmMsg)) return;

    // Clears only THIS device's local session — the server-side record
    // (registration, PIN codes, subscription) is untouched, unlike
    // deleteGDPRProfile(). This is what lets a parent switch which child's
    // account is active on a shared family device without wiping anything.
    currentUserEmail = null;
    parentPin = null;
    childPin = null;
    isRegistered = false;
    parentVerified = false;
    childAuthenticated = false;
    subscriptionType = 'none';
    subscriptionStart = 0;
    subscriptionEnd = 0;
    completedScenarios = [];
    scenarioProgressMap = {};
    currentMonth = 1;
    currentWeek = 1;
    currentTrack = 'junior';

    saveSubState();
    sessionStorage.removeItem('slovahoj_kids_parent_verified');
    sessionStorage.removeItem('slovahoj_kids_child_authenticated');
    localStorage.removeItem(scenarioProgressStorageKey);
    localStorage.removeItem('slovahoj_parent_schedule');
    localStorage.removeItem('slovahoj_last_triggered_reminder');
    localStorage.removeItem('slovahoj_kids_parent_name');
    localStorage.removeItem('slovahoj_kids_child_age');

    location.reload();
}

function deleteGDPRProfile() {
    const confirmMsg = currentLang === 'uk'
        ? "Ви впевнені, що хочете назавжди видалити цей профіль дитини? Всі дані (email, ПІН-коди, прогрес, підписка) будуть стерті з сервера відповідно до регламенту GDPR. Це незворотньо."
        : "Вы уверены, что хотите навсегда удалить этот профиль ребенка? Все данные (email, ПИН-коды, прогресс, подписка) будут стерты с сервера в соответствии с регламентом GDPR. Это необратимо.";

    if (!confirm(confirmMsg)) return;

    const promptMsg = currentLang === 'uk'
        ? "Для підтвердження введіть ваш батьківський ПІН-код:"
        : "Для подтверждения введите ваш родительский ПИН-код:";
    const enteredPin = prompt(promptMsg);
    if (enteredPin === null) return;

    if (!currentUserEmail || enteredPin.trim() !== parentPin) {
        alert(currentLang === 'uk' ? "Невірний ПІН-код. Видалення скасовано." : "Неверный ПИН-код. Удаление отменено.");
        return;
    }

    fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', email: currentUserEmail, pin: enteredPin.trim() })
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (!ok || !data.deleted) {
            alert(currentLang === 'uk'
                ? "Не вдалося видалити профіль на сервері. Спробуйте ще раз, або напишіть нам: slovahoj.kids@gmail.com"
                : "Не удалось удалить профиль на сервере. Попробуйте ещё раз, или напишите нам: slovahoj.kids@gmail.com");
            return;
        }

        currentUserEmail = null;
        parentPin = null;
        childPin = null;
        isRegistered = false;
        subscriptionType = 'none';
        subscriptionStart = 0;
        subscriptionEnd = 0;
        completedScenarios = [];
        scenarioProgressMap = {};
        currentMonth = 1;
        currentWeek = 1;
        currentTrack = 'junior';

        saveSubState();
        localStorage.removeItem(scenarioProgressStorageKey);
        localStorage.removeItem('slovahoj_parent_schedule');
        localStorage.removeItem('slovahoj_last_triggered_reminder');
        localStorage.removeItem('slovahoj_kids_parent_name');
        localStorage.removeItem('slovahoj_kids_child_age');

        const successMsg = currentLang === 'uk'
            ? "Профіль успішно видалено з сервера. Всі дані повністю стерті."
            : "Профиль успешно удалён с сервера. Все данные полностью стёрты.";
        alert(successMsg);
        location.reload();
    })
    .catch(e => {
        console.error('GDPR deletion request failed:', e);
        alert(currentLang === 'uk'
            ? "Помилка з'єднання. Профіль НЕ видалено. Спробуйте ще раз."
            : "Ошибка соединения. Профиль НЕ удалён. Попробуйте ещё раз.");
    });
}

// Init App
window.addEventListener('DOMContentLoaded', async () => {
    // Load env keys
    await loadEnv();

    // For returning registered users, quietly re-check the real
    // subscription status with the server (catches renewals, cancellations,
    // and failed payments that happened since their last visit).
    if (isRegistered && currentUserEmail) {
        syncSubscriptionStatusFromServer().then(() => {
            updateAuthHeaderUI();
            updateDropdownLockState();
            updateScenarioButtonsVisibility();
        });
        // If this device was already authenticated (parent or child) before
        // the page reloaded, resume polling the EXISTING session token —
        // do NOT claim a fresh one here. Claiming on every reload/new-tab
        // was overwriting the token and kicking out the person's own other
        // tabs, which is not what Session Lock is for (only an actual new
        // PIN entry / registration elsewhere should invalidate a session).
        if ((parentVerified || childAuthenticated) && sessionLockToken) {
            startSessionPolling();
        }
    }
    
    // Setup default voices
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
    }
    
    // Check access controls on load
    checkAccessRules();
    checkDevPanelVisibility();

    // Initialize UI
    syncMilestonesUI();
    updateScenarioButtonsVisibility();
    updateScenarioUI();
    updateCharacterLevelImage();
    applyPacingLockToDropdowns();
    
    // Load schedule configurations
    loadParentScheduleUI();
    // Keep the real Push subscription fresh on return visits (browsers can
    // occasionally invalidate a subscription; this quietly re-subscribes).
    if (localStorage.getItem('slovahoj_notifications_enabled') === 'true' && currentUserEmail) {
        syncPushSubscriptionToServer();
    }
    
    // Setup video ended listener and container click handler
    const video = document.getElementById('heygen-video');
    const fallback = document.getElementById('avatar-fallback');
    const videoContainer = document.getElementById('avatar-video-container');
    
    bindVideoStateHandlers();
    
    if (videoContainer) {
        videoContainer.addEventListener('click', () => {
            handleUserInteraction();
        });
        videoContainer.style.cursor = 'pointer';
    }

    // Set initialLoadDone to true now that static rendering is done
    initialLoadDone = true;
    
    // Always start on Month 1, Week 1, Lesson 1 (Day 1) on page reload
    currentMonth = 1;
    currentWeek = 1;
    currentLessonDay = 1;
    currentScenario = 1;
    
    updateDropdownLockState();

    // Reset badge state on load so click-me is visible
    greetingPlayed = false;
    firstActionTriggered = false;
    const clickBadge = document.getElementById('click-me-badge');
    if (clickBadge) clickBadge.classList.remove('hidden');

    // Synchronize UI texts and dropdowns, keep avatar waiting in idle mode until user action
    applyLessonBinding(false);
    if (typeof transitionAvatarStateTo === 'function') {
        transitionAvatarStateTo(AvatarState.IDLE);
    } else {
        updateAvatarState('idle');
    }
    
    // Start parent schedule verification checker (runs every 30 seconds)
    setInterval(checkLessonSchedule, 30000);
    
    // Apply translations and update chat greeting on initial load
    switchLanguage(currentLang);

    // If we just came back from Stripe Checkout, confirm the real
    // subscription status with the server and clean up the URL.
    handleStripeCheckoutReturn();
});

// Explicit Global Window Bindings for HTML Event Handlers
window.confirmLessonSelection = confirmLessonSelection;
window.startFreeTrial = startFreeTrial;
window.logoutParent = logoutParent;
window.closeRegistrationModal = closeRegistrationModal;
window.closeChildProtectionModal = closeChildProtectionModal;
window.closePostTrialModal = closePostTrialModal;
window.openPaymentModal = openPaymentModal;
window.closePaymentModal = closePaymentModal;
window.playGreetingVideo = playGreetingVideo;
window.selectScenario = selectScenario;
window.selectMonth = selectMonth;
window.selectWeek = selectWeek;
window.selectLessonDay = selectLessonDay;
window.selectTrack = selectTrack;



// =========================================================================
// ROCK-SOLID UNIFIED LESSON BINDING (3 Dropdowns -> 4 Targets)
// =========================================================================

// =========================================================================
// UNIFIED 4-PARAMETER SINGLE SOURCE OF TRUTH & TWO-PHASE UI ENGINE
// =========================================================================

// Phase B active session flag (irreversible during active session)
let lessonModeActive = false; // Always start in Phase A (demo) on every fresh page load
// True right after a lesson is fully completed (all 5 scenarios), while waiting for
// the parent/child to pick the next lesson and press "Підтвердити" again.
// Kept separate from lessonModeActive so the screen doesn't fall back to demo content
// just because dropdowns are temporarily unlocked.
let dropdownsUnlockedForNextLesson = false;

// Centralized Single Source of Truth for Phase A (Demo Mode)
const DEMO_PHRASE_DATA = {
    text: "Ahoj! Ako sa máš?",
    translation: "Привіт! Як справи?",
    words: ["Ahoj!", "ako", "sa", "máš?"],
    hintText: "«Ahoj» — це привітання «Привіт», а «Ako sa máš?» означає «Як справи?»",
    scenarios: {
        1: { id: 1, icon: "🎈", title: "Зустрів нового друга на дитячому майданчику", desc: "Привітайся словацькою та запитай, як справи!" },
        2: { id: 2, icon: "🐱", title: "Побачив сусідського кота і привітався жартома", desc: "Привітайся з котиком весело!" },
        3: { id: 3, icon: "🏫", title: "Зайшов до класу вранці", desc: "Привітайся з однокласниками!" },
        4: { id: 4, icon: "👩‍🏫", title: "Зустрів вчительку в коридорі", desc: "Привітайся з вчителькою ввічливо!" },
        5: { id: 5, icon: "👴", title: "Привітав Дідуся по відеодзвінку", desc: "Покажи дідусеві, як ти вітаєшся словацькою!" }
    }
};

function applyDemoPhaseAData() {
    if (lessonModeActive) return;

    // 1. Subtitle under video
    const subtitleEl = document.getElementById('tutor-speech-text');
    if (subtitleEl) { subtitleEl.removeAttribute('data-i18n'); subtitleEl.innerText = DEMO_PHRASE_DATA.text; }

    // 2. Pronunciation tip text
    // NOTE: this element carries data-i18n="tip_content_default" in the
    // static HTML (a placeholder). switchLanguage() blindly resets every
    // [data-i18n] element to that placeholder text whenever it runs — and
    // it runs on every page load — so without removing the attribute here,
    // it would silently overwrite this correct demo hint back to the old
    // static "Dobrý deň..." placeholder a moment after we set it. Same fix
    // applied to the task title/desc below.
    const tipTextEl = document.getElementById('pronunciation-tip-text');
    if (tipTextEl) { tipTextEl.removeAttribute('data-i18n'); tipTextEl.innerText = DEMO_PHRASE_DATA.hintText; }

    // 3. Right window task title, desc, phrase chips & buttons
    const sc = DEMO_PHRASE_DATA.scenarios[currentScenario] || DEMO_PHRASE_DATA.scenarios[1];

    const taskTitleEl = document.getElementById('current-task-title');
    if (taskTitleEl) { taskTitleEl.removeAttribute('data-i18n'); taskTitleEl.innerText = sc.title; }

    const taskDescEl = document.getElementById('current-task-desc');
    if (taskDescEl) {
        taskDescEl.removeAttribute('data-i18n');
        taskDescEl.innerHTML = `${sc.desc}<br><strong>Повтори фразу:</strong> "${DEMO_PHRASE_DATA.text}"`;
    }

    const phraseContainer = document.getElementById('phrase-phoneme-container');
    if (phraseContainer) {
        phraseContainer.classList.remove('hidden');
        if (phraseContainer.parentElement) phraseContainer.parentElement.classList.remove('hidden');
        phraseContainer.innerHTML = '';
        DEMO_PHRASE_DATA.words.forEach(w => {
            const span = document.createElement('span');
            span.className = 'phoneme-word';
            span.innerText = w;
            phraseContainer.appendChild(span);
        });
    }

    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById('scenario-btn-' + i);
        if (btn) btn.classList.toggle('active', i === currentScenario);
    }
}

// Avatar Finite State Machine (FSM)
const AvatarState = {
    IDLE: 'IDLE',
    SPEAKING: 'SPEAKING',
    REACTION: 'REACTION'
};
let currentAvatarFSMState = AvatarState.IDLE;
let speechTimeoutTimer = null;

function buildLessonKey(age, month, week, day, scenarioSlot) {
    const a = age || currentTrack || 'junior';
    const m = month || currentMonth || 1;
    const w = week || currentWeek || 1;
    const d = day || currentLessonDay || 1;
    const s = scenarioSlot || currentScenario || 1;
    return `${a}-${m}-${w}-${d}-${s}`;
}

// Returns { month, week, day } of the day immediately preceding the given one
// in the continuous day-to-day chain (ignores week/month grouping - it's just
// "what came right before this"). Returns null if this is the very first day
// of the whole program, in which case the demo phrase should be used instead.
function getPreviousDayInChain(month, week, day) {
    if (day > 1) return { month, week, day: day - 1 };
    if (week > 1) return { month, week: week - 1, day: 3 };
    if (month > 1) return { month: month - 1, week: 4, day: 3 };
    return null;
}

const monthTopicsFallback = {
    1: { title: "Знайомство та привітання", phrase: "Dobrý deň, ako sa máš?", tip: "«Dobrý deň» — це ввічливе привітання «Добрий день», а буква 'ň' вимовляється м'яко!" },
    2: { title: "Сім'я та родина", phrase: "Toto je moja mama a otec.", tip: "Слово «mama» у словацькій мові наголошується на першому складі!" },
    3: { title: "Школа та навчання", phrase: "Mám rád školu a knihu.", tip: "У слові «škola» буква 'š' вимовляється як українське 'ш'!" },
    4: { title: "Їжа та напої", phrase: "Prosím si jablko a vodu.", tip: "Слово «prosím si» означає «будь ласка, я хотів би»!" },
    5: { title: "Моє місто та дім", phrase: "Bývam v peknom meste.", tip: "Буква 'ý' у слові «bývam» вимовляється довше ніж звичайне 'i'!" },
    6: { title: "Тварини та природа", phrase: "Pes a mačka sú kamaráti.", tip: "Буква 'č' у слові «mačka» вимовляється як 'ч'!" },
    7: { title: "Час та розклад", phrase: "Koľko je hodín?", tip: "Слово «koľko» містить м'який звук 'ľ'!" },
    8: { title: "Професії та хобі", phrase: "Chcem byť lektorom.", tip: "Звук 'ch' вимовляється м'яко як х!" },
    9: { title: "Моє дозвілля", phrase: "Hráme sa spolu futbal.", tip: "Буква 'á' вимовляється довше!" },
    10: { title: "Подорожі та транспорт", phrase: "Cestujeme autobusom.", tip: "Буква 'c' у словацькій вимовляється як 'ц'!" },
    11: { title: "Природа та погода", phrase: "Dnes svieti slnko.", tip: "Буква 'v' у словацькій звучить м'яко!" },
    12: { title: "Свята та традиції", phrase: "Veselé Vianoce prajem!", tip: "«Veselé Vianoce» означає «Щасливого Різдва!»" }
};

// Builds the "new material" content for a given day (month/week/day), independent
// of which scenario slot is currently shown. Used both for the day's own slots 1-4
// AND, when a later day reviews this one, to fetch this day's content again.
function buildDayLessonPayload(age, month, week, day) {
    const a = age || currentTrack || 'junior';
    const m = parseInt(month) || 1;
    const w = parseInt(week) || 1;
    const d = parseInt(day) || 1;
    const padMonth = String(m).padStart(2, '0');
    const padWeek = String(w).padStart(2, '0');
    const padDay = String(d).padStart(2, '0');
    const avatarVideoUrl = `./videos/d${padDay}-w${padWeek}_m${padMonth}_${a}.mp4`;

    if (typeof curriculumCatalog !== 'undefined' &&
        curriculumCatalog[m] && curriculumCatalog[m].weeks && curriculumCatalog[m].weeks[w] &&
        curriculumCatalog[m].weeks[w].days && curriculumCatalog[m].weeks[w].days[d]) {

        const dData = curriculumCatalog[m].weeks[w].days[d];
        // Defaults only apply if there's no track data at all for this day
        // (shouldn't normally happen, but keeps the app from breaking).
        let phrase = "Dobrý deň, ako sa máš?";
        let tipText = null;
        let wordsOverride = null;
        let scenarioList = dData.scenarios || null;

        if (dData.tracks && dData.tracks[a]) {
            const trackData = dData.tracks[a];
            phrase = trackData.phrase || phrase;
            wordsOverride = trackData.words;
            if (trackData.hint) {
                tipText = typeof trackData.hint === 'object' ? (trackData.hint[currentLang] || trackData.hint.uk || null) : trackData.hint;
            } else if (dData.hint) {
                tipText = typeof dData.hint === 'object' ? (dData.hint[currentLang] || dData.hint.uk || null) : dData.hint;
            }
            if (trackData.scenarios) scenarioList = trackData.scenarios;
        } else if (dData.hint) {
            tipText = typeof dData.hint === 'object' ? (dData.hint[currentLang] || dData.hint.uk || null) : dData.hint;
        }

        // A hint about the WRONG phrase is worse than no hint at all — if
        // nothing specific was authored for this phrase, fall back to a
        // generic, phrase-agnostic encouragement instead of a hardcoded
        // default that used to describe an unrelated phrase ("Dobrý deň...")
        // regardless of what phrase was actually shown.
        if (!tipText) {
            tipText = currentLang === 'uk'
                ? `Спробуй вимовити фразу «${phrase}» чітко та повільно!`
                : `Попробуй произнести фразу «${phrase}» чётко и медленно!`;
        }

        const words = (wordsOverride && wordsOverride.length) ? wordsOverride : phrase.split(/\s+/).filter(Boolean);

        return {
            isReal: true,
            isPlaceholder: !!dData.is_placeholder,
            isSafety: !!dData.is_safety,
            topic: dData.topic || '',
            phrase,
            hintText: tipText,
            words,
            scenarioList,
            avatarVideoUrl
        };
    }

    // Fallback: no authored data for this month/week/day yet - use a generic
    // dynamically-generated phrase so the app never breaks, just shows placeholder text.
    const mInfo = monthTopicsFallback[m] || monthTopicsFallback[1];
    let customPhrase = mInfo.phrase;
    if (a === 'middle') customPhrase += " A ty?";
    else if (a === 'senior') customPhrase += " Ďakujem pekne!";
    const words = customPhrase.split(/\s+/).filter(Boolean);

    return {
        isReal: false,
        isPlaceholder: true,
        isSafety: false,
        topic: mInfo.title,
        phrase: customPhrase,
        hintText: mInfo.tip,
        words,
        scenarioList: null,
        avatarVideoUrl
    };
}

const genericScenarioContexts = {
    1: { title: "Зустрів нового друга на майданчику", desc: "Привітайся словацькою мовою впевнено та голосно!" },
    2: { title: "Спілкування у грі", desc: "Скажи словацьку фразу друзям!" },
    3: { title: "Діалог у класі", desc: "Повтори фразу вчительці словацькою!" },
    4: { title: "Бесіда за обідом", desc: "Скажи словацьку фразу за столом!" }
};

function getLessonData(age, month, week, day, scenarioSlot) {
    const a = age || currentTrack || 'junior';
    const m = parseInt(month) || currentMonth || 1;
    const w = parseInt(week) || currentWeek || 1;
    const d = parseInt(day) || currentLessonDay || 1;
    const slot = parseInt(scenarioSlot) || currentScenario || 1;

    // Slot 5 is always the built-in "review" slot: it shows the PREVIOUS day's
    // phrase (or the demo phrase, if this is the very first day of the whole
    // program), never this day's own new material.
    if (slot === 5) {
        const prev = getPreviousDayInChain(m, w, d);
        let base;
        let reviewLabel;

        if (!prev) {
            base = {
                phrase: DEMO_PHRASE_DATA.text,
                hintText: DEMO_PHRASE_DATA.hintText,
                words: DEMO_PHRASE_DATA.words,
                avatarVideoUrl: './videos/demo_lesson_intro.mp4'
            };
            reviewLabel = currentLang === 'uk' ? 'Пригадай фразу з пробного заняття!' : 'Вспомни фразу из пробного занятия!';
        } else {
            const prevPayload = buildDayLessonPayload(a, prev.month, prev.week, prev.day);
            base = prevPayload;
            reviewLabel = currentLang === 'uk' ? 'Пригадай вчорашню фразу!' : 'Вспомни вчерашнюю фразу!';
        }

        return {
            lessonKey: `${a}-${m}-${w}-${d}-review`,
            age: a, month: m, week: w, day: d, lesson: slot,
            avatarVideoUrl: base.avatarVideoUrl,
            pronunciationText: base.phrase,
            hintText: base.hintText,
            scenario: {
                taskTitle: `🔁 ${reviewLabel}`,
                taskDesc: currentLang === 'uk' ? 'Повтори фразу, яку ти вже вивчив!' : 'Повтори фразу, которую ты уже выучил!',
                words: base.words
            }
        };
    }

    // Slots 1-4: this day's own new material, in 4 different scenario contexts
    const payload = buildDayLessonPayload(a, m, w, d);
    let taskTitle = payload.topic || `Заняття ${slot}`;
    let taskDesc = "Повтори фразу словацькою мовою та отримай бали!";

    if (payload.scenarioList) {
        const sc = payload.scenarioList.find(s => s.id === slot) || payload.scenarioList[0];
        if (sc && sc.title) {
            taskTitle = typeof sc.title === 'object' ? (sc.title[currentLang] || sc.title.uk || taskTitle) : sc.title;
        }
        if (sc && sc.desc) {
            taskDesc = typeof sc.desc === 'object' ? (sc.desc[currentLang] || sc.desc.uk || taskDesc) : sc.desc;
        }
    } else {
        const scInfo = genericScenarioContexts[slot] || genericScenarioContexts[1];
        taskTitle = scInfo.title;
        taskDesc = scInfo.desc;
    }

    return {
        lessonKey: `${a}-${m}-${w}-${d}-${slot}`,
        age: a, month: m, week: w, day: d, lesson: slot,
        avatarVideoUrl: payload.avatarVideoUrl,
        pronunciationText: payload.phrase,
        hintText: payload.hintText,
        scenario: { taskTitle, taskDesc, words: payload.words }
    };
}

function onCombinationChange(age, month, week, day, scenarioSlot, autoPlayVideo = false) {
    const key = buildLessonKey(age, month, week, day, scenarioSlot);
    const data = getLessonData(age, month, week, day, scenarioSlot);

    console.log('[DEBUG] onCombinationChange called:', { age, month, week, day, scenarioSlot, autoPlayVideo, lessonModeActive, key, data });

    if (!data) {
        console.error(`[DEBUG] Missing lesson data for key: ${key}`);
        return;
    }

    // 1. Update Subtitle under Video
    const subtitleEl = document.getElementById('tutor-speech-text');
    if (subtitleEl) {
        subtitleEl.removeAttribute('data-i18n');
        subtitleEl.innerText = data.pronunciationText;
    }

    // 2. Update Pronunciation Tip Text
    // (data-i18n removed here too — see the long comment in
    // applyDemoPhaseAData() explaining why: without this, switchLanguage()
    // silently overwrites this real hint back to the static HTML
    // placeholder the very next time it runs.)
    const tipTextEl = document.getElementById('pronunciation-tip-text');
    if (tipTextEl) {
        tipTextEl.removeAttribute('data-i18n');
        tipTextEl.innerText = data.hintText;
    }

    // 3. Update Right Window (Title, Description, Phrase, Scenario buttons)
    const taskTitleEl = document.getElementById('current-task-title');
    if (taskTitleEl) {
        taskTitleEl.removeAttribute('data-i18n');
        taskTitleEl.innerText = data.scenario.taskTitle;
    }

    const taskDescEl = document.getElementById('current-task-desc');
    if (taskDescEl) {
        taskDescEl.removeAttribute('data-i18n');
        const progressCount = completedScenarios.length;
        const progressLabel = ` (Пройдено: ${progressCount}/5)`;
        taskDescEl.innerHTML = `${data.scenario.taskDesc}${progressLabel}<br><strong>Повтори фразу:</strong> "${data.pronunciationText}"`;
    }

    const phraseContainer = document.getElementById('phrase-phoneme-container');
    if (phraseContainer && data.scenario.words) {
        phraseContainer.classList.remove('hidden');
        if (phraseContainer.parentElement) phraseContainer.parentElement.classList.remove('hidden');
        phraseContainer.innerHTML = '';
        data.scenario.words.forEach(w => {
            const span = document.createElement('span');
            span.className = 'phoneme-word';
            span.innerText = w;
            phraseContainer.appendChild(span);
        });
    }

    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById('scenario-btn-' + i);
        if (btn) btn.classList.toggle('active', i === data.lesson);
    }
    updateScenarioButtonProgress();

    // 4. Update Avatar Video Player (ONLY if explicit autoplay requested in Phase B)
    if (autoPlayVideo && lessonModeActive) {
        transitionAvatarStateTo(AvatarState.SPEAKING, data.avatarVideoUrl);
    }
}

function transitionAvatarStateTo(newState, mediaSource) {
    currentAvatarFSMState = newState;
    const video = document.getElementById('heygen-video');
    if (!video) return;

    if (newState === AvatarState.IDLE) {
        video.muted = false;
        video.loop = true;
        video.setAttribute('loop', 'true');
        const idleUrl = new URL('./videos/reaction_idle.mp4', window.location.href).href;
        if (video.src !== idleUrl) {
            video.src = idleUrl;
        }
        if (typeof safePlayVideo === 'function') {
            safePlayVideo(video, true);
        } else {
            video.play().catch(() => {});
        }
    } else if (newState === AvatarState.SPEAKING) {
        video.muted = false;
        video.loop = false;
        video.removeAttribute('loop');
        const srcUrl = mediaSource ? new URL(mediaSource, window.location.href).href : video.src;
        if (video.src !== srcUrl) {
            video.src = srcUrl;
        }
        video.onended = () => {
            transitionAvatarStateTo(AvatarState.IDLE);
        };
        if (typeof safePlayVideo === 'function') {
            safePlayVideo(video, false);
        } else {
            video.play().catch(() => {});
        }
    } else if (newState === AvatarState.REACTION) {
        video.muted = false;
        video.loop = false;
        video.removeAttribute('loop');
        const reactionUrl = mediaSource ? new URL(mediaSource, window.location.href).href : new URL('./videos/reaction_praise.mp4', window.location.href).href;
        if (video.src !== reactionUrl) {
            video.src = reactionUrl;
        }
        video.onended = () => {
            transitionAvatarStateTo(AvatarState.IDLE);
        };
        if (typeof safePlayVideo === 'function') {
            safePlayVideo(video, false);
        } else {
            video.play().catch(() => {});
        }
    }
}

function applyLessonBinding(autoplayVideo = false) {
    const monthSelect = document.getElementById('month-select');
    const weekSelect = document.getElementById('week-select');
    const lessonSelect = document.getElementById('lesson-select');
    const trackSelect = document.getElementById('track-select');

    if (monthSelect) monthSelect.value = currentMonth.toString();
    if (weekSelect) weekSelect.value = currentWeek.toString();
    if (lessonSelect) lessonSelect.value = currentLessonDay.toString();
    if (trackSelect) trackSelect.value = currentTrack;

    if (lessonModeActive) {
        onCombinationChange(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario, autoplayVideo);
    } else {
        applyDemoPhaseAData();
    }
}

function updateDropdownLockState() {
    const isLocked = lessonModeActive && !dropdownsUnlockedForNextLesson;
    ['month-select', 'week-select', 'lesson-select', 'track-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isLocked;
            if (isLocked) {
                el.classList.add('disabled-dropdown');
                el.setAttribute('title', 'Дропдауни заблоковані під час активного уроку (Фаза B)');
            } else {
                el.classList.remove('disabled-dropdown');
                el.removeAttribute('title');
            }
        }
    });

    const confirmBtn = document.getElementById('btn-confirm-lesson');
    if (confirmBtn) {
        confirmBtn.disabled = isLocked;
        if (isLocked) {
            confirmBtn.classList.add('disabled-btn');
            confirmBtn.innerHTML = '<i class="fa-solid fa-lock"></i> <span>Урок активовано</span>';
        } else {
            confirmBtn.classList.remove('disabled-btn');
            confirmBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span data-i18n="btn_confirm_lesson">Підтвердити</span>';
        }
    }
}

// --- Weekly Pacing Gate ---------------------------------------------
// Prevents a fast/dedicated child from binge-completing the whole 6-month
// course in a few days: a new "тиждень" (week, 3 lesson-days) only unlocks
// once 7 real calendar days have passed since the paid/trial period
// started. Within an already-unlocked week, all 3 days remain freely
// available (a family can do them back-to-back on a rainy weekend) — only
// jumping ahead to a NOT-yet-time-unlocked week is blocked. This also
// matches the course's own structure (3 lesson-days per week) and means
// the 6-month course takes roughly 6 real months either way, matching what
// people are actually paying for.
const WEEKS_PER_MONTH = 4;
const TOTAL_COURSE_WEEKS = 6 * WEEKS_PER_MONTH; // 24

function getWeekLinearIndex(month, week) {
    return (month - 1) * WEEKS_PER_MONTH + (week - 1); // 0-based
}

function getMaxUnlockedWeekIndex() {
    // No active trial/subscription period recorded yet -> only the very
    // first week (index 0) is available, same as a brand new user.
    if (!subscriptionStart) return 0;
    const daysSinceStart = Math.floor((Date.now() - subscriptionStart) / (24 * 60 * 60 * 1000));
    return Math.min(Math.floor(daysSinceStart / 7), TOTAL_COURSE_WEEKS - 1);
}

function isWeekPacingLocked(month, week) {
    return getWeekLinearIndex(month, week) > getMaxUnlockedWeekIndex();
}

// Refreshes the 🔒 markers + disabled state on the week dropdown options
// for whichever month is currently selected. Call whenever the month
// changes or on initial page load.
function applyPacingLockToDropdowns() {
    const weekSelect = document.getElementById('week-select');
    if (!weekSelect) return;
    const maxUnlockedWeekIndex = getMaxUnlockedWeekIndex();

    Array.from(weekSelect.options).forEach(opt => {
        const w = parseInt(opt.value);
        if (!w) return;
        const idx = getWeekLinearIndex(currentMonth, w);
        const isLocked = idx > maxUnlockedWeekIndex;
        opt.disabled = isLocked;

        const baseText = (opt.dataset.baseText || opt.text).replace(/ 🔒.*$/, '');
        opt.dataset.baseText = baseText;
        if (isLocked) {
            const daysLeft = (idx * 7) - Math.floor((Date.now() - (subscriptionStart || Date.now())) / (24 * 60 * 60 * 1000));
            opt.text = `${baseText} 🔒 (через ${Math.max(daysLeft, 1)} дн.)`;
        } else {
            opt.text = baseText;
        }
    });
}
window.applyPacingLockToDropdowns = applyPacingLockToDropdowns;

function confirmLessonSelection() {
    firstActionTriggered = true;
    const monthEl = document.getElementById('month-select');
    const weekEl = document.getElementById('week-select');
    const lessonEl = document.getElementById('lesson-select');
    const trackEl = document.getElementById('track-select');

    if (monthEl) currentMonth = parseInt(monthEl.value) || currentMonth;
    if (weekEl) currentWeek = parseInt(weekEl.value) || currentWeek;
    if (lessonEl) currentLessonDay = parseInt(lessonEl.value) || currentLessonDay;
    if (trackEl) currentTrack = trackEl.value || currentTrack;
    currentScenario = 1; // Always start a newly picked day on scenario slot 1

    // Weekly pacing gate: block jumping ahead to a week that hasn't "arrived"
    // yet in real time, even though the child could technically pick it.
    if (isWeekPacingLocked(currentMonth, currentWeek)) {
        const idx = getWeekLinearIndex(currentMonth, currentWeek);
        const daysLeft = Math.max((idx * 7) - Math.floor((Date.now() - (subscriptionStart || Date.now())) / (24 * 60 * 60 * 1000)), 1);
        alert(currentLang === 'uk'
            ? `Цей тиждень ще не відкрився! Оксана чекає на тебе через ${daysLeft} дн. 📅 А поки — повтори вже пройдені уроки!`
            : `Эта неделя еще не открылась! Оксана ждет тебя через ${daysLeft} дн. 📅 А пока — повтори уже пройденные уроки!`);
        applyPacingLockToDropdowns();
        return;
    }

    console.log('[DEBUG] confirmLessonSelection clicked. New selection:', { currentTrack, currentMonth, currentWeek, currentLessonDay });

    // Load this specific day's own saved progress (fresh if never started, resumed if revisited)
    loadCompletedScenariosForCurrentLesson();
    syncMilestonesUI();

    // Irreversible transition to Phase B
    lessonModeActive = true;
    dropdownsUnlockedForNextLesson = false;

    // Unmount demo badge & lock dropdowns
    const badge = document.getElementById('click-me-badge');
    if (badge) badge.classList.add('hidden');
    updateDropdownLockState();

    // Trigger atomic lesson render & play speaking avatar video
    onCombinationChange(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario, true);

    // Explain to the child what "finishing the day" actually means:
    // 4 icons with today's new phrase in different situations, plus 1 icon
    // (with the 🔁 symbol) that repeats yesterday's phrase.
    if (completedScenarios.length === 0) {
        const introMsg = currentLang === 'uk'
            ? 'Сьогодні у тебе нова фраза у 4 різних ситуаціях, а остання іконка 🔁 — це повторення вчорашньої фрази! Пройди всі 5 іконок по черзі — і заняття буде завершено ✅.'
            : 'Сегодня у тебя новая фраза в 4 разных ситуациях, а последняя иконка 🔁 — это повторение вчерашней фразы! Пройди все 5 иконок по очереди — и занятие будет завершено ✅.';
        appendChatBubble('tutor', introMsg);
    }
}

function changeMonth(value) {
    if (lessonModeActive && !dropdownsUnlockedForNextLesson) return; // Locked during active lesson
    currentMonth = parseInt(value) || 1;
    currentWeek = 1;
    currentLessonDay = 1;
    currentScenario = 1;
    applyPacingLockToDropdowns();
    if (dropdownsUnlockedForNextLesson) {
        // Just record the pick; screen stays on the completed lesson until "Підтвердити" again
        const monthSelect = document.getElementById('month-select');
        if (monthSelect) monthSelect.value = currentMonth.toString();
        const weekSelect = document.getElementById('week-select');
        if (weekSelect) weekSelect.value = currentWeek.toString();
        const lessonSelect = document.getElementById('lesson-select');
        if (lessonSelect) lessonSelect.value = currentLessonDay.toString();
    } else {
        applyLessonBinding(false);
    }
}

function changeWeek(value) {
    if (lessonModeActive && !dropdownsUnlockedForNextLesson) return; // Locked during active lesson
    currentWeek = parseInt(value) || 1;
    currentLessonDay = 1;
    currentScenario = 1;
    if (dropdownsUnlockedForNextLesson) {
        const weekSelect = document.getElementById('week-select');
        if (weekSelect) weekSelect.value = currentWeek.toString();
        const lessonSelect = document.getElementById('lesson-select');
        if (lessonSelect) lessonSelect.value = currentLessonDay.toString();
    } else {
        applyLessonBinding(false);
    }
}

function selectLessonDay(day) {
    if (lessonModeActive && !dropdownsUnlockedForNextLesson) return; // Locked during active lesson
    currentLessonDay = parseInt(day) || 1;
    currentScenario = 1; // A newly picked day always starts on scenario slot 1
    if (!dropdownsUnlockedForNextLesson) {
        applyLessonBinding(false);
    }
}

function selectScenario(num) {
    currentScenario = parseInt(num) || 1;
    if (lessonModeActive) {
        onCombinationChange(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario, true);
    } else {
        applyDemoPhaseAData();
    }
}

function selectTrack(t) {
    currentTrack = t;
    localStorage.setItem('slovahoj_kids_child_track', t);

    const trackSelects = document.querySelectorAll('#track-select, select[name="track-select"]');
    trackSelects.forEach(el => { el.value = t; });

    if (lessonModeActive && !dropdownsUnlockedForNextLesson) {
        // Track change means a different lesson key too - load that lesson's own progress
        loadCompletedScenariosForCurrentLesson();
        syncMilestonesUI();
        // Invalidate and rebuild lesson key atomically
        onCombinationChange(currentTrack, currentMonth, currentWeek, currentLessonDay, currentScenario, true);
    } else if (dropdownsUnlockedForNextLesson) {
        // Just record the pick; screen stays on the completed lesson until "Підтвердити" again
    } else {
        applyLessonBinding(false);
    }
}

function selectMonth(m) { changeMonth(m); }
function selectWeek(w) { changeWeek(w); }

