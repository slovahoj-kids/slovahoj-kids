// 1. App State & Configurations
let currentLang = 'uk';
let currentCharacter = 'human'; // 'human' maps to Оксана
let isRecording = false;
let recordTimer = null;
let progressChart = null;
let parentVerified = sessionStorage.getItem('slovahoj_kids_parent_verified') === 'true'; // Flag for parent cabinet authorization

function setParentVerified(val) {
    parentVerified = val;
    sessionStorage.setItem('slovahoj_kids_parent_verified', val ? 'true' : 'false');
}

// Curriculum progression states
let currentMonth = 1;
let currentWeek = 1;
let currentLessonDay = 1;
let currentTrack = localStorage.getItem('slovahoj_kids_child_track') || 'junior'; // 'junior', 'middle', 'senior'
let currentScenario = 1;
const completedScenariosKey = 'slovahoj_kids_completed_scenarios';
let completedScenarios = [1, 2, 3];
try {
    const stored = localStorage.getItem(completedScenariosKey);
    if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
            completedScenarios = parsed;
        }
    }
} catch (e) {
    console.warn("Error parsing completedScenarios, using default.", e);
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

function confirmLessonSelection() {
    const confirmBtn = document.getElementById('btn-confirm-lesson');
    if (confirmBtn) {
        confirmBtn.classList.remove('blinking-btn');
    }
    dropdownSeqStep = 0;
    
    const sc = scenarios[currentScenario];
    if (sc) {
        updateAvatarState('lesson_intro');
    }
    
    const msg = currentLang === 'uk' ? 'Урок розпочато! Успіхів!' : 'Урок начат! Успехов!';
    appendChatBubble('tutor', msg);
}

function playGreetingVideo() {
    greetingPlayed = true;
    const badge = document.getElementById('click-me-badge');
    if (badge) badge.classList.add('hidden');
    updateAvatarState('greeting');
}

function triggerFirstActionIfNeeded() {
    if (!firstActionTriggered) {
        firstActionTriggered = true;
        updateAvatarState('level_' + currentScenario);
        const confirmBtn = document.getElementById('btn-confirm-lesson');
        if (confirmBtn) {
            confirmBtn.classList.add('blinking-btn');
        }
    }
}

function handleUserInteraction() {
    const badge = document.getElementById('click-me-badge');
    if (badge) badge.classList.add('hidden');

    if (!greetingPlayed) {
        playGreetingVideo();
        return false;
    }
    if (!firstActionTriggered) {
        triggerFirstActionIfNeeded();
        return false;
    }
    return true;
}

// Explicit global window bindings for inline HTML handlers
window.handleUserInteraction = handleUserInteraction;
window.playGreetingVideo = playGreetingVideo;
window.triggerFirstActionIfNeeded = triggerFirstActionIfNeeded;
window.confirmLessonSelection = confirmLessonSelection;
window.openRegistrationModal = openRegistrationModal;
window.closeChildProtectionModal = closeChildProtectionModal;
window.updateAuthHeaderUI = updateAuthHeaderUI;

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
const ADMIN_PIN = "9999"; // Unified admin code to access both areas

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
        theme: "Знайомство та привітання",
        weeks: {
            1: {
                topic: "Привіт і знайомство",
                is_safety: false,
                hint: {
                    uk: "Це слово підходить і вранці, і ввечері — універсальне!",
                    ru: "Это слово подходит и утром, и вечером — универсальное!"
                },
                tracks: {
                    junior: {
                        phrase: "Dobrý deň, ako sa máš?",
                        translation: "Добрий день, як справи?",
                        words: ["Dobrý", "deň,", "ako", "sa", "máš?"],
                        intro: "Ahoj! Ja som Oksana. Poďme sa spolu zahrať!"
                    },
                    middle: {
                        phrase: "Dobrý deň, ako sa máš?",
                        translation: "Добрий день, як справи?",
                        words: ["Dobrý", "deň,", "ako", "sa", "máš?"],
                        intro: "Ahoj! Ako sa voláš? Ja som Oksana."
                    },
                    senior: {
                        phrase: "Dobrý deň, ako sa máš?",
                        translation: "Добрий день, як справи?",
                        words: ["Dobrý", "deň,", "ako", "sa", "máš?"],
                        intro: "Ahoj, ako sa voláš? Ja som Oksana. Odkiaľ si?"
                    }
                },
                scenarios: [
                    { id: 1, title_icon: "🎈", title: { uk: "Зустрів нового друга на дитячому майданчику", ru: "Встретил нового друга на детской площадке" } },
                    { id: 2, title_icon: "🐱", title: { uk: "Побачив сусідського кота і привітався жартома", ru: "Увидел соседского кота и поздоровался в шутку" } },
                    { id: 3, title_icon: "🏫", title: { uk: "Зайшов до класу вранці", ru: "Вошел в класс утром" } },
                    { id: 4, title_icon: "👩‍🏫", title: { uk: "Зустрів вчительку в коридорі", ru: "Встретил учительницу в коридоре" } },
                    { id: 5, title_icon: "👴", title: { uk: "Привітав Дідуся по відеодзвінку", ru: "Поздравил Дедушку по видеозвонку" } }
                ],
                mistake_or_joke: "Секунду, я сама трохи забула це слово. Навіть дорослі повторюють!"
            },
            2: {
                topic: "Як справи",
                is_safety: false,
                hint: {
                    uk: "«Ďakujem» звучить схоже на «дякую» — легко запам'ятати!",
                    ru: "«Ďakujem» звучит похоже на «дякую» — легко запомнить!"
                },
                tracks: {
                    junior: {
                        phrase: "Dobre, ďakujem.",
                        translation: "Добре, дякую.",
                        words: ["Dobre", "ďakujem"],
                        intro: "Ako sa máš? Ja som dnes veľmi šťastná!"
                    },
                    middle: {
                        phrase: "Ako sa máš? — Dobre, a ty?",
                        translation: "Як справи? — Добре, а ти?",
                        words: ["Ako sa máš", "Dobre", "a ty"],
                        intro: "Ako sa máš dnes?"
                    },
                    senior: {
                        phrase: "Ako sa dnes máš? Bolo niečo zaujímavé v škole?",
                        translation: "Як справи сьогодні? Було щось цікаве в школі?",
                        words: ["Ako sa dnes máš", "Bolo niečo zaujímavé", "v škole"],
                        intro: "Ako sa dnes máš? Bolo niečo zaujímavé в школі?"
                    }
                },
                scenarios: [
                    { id: 1, title_icon: "👩", title: { uk: "Відповідь мамі вранці", ru: "Ответ маме утром" } },
                    { id: 2, title_icon: "👩‍🏫", title: { uk: "Відповідь вчительці", ru: "Ответ учительнице" } },
                    { id: 3, title_icon: "👦", title: { uk: "Відповідь другові на майданчику", ru: "Ответ другу на площадке" } },
                    { id: 4, title_icon: "👵", title: { uk: "Відповідь бабусі по телефону", ru: "Ответ бабушке по телефону" } },
                    { id: 5, title_icon: "🐶", title: { uk: "Відповідь новому сусідському цуценяті", ru: "Ответ новому соседскому щенку в шутку" } }
                ],
                mistake_or_joke: "Ой, здається, я переплутала порядок слів! Буває навіть у мене."
            },
            3: {
                topic: "Прощання",
                is_safety: false,
                hint: {
                    uk: "Довге слово Dovidenia можна розбити: До-ви-де-ня.",
                    ru: "Длинное слово Dovidenia можно разбить: До-ви-де-ня."
                },
                tracks: {
                    junior: {
                        phrase: "Dovidenia!",
                        translation: "До побачення!",
                        words: ["Dovidenia"],
                        intro: "Dovidenia, kamarát! Uvidíme sa nabudúce."
                    },
                    middle: {
                        phrase: "Maj sa pekne! Uvidíme sa zajtra.",
                        translation: "Гарного дня! Побачимось завтра.",
                        words: ["Maj sa pekne", "Uvidíme sa", "zajtra"],
                        intro: "Maj sa pekne! Uvidíme sa zajtra."
                    },
                    senior: {
                        phrase: "Bolo super sa s tebou porozprávať. Maj sa a čoskoro dopočutia!",
                        translation: "Було супер з тобою поспілкуватися. Бувай, до швидкого!",
                        words: ["Bolo super", "porozprávať", "Maj sa", "dopočutia"],
                        intro: "Bolo super sa s tebou porozprávať!"
                    }
                },
                scenarios: [
                    { id: 1, title_icon: "👩‍🏫", title: { uk: "Прощання з вчителькою", ru: "Прощание с учительницей" } },
                    { id: 2, title_icon: "👋", title: { uk: "Прощання з другом на майданчику", ru: "Прощание с другом на площадке" } },
                    { id: 3, title_icon: "🚌", title: { uk: "Прощання з водієм автобуса", ru: "Прощание с водителем автобуса" } },
                    { id: 4, title_icon: "🛒", title: { uk: "Прощання з продавчинею в магазині", ru: "Прощание с продавщицей в магазине" } },
                    { id: 5, title_icon: "👴", title: { uk: "Прощання з Дідусем по відеодзвінку", ru: "Прощание с Дедушкой по видеозвонку" } }
                ],
                mistake_or_joke: "Хвилинку… а як це было? Ах так, згадала!"
            },
            4: {
                topic: "Ввічлива відмова (безпека)",
                is_safety: true,
                hint: {
                    uk: "Це чарівна фраза. Вона працює в будь-якій країні і завжди ввічлива.",
                    ru: "Это волшебная фраза. Она работает в любой стране и всегда вежлива."
                },
                tracks: {
                    junior: {
                        phrase: "Nie, ďakujem.",
                        translation: "Ні, дякую.",
                        words: ["Nie", "ďakujem"],
                        intro: "Ak niekto neznámy niečo ponúka, povieš: Nie, ďakujem!"
                    },
                    middle: {
                        phrase: "Nie, ďakujem. Musím ísť za mamou.",
                        translation: "Ні, дякую. Мені треба йти до мами.",
                        words: ["Nie, ďakujem", "Musím ísť", "za mamou"],
                        intro: "Vždy môžeš povedať: Nie, ďakujem. Musím ísť za mamou."
                    },
                    senior: {
                        phrase: "Prepáčte, nemám záujem. Idem za rodičmi, čakajú ma.",
                        translation: "Вибачте, мене це не цікавитть. Я йду до батьків, вони на мене чекають.",
                        words: ["Prepáčte", "nemám záujem", "Idem za rodičmi", "čakajú ma"],
                        intro: "Prepáčte, nemám záujem. Idem za rodičmi, čakajú ma."
                    }
                },
                scenarios: [
                    { id: 1, title_icon: "🍬", title: { uk: "Незнайомець пропонує цукерку на вулиці", ru: "Незнакомец предлагает конфету на улице" } },
                    { id: 2, title_icon: "🐶", title: { uk: "Незнайомець кличе подивитися цуценя за рогом", ru: "Незнакомец зовет посмотреть щенка за углом" } },
                    { id: 3, title_icon: "🌳", title: { uk: "Хтось у парку пропонує піти показати щось", ru: "Кто-то в парке предлагает пойти показать что-то интересное" } },
                    { id: 4, title_icon: "🚗", title: { uk: "Незнайома людина пропонує підвезти", ru: "Незнакомый человек предлагает подвезти" } },
                    { id: 5, title_icon: "🤔", title: { uk: "Рольова гра: незнайомець каже, що знає маму", ru: "Ролевая игра: а что если незнакомец говорит, что знает твою маму?" } }
                ],
                mistake_or_joke: null
            }
        }
    },
    2: {
        theme: "Сім'я та дім",
        weeks: {
            1: {
                topic: "Члени родини",
                is_safety: false,
                hint: {
                    uk: "«Mama» і «otec» звучать майже так само — легко запам'ятати.",
                    ru: "«Mama» и «otec» звучат почти так же — легко запомнить."
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
                    { id: 4, title_icon: "👵", title: { uk: "Розповідає бабусі по відеодзвінку", ru: "Рассказывает бабушке по видеозвонку" } },
                    { id: 5, title_icon: "📝", title: { uk: "Заповнює шкільну анкету про родину", ru: "Заполняет школьную анкету о семье" } }
                ],
                mistake_or_joke: "Ой-ой, зачекай, я відволіклася. Спробуємо ще раз разом?"
            },
            2: {
                topic: "Мій дім",
                is_safety: false,
                hint: {
                    uk: "«Izba» — кімната, слово часто зустрічатиметься далі.",
                    ru: "«Izba» — комната, это слово часто будет встречаться дальше."
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
                        intro: "Toto je náš byt. Mám tu svoju izbu a tu je obývaчка."
                    }
                },
                scenarios: [
                    { id: 1, title: { uk: "Показує кімнату другу по відео", ru: "Показывает комнату другу по видео" } },
                    { id: 2, title: { uk: "Розповідає про новий дім бабусі", ru: "Рассказывает о новом доме бабушке" } },
                    { id: 3, title: { uk: "Пояснює сусідському хлопчику, де живе", ru: "Объясняет соседскому мальчику, где живет" } },
                    { id: 4, title: { uk: "Малює план квартири на уроці", ru: "Рисует план квартиры на уроке" } },
                    { id: 5, title: { uk: "Відео-екскурсія квартирою для родички", ru: "Видео-экскурсия по квартире для родственницы" } }
                ],
                mistake_or_joke: "Хочеш дізнатися хитрість? Найкращий спосіб запам'ятати слово — сказати його вголос тричі. Спробуємо?"
            },
            3: {
                topic: "Речі вдома",
                is_safety: false,
                hint: {
                    uk: "«Kde» — питальне слово «де», буде зустрічатися часто.",
                    ru: "«Kde» — вопросительное слово «где», будет встречаться часто."
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
                        intro: "Nemôžem nájsť svoju hračку."
                    }
                },
                scenarios: [
                    { id: 1, title_icon: "🧸", title: { uk: "Шукає іграшку вдома", ru: "Ищет игрушку дома" } },
                    { id: 2, title_icon: "🔍", title: { uk: "Питає, де річ у гостях", ru: "Спрашивает, где вещь в гостях" } },
                    { id: 3, title_icon: "👶", title: { uk: "Допомагає молодшому братику знайти річ", ru: "Помогает младшему брату найти вещь" } },
                    { id: 4, title_icon: "📖", title: { uk: "Питає вчительку, де його зошит", ru: "Спрашивает учительницу, где его тетрадь" } },
                    { id: 5, title_icon: "🙈", title: { uk: "Гра «хованки» з предметами по-словацьки", ru: "Игра «прятки» с предметами по-словацки" } }
                ],
                mistake_or_joke: "А знаєш, чому мені подобається вчити тебе словацької? Бо разом веселіше, навіть коли помиляємось!"
            },
            4: {
                topic: "🛡️ Безпека: особисті дані",
                is_safety: true,
                hint: {
                    uk: "Свою адресу можна казати тільки дорослим, яких добре знаєш.",
                    ru: "Свой адрес можно говорить только взрослым, которых хорошо знаешь."
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
                        intro: "Svoju adresu hovorím len rodičom alebo učiteľom, ktorých познам."
                    }
                },
                scenarios: [
                    { id: 1, title_icon: "🚶", title: { uk: "Незнайомець на вулиці питає адресу", ru: "Незнакомец на улице спрашивает адрес" } },
                    { id: 2, title_icon: "📞", title: { uk: "Дзвінок з невідомого номера питає, де живеш", ru: "Звонок с неизвестного номера спрашивает, где живешь" } },
                    { id: 3, title_icon: "🎮", title: { uk: "Онлайн-гра просить вказати адресу", ru: "Онлайн-игра просит указать адрес" } },
                    { id: 4, title_icon: "💻", title: { uk: "Новий друг в інтернеті просить адресу", ru: "Новый «друг» в интернете просит адрес" } },
                    { id: 5, title_icon: "🛡️", title: { uk: "Комплексна рольова гра — коли адресу казати можна, а коли ні", ru: "Комплексная ролевая игра — когда адрес говорить можно, а когда нет" } }
                ],
                mistake_or_joke: null
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
            1: { topic: "Емоції", phrase: "Som šťastný. Som smutný.", is_safety: false, hint: "Šťastný/smutný — емоції." },
            2: { topic: "Дружба", phrase: "Chceš sa so mnou hraть?", is_safety: false, hint: "Просте запитання для нової дружби." },
            3: { topic: "Онлайн-спілкування", phrase: "To je moja kamarátka z internetu", is_safety: false, hint: "Інтернет-друзі мають бути безпечними." },
            4: { topic: "🛡️ Безпека: приватність онлайн", phrase: "Nepíšem cudzím ľuďom na internete svoju adresu ani школу", is_safety: true, hint: "Нікому не кажи особисті дані онлайн." }
        }
    },
    10: {
        theme: "Свята та культура Словаччини",
        weeks: {
            1: { topic: "Словацькі традиції", phrase: "Toto je slovenský sviatok.", is_safety: false, hint: "«Sviatok» — свято." },
            2: { topic: "Пісні та ігри", phrase: "Zaspievajme spolu pieseň!", is_safety: false, hint: "Пісні допомагають вивчити мову." },
            3: { topic: "Свято в місті", phrase: "Kde sa stretneme po programe?", is_safety: false, hint: "Домовляйся про зустріч заздалегідь." },
            4: { topic: "🛡️ Безпека: натовп на святі", phrase: "Na sviatku vždy viem, kde sú mama a otec", is_safety: true, hint: "Тримайся ближче до батьків." }
        }
    },
    11: {
        theme: "Природа, тварини, прогулянки",
        weeks: {
            1: { topic: "Тварини та природа", phrase: "Pozri, aké krásne zvieratko!", is_safety: false, hint: "«Zvieratko» — тваринка." },
            2: { topic: "Прогулянка в парку/лісі", phrase: "Ideme na prechádzku do lesa.", is_safety: false, hint: "«Les» — ліс." },
            3: { topic: "Пікнік", phrase: "Sadneme si tu a najeme sa.", is_safety: false, hint: "Практикуй слова про їжу." },
            4: { topic: "🛡️ Безпека: екстрені виклики", phrase: "Číslo 112 zachraňuje. Viem, ako ho vytočiť", is_safety: true, hint: "112 — екстрений виклик у Європі." }
        }
    },
    12: {
        theme: "Підсумковий: „Я вже самостійний\"",
        weeks: {
            1: { topic: "Повторення: привітання і знайомство", phrase: "Dobrý deň, ako sa máš?", is_safety: false, hint: "Повторення перших тем." },
            2: { topic: "Повторення: місто, магазин, гроші", phrase: "Koľko to stojí?", is_safety: false, hint: "Покупки та розрахунки." },
            3: { topic: "Повторення: почуття та безпека", phrase: "Moje telo patrí len mne.", is_safety: false, hint: "Повторення правил тілесної безпеки." },
            4: { topic: "🏆 Фінальний сценарій", phrase: "Stratil som sa. Pomôžete mi?", is_safety: true, hint: "Повний підсумковий іспит безпеки!" }
        }
    }
};

// Global function to get active week's lesson data
function getLessonData(m, w) {
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
        const data = getLessonData(currentMonth, currentWeek);
        if (!data) return null;
        const trackData = data.tracks[currentTrack];
        const sc = data.scenarios[idx - 1];
        if (!sc) return null;

        return {
            title: { uk: sc.title.uk, ru: sc.title.ru },
            title_icon: sc.title_icon || prop,
            desc: {
                uk: `Завдання: ${sc.title.uk}. Повтори: "${trackData.phrase}"`,
                ru: `Задание: ${sc.title.ru}. Повтори: "${trackData.phrase}"`
            },
            phrase: trackData.phrase,
            words: trackData.words,
            tip: { uk: data.hint.uk, ru: data.hint.ru },
            phoneticTip: {
                uk: `Будь уважним! Спробуй вимовити чіткіше словацькі звуки. Зверни увагу на '${trackData.words[0]}'`,
                ru: `Будь внимателен! Попробуй произнести четче словацкие звуки. Обрати внимание на '${trackData.words[0]}'`
            },
            audioCorrection: trackData.words[0].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"")
        };
    }
});

// Tutor configuration - only Oksana is active now
const avatarConfig = {
    human: {
        name: { uk: "Оксана (Oksana)", ru: "Оксана (Oksana)" },
        icon: "👩",
        greet: {
            uk: "Вітаю! Мене звати Оксана. Давай разом вивчати словацькі слова та правила безпеки!",
            ru: "Приветствую! Меня зовут Оксана. Давай вместе изучать словацкие слова и правила безопасности!"
        },
        greetSk: "Ahoj! Volám sa Oksana. Poďme sa spolu učiť slovenské slovíčka a bezpečnostné pravidlá!"
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
        task_desc: "Повтори фразу",
        target_phrase: "Потрібно вимовити:",
        tip_title: "Підказка від Оксани:",
        tip_content_default: "Слухай та повторюй словацькі слова разом зі мною.",
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
        task_desc: "Повтори фразу",
        target_phrase: "Нужно произнести:",
        tip_title: "Подсказка от Оксаны:",
        tip_content_default: "Слушай и повторяй словацкие слова вместе со мной.",
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

function getMonthWordsForTrack(month, track) {
    const data = curriculumCatalog[month];
    if (!data || !data.weeks) return [];
    let words = [];
    for (const w in data.weeks) {
        const weekData = data.weeks[w];
        if (weekData.tracks && weekData.tracks[track]) {
            words = words.concat(weekData.tracks[track].words);
        }
    }
    return [...new Set(words)]; // unique words
}

function getSystemPrompt() {
    const monthWords = getMonthWordsForTrack(currentMonth, currentTrack);
    const wordsList = monthWords.join(', ');
    const name = avatarConfig[currentCharacter] ? avatarConfig[currentCharacter].name[currentLang] : 'Оксана (Oksana)';
    
    let trackDesc = '';
    if (currentTrack === 'junior') {
        trackDesc = "The child is 6-8 years old. Use extremely simple sentences, very basic grammar, and child-friendly tone.";
    } else if (currentTrack === 'middle') {
        trackDesc = "The child is 9-11 years old. Use simple sentences and friendly encouraging tone.";
    } else {
        trackDesc = "The child is 12-14 years old. You can use standard beginner Slovak but keep it simple.";
    }

    return `You are a friendly Slovak language teacher for Ukrainian children.
Your name is ${name}.
${trackDesc}
Speak simple Slovak, guide the child in learning. Mend errors gently.
IMPORTANT: You MUST limit your vocabulary and grammar to the level of the current month. Here is the list of Slovak words the child has learned or is learning this month: [${wordsList}]. Try to use mainly these words or very simple variations of them.
At the end of your message, add a translation of complex Slovak words in parentheses in Ukrainian.
Keep replies short (1-2 sentences).
SAFETY CRITICAL: Do NOT discuss any topics outside language learning and child education. Strictly forbid any unsafe, sensitive, or inappropriate content for children under 14. Keep the tone warm, patient, and encouraging.`;
}

function determineReplyTone(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes("výborne") || lower.includes("skvelé") || lower.includes("super") || lower.includes("dobre") || lower.includes("perfektné") || lower.includes("pekné") || lower.includes("gratulujem")) {
        return 'success';
    }
    if (lower.includes("fíha") || lower.includes("naozaj") || lower.includes("wau") || lower.includes("vau") || lower.includes("zaujímavé")) {
        return 'surprise';
    }
    if (lower.includes("skús") || lower.includes("prepáč") || lower.includes("skúsiť") || lower.includes("oprav") || lower.includes("nevadí")) {
        return 'retry';
    }
    if (lower.includes("smiech") || lower.includes("hah") || lower.includes("hravé") || lower.includes("hrať")) {
        return 'laugh';
    }
    if (lower.includes("ahoj") || lower.includes("dobrý deň") || lower.includes("vitaj")) {
        return 'greeting';
    }
    if (lower.includes("dovidenia") || lower.includes("maj sa") || lower.includes("ahojте")) {
        return 'farewell';
    }
    return 'idle';
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input-field');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    appendChatBubble('user', text);
    
    const typing = showTypingIndicator();
    updateAvatarState('thinking');
    
    const systemPrompt = getSystemPrompt();
    
    // 1. Try server-side chat proxy first
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ systemPrompt, text })
        });
        
        if (response.ok) {
            removeTypingIndicator(typing);
            const data = await response.json();
            const reply = data.reply;
            appendChatBubble('tutor', reply);
            speakSlovak(reply.replace(/\(.*?\)/g, ''));
            
            const tone = determineReplyTone(reply);
            updateAvatarState(tone);
            
            // Return to idle after speaking
            const speakingDuration = Math.min(Math.max(reply.length * 60, 3000), 8000);
            setTimeout(() => {
                updateAvatarState('idle');
            }, speakingDuration);
            return;
        }
    } catch (e) {
        console.warn("Server-side chat proxy /api/chat failed, falling back to client-side requests:", e);
    }
    
    // 2. Client-side fallback if server-side is not available or failed
    const keys = await loadEnv();
    if (keys && keys.ANTHROPIC_API_KEY) {
        // Fallback Client-side Anthropic call (using a CORS proxy or direct call if allowed)
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': keys.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'dangerously-allow-html-user-aspect-ratio': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 150,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: text }
                    ]
                })
            });
            
            removeTypingIndicator(typing);
            if (response.ok) {
                const data = await response.json();
                const reply = data.content && data.content[0] ? data.content[0].text : '';
                appendChatBubble('tutor', reply);
                speakSlovak(reply.replace(/\(.*?\)/g, ''));
                
                const tone = determineReplyTone(reply);
                updateAvatarState(tone);
                
                const speakingDuration = Math.min(Math.max(reply.length * 60, 3000), 8000);
                setTimeout(() => {
                    updateAvatarState('idle');
                }, speakingDuration);
                return;
            }
        } catch (e) {
            console.error("Client-side Anthropic fallback failed:", e);
        }
    }
    
    if (keys && keys.OPENAI_API_KEY) {
        // Fallback Client-side OpenAI call
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${keys.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ],
                    max_tokens: 150
                })
            });
            
            removeTypingIndicator(typing);
            if (response.ok) {
                const data = await response.json();
                const reply = data.choices[0].message.content;
                appendChatBubble('tutor', reply);
                speakSlovak(reply.replace(/\(.*?\)/g, ''));
                
                const tone = determineReplyTone(reply);
                updateAvatarState(tone);
                
                const speakingDuration = Math.min(Math.max(reply.length * 60, 3000), 8000);
                setTimeout(() => {
                    updateAvatarState('idle');
                }, speakingDuration);
                return;
            }
        } catch (e) {
            console.error("Client-side OpenAI fallback failed:", e);
        }
    }
    
    // Fully offline / fallback mock response
    removeTypingIndicator(typing);
    const reply = "Ahoj! Ja som tvoj slovenský kamarát. Poďme sa spolu učiť! (Привіт! Я твій словацький друг. Давай разом вчитися!)";
    appendChatBubble('tutor', reply);
    speakSlovak("Ahoj! Ja som tvoj slovenský kamarát. Poďme sa spolu učiť!");
    updateAvatarState('greeting');
    setTimeout(() => {
        updateAvatarState('idle');
    }, 4000);
}

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
    if (num !== 1) {
        if (!isRegistered) {
            document.getElementById('registration-modal').classList.remove('hidden');
            return;
        }
        if (!isSubscriptionActive() && !childAuthenticated) {
            document.getElementById('sub-expired-lock-modal').classList.remove('hidden');
            return;
        }
    }

    if (num !== 1 && !completedScenarios.includes(num - 1)) {
        alert(currentLang === 'uk' ? "Цей сценарій ще заблоковано! Пройди попередній." : "Этот сценарий еще заблокирован! Пройди предыдущий.");
        return;
    }
    currentScenario = num;
    attemptCount = 0;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`scenario-btn-${i}`);
        if (btn) btn.classList.toggle('active', i === num);
    }
    handleUserInteraction();
    updateScenarioUI();
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

    const sc = scenarios[currentScenario];
    document.getElementById('current-task-desc').innerText = sc.desc[currentLang];
    const titleEl = document.querySelector('.controls-panel h2');
    if (titleEl) titleEl.innerText = sc.title[currentLang];
    
    const phraseContainer = document.getElementById('phrase-phoneme-container');
    phraseContainer.innerHTML = '';
    sc.words.forEach(w => {
        const span = document.createElement('span');
        span.className = 'phoneme-word';
        span.innerText = w;
        phraseContainer.appendChild(span);
    });
    
    document.getElementById('pronunciation-tip-text').innerText = sc.tip[currentLang];
    document.getElementById('speech-feedback-card').classList.add('hidden');
    
    if (initialLoadDone && firstActionTriggered) {
        updateAvatarState('level_' + currentScenario);
    }
    
    // Dynamically update the emoji/label on scenario buttons
    updateScenarioButtonsContent();
}

function updateScenarioButtonsContent() {
    const data = getLessonData(currentMonth, currentWeek);
    if (!data) return;
    
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`scenario-btn-${i}`);
        if (!btn) continue;
        
        const sc = data.scenarios[i - 1];
        const isLocked = i !== 1 && !completedScenarios.includes(i - 1);

        if (currentTrack === 'junior') {
            let iconHtml = sc && sc.title_icon ? sc.title_icon : i;
            if (iconHtml === "🛝" || !iconHtml || iconHtml === "1") {
                iconHtml = '<i class="fa-solid fa-child-reaching"></i>';
            }
            if (isLocked) {
                btn.innerHTML = `${iconHtml}<i class="fa-solid fa-lock scenario-lock-badge"></i>`;
            } else {
                btn.innerHTML = iconHtml;
            }
            btn.style.fontSize = '20px';
        } else {
            btn.innerHTML = isLocked ? `${i}<i class="fa-solid fa-lock scenario-lock-badge"></i>` : i;
            btn.style.fontSize = '16px';
        }

        btn.classList.toggle('disabled', isLocked);
        if (isLocked) {
            btn.title = currentLang === 'uk' ? 'Сценарій заблоковано. Пройди попередній!' : 'Сценарий заблокирован. Пройди предыдущий!';
        } else {
            btn.title = sc ? sc.title[currentLang] : '';
        }
    }
}

function getSafetyPhrasesMasteredCount() {
    let count = 0;
    for (let m = 1; m <= currentMonth; m++) {
        const maxW = (m === currentMonth) ? currentWeek : 4;
        for (let w = 1; w <= maxW; w++) {
            const weekData = getLessonData(m, w);
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
        localStorage.setItem(completedScenariosKey, JSON.stringify(completedScenarios));
    }
    
    // Set scenario_1_4_completed flag if 1, 2, 3, 4 are completed
    const sc1_4_completed = [1, 2, 3, 4].every(x => completedScenarios.includes(x));
    localStorage.setItem('slovahoj_kids_scenario_1_4_completed', sc1_4_completed ? 'true' : 'false');
    
    syncMilestonesUI();
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
        const vocabCount = completedCount * 12 + 6;
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
    const keys = await loadEnv();
    if (!keys || !keys.AZURE_SPEECH_KEY || !keys.AZURE_SPEECH_REGION) {
        console.warn("Azure Speech credentials missing. Falling back to Browser WebSpeech.");
        return false;
    }

    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(keys.AZURE_SPEECH_KEY, keys.AZURE_SPEECH_REGION);
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
    if (!handleUserInteraction()) {
        return;
    }
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
        
        const targetPhrase = scenarios[currentScenario].phrase;
        
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

        document.getElementById('pronunciation-tip-text').innerHTML = scenarios[currentScenario].tip[currentLang];

        unlockMilestone(currentScenario);
        advanceLessonProgress();

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

        appendChatBubble('tutor', `Výborne! Veľmi dobre. (${currentLang === 'uk' ? 'Чудово! Дуже добре.' : 'Отлично! Очень хорошо.'})`);

        checkLevelProgress();

        if (currentScenario === 1) {
            startDropdownSequence();
        }

        if (!isSubscriptionActive() && !childAuthenticated && currentScenario === 1) {
            tutorTrialPassed[currentCharacter] = true;
            saveTutorTrials();
            setTimeout(() => {
                showPostTrialModal();
            }, 1800);
        }
    } else if (score >= 60) {
        // TIER 2: Score 60-84 (Medium quality -> reaction_soft_correction.mp4)
        headline.innerHTML = currentLang === 'uk' ? 'Майже вийшло!' : 'Почти получилось!';
        headline.className = 'warning-text';
        subtext.innerHTML = currentLang === 'uk' 
            ? 'Майже, спробуй ще раз! Зверни увагу на виділені помаранчевим слова.' 
            : 'Почти получилось, попробуй еще раз! Обрати внимание на выделенные оранжевым слова.';

        document.getElementById('pronunciation-tip-text').innerHTML = scenarios[currentScenario].phoneticTip[currentLang];

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

        document.getElementById('pronunciation-tip-text').innerHTML = scenarios[currentScenario].phoneticTip[currentLang];

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

function bindVideoStateHandlers() {
    const video = document.getElementById('heygen-video');
    if (!video) return;

    const handleClipEnd = () => {
        const currentState = video.getAttribute('data-state');
        console.log("Video clip finished playing. Current state:", currentState);
        if (currentState === 'greeting' || currentState === 'greet') {
            if (typeof triggerFirstActionIfNeeded === 'function') {
                triggerFirstActionIfNeeded();
            }
        }
        if (currentState !== 'idle') {
            updateAvatarState('idle');
        }
    };

    video.onended = handleClipEnd;

    if (!video.dataset.eventsBound) {
        video.dataset.eventsBound = 'true';
        video.addEventListener('ended', handleClipEnd);
        video.addEventListener('pause', () => {
            if (video.ended && video.getAttribute('data-state') !== 'idle') {
                handleClipEnd();
            }
        });
    }
}

function updateAvatarState(state) {
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

    if (state === 'idle') {
        video.loop = true;
        video.setAttribute('loop', 'true');
    } else {
        video.loop = false;
        video.removeAttribute('loop');
    }
    
    const absoluteUrl = new URL(VIDEO_BASE_URL + videoFile, window.location.href).href;
    
    if (video.src !== absoluteUrl) {
        video.src = absoluteUrl;
    }
    video.classList.remove('hidden');
    fallback.classList.add('hidden');
    
    try {
        const playPromise = video.play();
        if (playPromise !== undefined && typeof playPromise.then === 'function') {
            return playPromise.then(() => {
                return true;
            }).catch(err => {
                console.warn("Pre-recorded video play failed or not found, falling back to idle or static avatar.", err);
                if (state !== 'idle') {
                    video.src = new URL(VIDEO_BASE_URL + 'reaction_idle.mp4', window.location.href).href;
                    video.loop = true;
                    video.play().catch(() => {
                        video.classList.add('hidden');
                        fallback.classList.remove('hidden');
                    });
                } else {
                    video.classList.add('hidden');
                    fallback.classList.remove('hidden');
                }
                return false;
            });
        } else {
            return Promise.resolve(true);
        }
    } catch (e) {
        console.warn("video.play() synchronous exception caught:", e);
        if (state !== 'idle') {
            video.src = new URL(VIDEO_BASE_URL + 'reaction_idle.mp4', window.location.href).href;
            video.loop = true;
            video.play().catch(() => {
                video.classList.add('hidden');
                fallback.classList.remove('hidden');
            });
        } else {
            video.classList.add('hidden');
            fallback.classList.remove('hidden');
        }
        return Promise.resolve(false);
    }
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

function processPayment() {
    const holder = document.getElementById('card-holder').value.trim();
    const number = document.getElementById('card-number').value.replace(/\s/g, '');
    const expiry = document.getElementById('card-expiry').value.trim();
    const cvv = document.getElementById('card-cvv').value.trim();
    const submitBtn = document.getElementById('btn-submit-payment');
    
    if (!holder || number.length < 16 || expiry.length < 5 || cvv.length < 3) {
        document.getElementById('payment-error').classList.remove('hidden');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerText = currentLang === 'uk' ? 'Обробка...' : 'Обработка...';
    
    setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerText = currentLang === 'uk' ? 'Сплатити' : 'Оплатить';
        
        // Mock check
        if (number.startsWith('4') || number.startsWith('5')) {
            // Success
            document.getElementById('payment-main-form').classList.add('hidden');
            document.getElementById('payment-modal-footer').classList.add('hidden');
            document.getElementById('payment-success-screen').classList.remove('hidden');
            
            // Set paid subscription state (Preserves child's progress!)
            subscriptionStart = Date.now();
            let periodDays = 30;
            if (currentPaymentPlanName.includes('3')) periodDays = 90;
            else if (currentPaymentPlanName.includes('6')) periodDays = 180;
            subscriptionEnd = subscriptionStart + (periodDays * 24 * 60 * 60 * 1000);
            
            if (currentPaymentPlanName.includes('Преміум') || currentPaymentPlanName.includes('Premium') || currentPaymentPlanName.includes('Премиум')) {
                subscriptionType = 'premium';
            } else {
                subscriptionType = 'paid';
            }
            saveSubState();
            
            // Clean lock screens
            document.getElementById('sub-expired-lock-modal').classList.add('hidden');
            document.getElementById('parent-expiry-modal').classList.add('hidden');
 
            // Activate subscription banner
            const banner = document.getElementById('subscription-status-banner');
            banner.querySelector('.sub-title').setAttribute('data-i18n', 'sub_active_title');
            banner.querySelector('.sub-title').innerText = currentLang === 'uk' ? 'Ваша підписка активна!' : 'Ваша подписка активна!';
            
            const expDate = new Date(subscriptionEnd);
            const expString = `${expDate.getDate()}.${expDate.getMonth()+1}.${expDate.getFullYear()}`;
            banner.querySelector('.sub-details').innerText = currentLang === 'uk'
                ? `Тарифний план: ${currentPaymentPlanName}. Дійсний до ${expString}.`
                : `Тарифный план: ${currentPaymentPlanName}. Действителен до ${expString}.`;
            banner.classList.remove('hidden');
        } else {
            // Error
            document.getElementById('payment-error').classList.remove('hidden');
        }
    }, 1200);
}

function startFreeTrial() {
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

    // Update UI components
    updateAuthHeaderUI();
    renderScenarioSelector();
 
    // Activate subscription status banner in Parent Cabinet
    const banner = document.getElementById('subscription-status-banner');
    if (banner) {
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
                ? `Пробний доступ активовано. Дійсний до ${expString}. Всі 60 сценаріїв та уроки словацької відкрито!`
                : `Пробный доступ активирован. Действителен до ${expString}. Все 60 сценариев и уроки словацкого открыты!`;
        }
        banner.classList.remove('hidden');
    }
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

    if (email === ADMIN_PIN) {
        currentUserEmail = "admin@test.com";
        isRegistered = true;
        parentPin = "999999";
        childPin = "1111";
        subscriptionType = "premium";
        subscriptionStart = Date.now();
        subscriptionEnd = subscriptionStart + (365 * 24 * 60 * 60 * 1000); // 1 year active
        currentTrack = 'middle';
        saveSubState();
        
        closeRegistrationModal();
        setParentVerified(true);
        switchView('cabinet');
        checkCabinetExpiryAlert();
        updateAuthHeaderUI();
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const age = parseInt(ageVal);
    
    if (!email || !emailRegex.test(email) || isNaN(age) || age < 6 || age > 14) {
        document.getElementById('reg-error').classList.remove('hidden');
        return;
    }
    document.getElementById('reg-error').classList.add('hidden');
    
    currentUserEmail = email;
    isRegistered = true;
    childPin = generateRandomPin(4);
    parentPin = generateRandomPin(6);
    
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
    
    saveSubState();
    selectTrack(currentTrack);
    
    document.getElementById('reg-child-pin').innerText = childPin;
    document.getElementById('reg-parent-pin').innerText = parentPin;
    document.getElementById('reg-success-details').classList.remove('hidden');
    
    document.getElementById('reg-modal-footer').classList.add('hidden');
    document.getElementById('reg-modal-footer-success').classList.remove('hidden');
    
    updateAuthHeaderUI();
    console.log(`Registered successfully. Parent: ${parentName}, Email: ${email}, Child PIN: ${childPin}, Parent PIN: ${parentPin}`);
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
    if (pin === ADMIN_PIN || (pin === childPin && isSubscriptionActive())) {
        childAuthenticated = true;
        sessionStorage.setItem('slovahoj_kids_child_authenticated', 'true');
        document.getElementById('child-gate-pin-error').classList.add('hidden');
        closePostTrialModal();
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
    if (pin === ADMIN_PIN || (pin === childPin && isSubscriptionActive())) {
        childAuthenticated = true;
        sessionStorage.setItem('slovahoj_kids_child_authenticated', 'true');
        document.getElementById('expired-child-pin-error').classList.add('hidden');
        document.getElementById('sub-expired-lock-modal').classList.add('hidden');
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
        // If not registered yet, or if state is corrupted (e.g. no parent PIN), direct to registration
        if (!isRegistered || !parentPin) {
            document.getElementById('registration-modal').classList.remove('hidden');
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

    if (inputPin === ADMIN_PIN || inputPin === parentPin) {
        setParentVerified(true);
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

function closeParentExpiryModal() {
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



// --- Payment & Subscription Simulator ---
let currentPaymentAmount = 0;
let currentPaymentPlanName = '';

function openPaymentModal(amount, planName) {
    currentPaymentAmount = amount;
    currentPaymentPlanName = planName;
    
    // Update UI
    document.getElementById('payment-plan-name').innerText = planName;
    document.getElementById('card-holder').value = '';
    document.getElementById('card-number').value = '';
    document.getElementById('card-expiry').value = '';
    document.getElementById('card-cvv').value = '';
    document.getElementById('payment-error').classList.add('hidden');
    
    // Show form and hide success screen in modal
    document.getElementById('payment-main-form').classList.remove('hidden');
    document.getElementById('payment-success-screen').classList.add('hidden');
    document.getElementById('payment-modal-footer').classList.remove('hidden');
    
    // Show modal
    document.getElementById('payment-modal').classList.remove('hidden');
}

function closePaymentModal() {
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
    if (!keys || !keys.AZURE_SPEECH_KEY || !keys.AZURE_SPEECH_REGION) {
        console.warn("Azure Speech credentials missing for TTS. Falling back to browser SpeechSynthesis.");
        speakSlovakBrowser(text);
        return;
    }

    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(keys.AZURE_SPEECH_KEY, keys.AZURE_SPEECH_REGION);
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
    
    if (currentMonth > maxUnlockedMonth) {
        currentMonth = maxUnlockedMonth;
        document.getElementById('month-select').value = currentMonth;
        alert(currentLang === 'uk' ? "Цей місяць заблокований. Пройди попередні уроки!" : "Этот месяц заблокирован. Пройди предыдущие уроки!");
        return;
    }

    if (currentMonth === maxUnlockedMonth && currentWeek > maxUnlockedWeek) {
        currentWeek = maxUnlockedWeek;
    }
    if (currentMonth === maxUnlockedMonth && currentWeek === maxUnlockedWeek && currentLessonDay > maxUnlockedDay) {
        currentLessonDay = maxUnlockedDay;
    }

    updateDropdownLockState();
    updateScenarioUI();

    const monthSelect = document.getElementById('month-select');
    const weekSelect = document.getElementById('week-select');

    if (dropdownSeqStep > 0) {
        if (monthSelect) {
            monthSelect.classList.remove('blinking-dropdown');
            monthSelect.classList.add('selected-dropdown-green');
        }
        dropdownSeqStep = 2;
        if (weekSelect) {
            weekSelect.classList.add('blinking-dropdown');
        }
    }
}

function changeWeek(value) {
    firstActionTriggered = true;
    currentWeek = parseInt(value);

    if (currentMonth === maxUnlockedMonth && currentWeek > maxUnlockedWeek) {
        currentWeek = maxUnlockedWeek;
        document.getElementById('week-select').value = currentWeek;
        alert(currentLang === 'uk' ? "Цей тиждень заблокований. Пройди попередні уроки!" : "Эта неделя заблокирована. Пройди предыдущие уроки!");
        return;
    }

    if (currentMonth === maxUnlockedMonth && currentWeek === maxUnlockedWeek && currentLessonDay > maxUnlockedDay) {
        currentLessonDay = maxUnlockedDay;
    }

    updateDropdownLockState();
    updateScenarioUI();

    const weekSelect = document.getElementById('week-select');
    const lessonSelect = document.getElementById('lesson-select');

    if (dropdownSeqStep > 0) {
        if (weekSelect) {
            weekSelect.classList.remove('blinking-dropdown');
            weekSelect.classList.add('selected-dropdown-green');
        }
        dropdownSeqStep = 3;
        if (lessonSelect) {
            lessonSelect.classList.add('blinking-dropdown');
        }
    }
}

function selectLessonDay(day) {
    firstActionTriggered = true;
    currentLessonDay = parseInt(day);

    if (currentMonth === maxUnlockedMonth && currentWeek === maxUnlockedWeek && currentLessonDay > maxUnlockedDay) {
        currentLessonDay = maxUnlockedDay;
        document.getElementById('lesson-select').value = currentLessonDay;
        alert(currentLang === 'uk' ? "Це заняття заблоковане. Пройди попередні уроки!" : "Это занятие заблокировано. Пройди предыдущие уроки!");
        return;
    }

    updateDropdownLockState();
    updateScenarioUI();

    const lessonSelect = document.getElementById('lesson-select');
    const confirmBtn = document.getElementById('btn-confirm-lesson');

    if (dropdownSeqStep > 0) {
        if (lessonSelect) {
            lessonSelect.classList.remove('blinking-dropdown');
            lessonSelect.classList.add('selected-dropdown-green');
        }
        dropdownSeqStep = 4;
        if (confirmBtn) {
            confirmBtn.classList.add('blinking-btn');
        }
    }
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

function deleteGDPRProfile() {
    const confirmMsg = currentLang === 'uk' 
        ? "Ви впевнені, що хочете назавжди видалити цей профіль дитини? Всі дані про прогрес будуть стерті відповідно до регламенту GDPR."
        : "Вы уверены, что хотите навсегда удалить этот профиль ребенка? Все данные о прогрессе будут стерты в соответствии с регламентом GDPR.";
    
    if (confirm(confirmMsg)) {
        currentUserEmail = null;
        parentPin = null;
        childPin = null;
        isRegistered = false;
        subscriptionType = 'none';
        subscriptionStart = 0;
        subscriptionEnd = 0;
        completedScenarios = [1];
        currentMonth = 1;
        currentWeek = 1;
        currentTrack = 'junior';
        
        saveSubState();
        localStorage.removeItem(completedScenariosKey);
        localStorage.removeItem('slovahoj_parent_schedule');
        localStorage.removeItem('slovahoj_last_triggered_reminder');
        
        const successMsg = currentLang === 'uk'
            ? "Профіль успішно видалено. Всі дані повністю стерті."
            : "Профиль успешно удален. Все данные полностью стерты.";
        alert(successMsg);
        location.reload();
    }
}

// Init App
window.addEventListener('DOMContentLoaded', async () => {
    // Load env keys
    await loadEnv();
    
    // Setup default voices
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
    }
    
    // Check access controls on load
    checkAccessRules();

    // Initialize UI
    syncMilestonesUI();
    updateScenarioButtonsVisibility();
    updateScenarioUI();
    updateCharacterLevelImage();
    
    // Load schedule configurations
    loadParentScheduleUI();
    
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
    
    // Auto-propose lesson according to progress on each visit
    currentMonth = maxUnlockedMonth;
    currentWeek = maxUnlockedWeek;
    currentLessonDay = maxUnlockedDay;
    updateDropdownLockState();

    // Reset badge state on load so click-me is visible
    greetingPlayed = false;
    firstActionTriggered = false;
    const clickBadge = document.getElementById('click-me-badge');
    if (clickBadge) clickBadge.classList.remove('hidden');
    
    // Start parent schedule verification checker (runs every 30 seconds)
    setInterval(checkLessonSchedule, 30000);
    
    // Apply translations and update chat greeting on initial load
    switchLanguage(currentLang);
});
