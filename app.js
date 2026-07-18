// 1. App State & Configurations
let currentLang = 'uk';
let currentCharacter = 'wolf';
let isRecording = false;
let recordTimer = null;
let progressChart = null;
let parentVerified = sessionStorage.getItem('slovahoj_kids_parent_verified') === 'true'; // Flag for parent cabinet authorization

function setParentVerified(val) {
    parentVerified = val;
    sessionStorage.setItem('slovahoj_kids_parent_verified', val ? 'true' : 'false');
}

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

// NEW State Variables for PIN Access, Registrations, and Subscription tracking
const tutorTrialPassedKey = 'slovahoj_kids_tutor_trial_passed';
let tutorTrialPassed = {
    wolf: false,
    fox: false,
    bear: false,
    bunny: false,
    human: false,
    taras: false,
    marijka: false,
    grandfather: false
};
try {
    const stored = localStorage.getItem(tutorTrialPassedKey);
    if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
            tutorTrialPassed = parsed;
        }
    }
} catch (e) {
    console.warn("Error parsing tutorTrialPassed, using default.", e);
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
}

function saveTutorTrials() {
    localStorage.setItem(tutorTrialPassedKey, JSON.stringify(tutorTrialPassed));
}

const scenarios = {
    1: {
        title: {
            uk: "Твоє завдання: Привітайся зі словацьким другом",
            ru: "Твое задание: Поздоровайся со словацким другом"
        },
        desc: {
            uk: "Повтори фразу: \"Dobrý deň, ako sa máš?\"",
            ru: "Повтори фразу: \"Dobrý deň, ako sa máš?\""
        },
        phrase: "Dobrý deň, ako sa máš?",
        words: ["Dobrý", "deň,", "ako", "sa", "máš?"],
        tip: {
            uk: "Словацька буква 'ň' вимовляется м'яко, як українська 'нь'.",
            ru: "Словацкая буква 'ň' произносится мягко, как русская 'нь'."
        },
        phoneticTip: {
            uk: "Звук [ň] вимовляється м'яко. Кінчик язика торкається верхніх зубів. Спробуй ще раз: [де нь]",
            ru: "Звук [ň] произносится мягко. Кончик языка касается верхних зубов. Попробуй еще раз: [де нь]"
        },
        audioCorrection: "deň"
    },
    2: {
        title: {
            uk: "Твоє завдання: Похід у словацький магазин",
            ru: "Твое задание: Поход в словацкий магазин"
        },
        desc: {
            uk: "Попроси яблуко: \"Prosím si jedno jablko.\"",
            ru: "Попроси яблоко: \"Prosím si jedno jablko.\""
        },
        phrase: "Prosím si jedno jablko.",
        words: ["Prosím", "si", "jedno", "jablko."],
        tip: {
            uk: "Зверни увагу на наголос: у словацькій мові він завжди падає на первый склад.",
            ru: "Обрати внимание на ударение: в словацком языке оно всегда падает на первый слог."
        },
        phoneticTip: {
            uk: "Голосна 'o' вимовляється чітко. Спробуй ще раз: [я блу ко]",
            ru: "Гласная 'o' произносится четко. Попробуй еще раз: [я блу ко]"
        },
        audioCorrection: "jablko"
    },
    3: {
        title: {
            uk: "Твоє завдання: Безпечна відмова стороннім",
            ru: "Твое задание: Безопасный отказ посторонним"
        },
        desc: {
            uk: "Скажи незнайомцю: \"Nie, ďakujem, ja vás nepoznám.\"",
            ru: "Скажи незнакомцу: \"Nie, ďakujem, ja vás nepoznám.\""
        },
        phrase: "Nie, ďakujem, ja vás nepoznám.",
        words: ["Nie,", "ďakujem,", "ja", "vás", "nepoznám."],
        tip: {
            uk: "Словацьке 'ď' вимовляється дуже м'яко, схоже на українське 'дь'.",
            ru: "Словацкое 'ď' произносится очень мягко, похоже на русское 'дь'."
        },
        phoneticTip: {
            uk: "Буква 'ď' вимовляється м'яко. Спробуй ще раз: [дьа ку єм]",
            ru: "Буква 'ď' произносится мягко. Попробуй еще раз: [дьа ку ем]"
        },
        audioCorrection: "ďakujem"
    },
    4: {
        title: {
            uk: "Твоє завдання: У словацькій школі / садочку",
            ru: "Твое задание: В словацкой школе / садике"
        },
        desc: {
            uk: "Попроси вийти: \"Môžem ísť na toaletu, prosím?\"",
            ru: "Попроси выйти: \"Môžem ísť na toaletu, prosím?\""
        },
        phrase: "Môžem ísť na toaletu, prosím?",
        words: ["Môžem", "ísť", "na", "toaletu,", "prosím?"],
        tip: {
            uk: "Буква 'ô' вимовляється як дифтонг 'уо'. Спробуй: [муожем].",
            ru: "Буква 'ô' произносится как дифтонг 'уо'. Попробуй: [муожем]."
        },
        phoneticTip: {
            uk: "Звук 'ô' вимовляється як дифтонг 'уо'. Спробуй ще раз: [муо жем]",
            ru: "Звук 'ô' произносится как дифтонг 'уо'. Попробуй еще раз: [муо жем]"
        },
        audioCorrection: "Môžem"
    },
    5: {
        title: {
            uk: "Твоє завдання: Поїздка у громадському транспорті",
            ru: "Твое задание: Поездка в общественном транспорте"
        },
        desc: {
            uk: "Купи квиток: \"Prosím si jeden lístok.\"",
            ru: "Купи билет: \"Prosím si jeden lístok.\""
        },
        phrase: "Prosím si jeden lístok.",
        words: ["Prosím", "si", "jeden", "lístok."],
        tip: {
            uk: "Словацьке 'í' є довгим звуком. Тягни його трохи довше.",
            ru: "Словацкое 'í' является долгим звуком. Тяни его чуть дольше."
        },
        phoneticTip: {
            uk: "Довге 'í' вимовляється протяжно. Спробуй ще раз: [лііс ток]",
            ru: "Долгое 'í' произносится протяжно. Попробуй еще раз: [лиисток]"
        },
        audioCorrection: "lístok"
    }
};

// Env loader utility
async function loadEnv() {
    if (envKeys) return envKeys;
    try {
        let response = await fetch('../.env');
        if (!response.ok) {
            response = await fetch('/api/keys');
        }
        if (!response.ok) return null;
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            envKeys = await response.json();
            console.log("Loaded API Keys from serverless endpoint successfully.");
            return envKeys;
        }

        const text = await response.text();
        const keys = {};
        text.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const index = trimmed.indexOf('=');
            if (index !== -1) {
                const key = trimmed.substring(0, index).trim();
                const value = trimmed.substring(index + 1).trim();
                keys[key] = value;
            }
        });
        envKeys = keys;
        console.log("Loaded API Keys from .env successfully.");
        return keys;
    } catch (e) {
        console.warn("Could not fetch .env file, utilizing simulated backend.", e);
        return null;
    }
}

// Dynamic avatar configurations loaded from config.json mock
const avatarConfig = {
    wolf: {
        avatarId: "bcc3bbee01934ae6adf444c567492753",
        voiceId: "btIY8K0iIypydsjKFUzI",
        name: { uk: "Вовченя (Vĺča)", ru: "Волчонок (Vĺča)" },
        icon: "🐺",
        greet: {
            uk: "Привіт, друже! Я — Вовченя. Будемо грати та вчити словацьку?",
            ru: "Привет, дружище! Я — Волчонок. Будем играть и учить словацкий?"
        },
        greetSk: "Ahoj, kamarát! Ja som Vĺča. Budeme sa hrať a učiť sa slovenčinu?"
    },
    fox: {
        avatarId: "fox_avatar_id_placeholder",
        voiceId: "fox_voice_id_placeholder",
        name: { uk: "Лисеня (Líška)", ru: "Лисёнок (Líška)" },
        icon: "🦊",
        greet: {
            uk: "Привіт! Я хитре Лисеня. Давай вивчати словацьку мову разом!",
            ru: "Привет! Я хитрая Лисичка. Давай учить словацкий язык вместе!"
        },
        greetSk: "Ahoj! Ja som bystrá Líška. Poďme sa spolu učiť slovenčinu!"
    },
    bear: {
        avatarId: "bear_avatar_id_placeholder",
        voiceId: "bear_voice_id_placeholder",
        name: { uk: "Ведмежа (Macko)", ru: "Медвежонок (Macko)" },
        icon: "🐻",
        greet: {
            uk: "Привіт, малюку! Я велике Ведмежа. Хочеш поговорити словацькою?",
            ru: "Привет, малыш! Я большой Медвежонок. Хочешь поговорить по-словацки?"
        },
        greetSk: "Ahoj, drobček! Ja som veľký Macko. Chceš sa rozprávaть po slovensky?"
    },
    bunny: {
        avatarId: "bunny_avatar_id_placeholder",
        voiceId: "bunny_voice_id_placeholder",
        name: { uk: "Зайченя (Zajko)", ru: "Зайчонок (Zajko)" },
        icon: "🐰",
        greet: {
            uk: "Привіт! Я прудке Зайченя. Будемо весело стрибати та вчити словацьку?",
            ru: "Привет! Я шустрый Зайчонок. Будем весело прыгать и учить словацкий?"
        },
        greetSk: "Ahoj! Ja som rýchly Zajko. Budeme veselo skákať a učiť sa slovenčinu?"
    },
    human: {
        avatarId: "f08c81c448b14a0a84787e4ef89c0abe",
        voiceId: "Mub7zCyLDpa4L9LfvXCr",
        name: { uk: "Оксана (Oksana)", ru: "Оксана (Oksana)" },
        icon: "👩",
        greet: {
            uk: "Вітаю! Мене звати Оксана. Давай разом вивчати словацькі слова та правила безпеки!",
            ru: "Приветствую! Меня зовут Оксана. Давай вместе изучать словацкие слова и правила безопасности!"
        },
        greetSk: "Ahoj! Volám sa Oksana. Poďme sa spolu učiť slovenské slovíčka a bezpečnostné pravidlá!"
    },
    taras: {
        avatarId: "taras_avatar_id_placeholder",
        voiceId: "taras_voice_id_placeholder",
        name: { uk: "Тарас (Taras)", ru: "Тарас (Taras)" },
        icon: "👦",
        greet: {
            uk: "Привіт! Мене звати Тарас. Я теж вчу словацьку мову, давай дружити!",
            ru: "Привет! Меня зовут Тарас. Я тоже учу словацкий язык, давай дружить!"
        },
        greetSk: "Ahoj! Volám sa Taras. Aj ja sa učím slovenčinu, poďme sa kamarátiť!"
    },
    marijka: {
        avatarId: "marijka_avatar_id_placeholder",
        voiceId: "marijka_voice_id_placeholder",
        name: { uk: "Марійка (Marijka)", ru: "Марийка (Marijka)" },
        icon: "👧",
        greet: {
            uk: "Привіт! Я Марійка. Давай разом грати на словацькому майданчику!",
            ru: "Привет! Я Марийка. Давай вместе играть на словацкой площадке!"
        },
        greetSk: "Ahoj! Ja som Marijka. Poďme sa spolu hrať na slovenskom ihrisku!"
    },
    grandfather: {
        avatarId: "grandfather_avatar_id_placeholder",
        voiceId: "grandfather_voice_id_placeholder",
        name: { uk: "Дідусь (Dedo)", ru: "Дедушка (Dedo)" },
        icon: "👴",
        greet: {
            uk: "Вітаю, дитино! Я дідусь. Я розповім тобі цікаві казки словацькою мовою.",
            ru: "Приветствую, дитя! Я дедушка. Я расскажу тебе интересные сказки на словацком языке."
        },
        greetSk: "Ahoj, dieťa moje! Ja som dedko. Poviem ti zaujímavé rozprávky po slovensky."
    }
};

const translations = {

    uk: {
                select_scenario: "Обери життєвий сценарій:",
                nav_playground: "Ігровий простір",
                nav_parent_cabinet: "Батьківський кабінет",
                select_tutor: "Обери вчителя:",
                group_animals: "Тварини:",
                group_humans: "Люди:",
                soon_label: "скоро буде",
                char_wolf: "Вовченя (Vĺča)",
                char_fox: "Лисеня (Líška)",
                char_bear: "Ведмежа (Macko)",
                char_bunny: "Зайченя (Zajko)",
                char_human: "Оксана (Oksana)",
                char_taras: "Тарас (Taras)",
                char_marijka: "Марійка (Marijka)",
                char_grandfather: "Дідусь (Dedo)",
                ai_assistant_badge: "ІІ-Помічник",
                exercise_title: "Твоє завдання: Привітайся зі словацьким другом",
                task_desc: "Повтори фразу: \"Dobrý deň, ako sa máš?\"",
                target_phrase: "Потрібно вимовити:",
                tip_title: "Підказка від наставника:",
                tip_content_default: "Словацька буква 'ň' вимовляется м'яко, як українська 'нь'.",
                press_mic: "Натисни мікрофон та говори словацькою",
                accuracy_label: "точність",
                feedback_success: "Чудова вимова!",
                feedback_subtext_success: "Ти правильно вимовив усі звуки. Рухаємося далі!",
                feedback_retry: "Майже вийшло!",
                feedback_subtext_retry: "Зверни увагу на виділені червоним слова і спробуй ще раз.",
                cabinet_welcome_title: "Кабінет безпечного контролю: Батьківський дашборд",
                cabinet_welcome_sub: "Тут ви можете бачити статистику прогресу навчання, досягнення дитини та налаштування конфіденційності GDPR.",
                stat_time_spent: "Час на платформі (тиждень)",
                stat_vocab_size: "Вивчено словацьких слів",
                stat_social_milestones: "Рівень адаптації",
                chart_title: "Динаміка занять по днях (хвилини)",
                milestones_title: "Практичні досягнення дитини",
                milestone_1_title: "Знайомство на дитячому майданчику",
                milestone_1_desc: "Дитина вміє представитися, запитати ім'я та запропонувати пограти.",
                milestone_2_title: "Похід у словацький магазин",
                milestone_2_desc: "Дитина може самостійно ввічливо попросити товар та запитати ціну.",
                milestone_3_title: "Безпечна відмова стороннім",
                milestone_3_desc: "Вміння твердо сказати \"Nie, ďakujem\" на пропозицію незнайомця.",
                milestone_4_title: "У словацькій школі / садочку",
                milestone_4_desc: "Розуміння базових команд вчителя, прохання про допомогу чи вихід.",
                milestone_5_title: "Поїздка у громадському транспорті",
                milestone_5_desc: "Спілкування з контролером, купівля та валідація квитка.",
                gdpr_title: "Центр конфіденційності GDPR-K",
                gdpr_sub: "Ми піклуємося про безпеку вашої дитини. Відповідно до регламентів ЄС, записи голосу не зберігаються на наших серверах.",
                btn_export_data: "Експортувати дані прогресу",
                btn_delete_profile: "Видалити профіль дитини",
                footer_legal_text: "Усі права захищені. Платформа відповідає нормам GDPR-K та EU AI Act по роботі з дітьми.",
                chart_days: ["Пн", "Вв", "Ср", "Чт", "Пт", "Сб", "Нд"],

                // Parent Gate & Pricing Translations
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
                feature_1: "Доступ до 8 аватаров",
                feature_2: "Аналіз вимови (Speech API)",
                feature_3: "Родительский контроль",
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
        trial_active_title: "Ваш пробний період активний!",
        trial_success_msg: "Вітаємо! Ви успішно активували безкоштовний пробний доступ на 7 днів."
    },

            ru: {
                select_scenario: "Выбери жизненный сценарий:",
                nav_playground: "Игровое пространство",
                nav_parent_cabinet: "Родительский кабинет",
                select_tutor: "Выбери учителя:",
                group_animals: "Животные:",
                group_humans: "Люди:",
                soon_label: "скоро будет",
                char_wolf: "Волчонок (Vĺča)",
                char_fox: "Лисёнок (Líška)",
                char_bear: "Медвежонок (Macko)",
                char_bunny: "Зайчонок (Zajko)",
                char_human: "Оксана (Oksana)",
                char_taras: "Тарас (Taras)",
                char_marijka: "Марийка (Marijka)",
                char_grandfather: "Дедушка (Dedo)",
                ai_assistant_badge: "ИИ-Помощник",
                exercise_title: "Tвое задание: Поздоровайся со словацким другом",
                task_desc: "Повтори фразу: \"Dobrý deň, ako sa máš?\"",
                target_phrase: "Нужно произнести:",
                tip_title: "Подсказка от наставника:",
                tip_content_default: "Словацкая буква 'ň' произносится мягко, как русская 'нь'.",
                press_mic: "Нажми микрофон и говори по-словацки",
                accuracy_label: "точность",
                feedback_success: "Отличное произношение!",
                feedback_subtext_success: "Ты правильно произнес все звуки. Двигаемся дальше!",
                feedback_retry: "Почти получилось!",
                feedback_subtext_retry: "Обрати внимание на выделенные красным слова и попробуй еще раз.",
                cabinet_welcome_title: "Кабинет безопасного контроля: Родительский дашборд",
                cabinet_welcome_sub: "Здесь вы можете видеть статистику прогресса обучения, достижения ребенка и настройки конфиденциальности GDPR.",
                stat_time_spent: "Время на платформе (неделя)",
                stat_vocab_size: "Изучено словацких слов",
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

                // Parent Gate & Pricing Translations
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
                feature_1: "Доступ к 8 аватарам",
                feature_2: "Анализ произношения (Speech API)",
                feature_3: "Родительский контроль",
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
        trial_active_title: "Ваш пробный период активен!",
        trial_success_msg: "Поздравляем! Вы успешно активировали бесплатный пробный доступ на 7 дней."
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
    if (!isSubscriptionActive() && !childAuthenticated && num !== 1) {
        if (!isRegistered && tutorTrialPassed[currentCharacter]) {
            document.getElementById('post-trial-modal').classList.remove('hidden');
        } else if (isRegistered) {
            document.getElementById('sub-expired-lock-modal').classList.remove('hidden');
        } else {
            alert(currentLang === 'uk' ? "У пробному режимі доступне лише перше завдання." : "В пробном режиме доступно только первое задание.");
        }
        return;
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
    updateScenarioUI();
}

function updateScenarioUI() {
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
    speakSlovak(sc.phrase);
}

function unlockMilestone(num) {
    if (!completedScenarios.includes(num)) {
        completedScenarios.push(num);
        localStorage.setItem(completedScenariosKey, JSON.stringify(completedScenarios));
    }
    syncMilestonesUI();
}

function syncMilestonesUI() {
    const completedCount = completedScenarios.length;
    document.getElementById('stat-social-val').innerHTML = `${completedCount} / 5 етапів`;
    document.getElementById('stat-vocab-val').innerHTML = `${completedCount * 12 + 6} слів`;
    
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
    
    let src = `${currentCharacter}_level_${currentLevel}.png`;
    
    avatarImg.onerror = function() {
        const isAnimal = ['wolf', 'fox', 'bear', 'bunny'].includes(currentCharacter);
        avatarImg.src = isAnimal ? 'wolf_mascot.png' : 'tutor_girl.png';
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
        
        setTimeout(() => {
            const msg = currentLang === 'uk' 
                ? `Вітаємо! Твій наставник виріс до рівня ${currentLevel}!` 
                : `Поздравляем! Твой наставник вырос до уровня ${currentLevel}!`;
            alert(msg);
        }, 1500);
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

async function sendChatMessage() {
    const input = document.getElementById('chat-input-field');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    appendChatBubble('user', text);
    
    const keys = await loadEnv();
    if (keys && keys.OPENAI_API_KEY) {
        const typing = showTypingIndicator();
        try {
            const systemPrompt = `You are a friendly Slovak language teacher for Ukrainian children under 14 years old.
Your name is ${currentCharacter === 'wolf' ? 'Vĺča (Вовченя)' : 'Oksana (Оксана)'}.
Speak simple Slovak, guide the child in learning. Mend errors gently. Use simple vocabulary.
At the end of your message, add a translation of complex Slovak words in parentheses in Ukrainian.
Keep replies short (1-2 sentences).`;

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
            } else {
                appendChatBubble('tutor', "Prepáč, niečo sa pokazilo. (Вибач, щось пішло не так.)");
            }
        } catch (e) {
            removeTypingIndicator(typing);
            appendChatBubble('tutor', "Prepáč, niečo sa pokazilo. (Вибач, щось пішло не так.)");
        }
    } else {
        const typing = showTypingIndicator();
        setTimeout(() => {
            removeTypingIndicator(typing);
            const reply = "Ahoj! Ja som tvoj slovenský kamarát. Poďme sa spolu učiť! (Привіт! Я твій словацький друг. Давай разом вчитися!)";
            appendChatBubble('tutor', reply);
            speakSlovak("Ahoj! Ja som tvoj slovenský kamarát. Poďme sa spolu učiť!");
        }, 1000);
    }
}

// 6. Voice Recording & Pronunciation Evaluation
let recognizer = null;

async function runAzurePronunciationAssessment(targetPhrase, callback) {
    const keys = await loadEnv();
    if (!keys || !keys.AZURE_SPEECH_KEY || !keys.AZURE_SPEECH_REGION) {
        console.warn("Azure Speech credentials missing. Falling back to simulation.");
        return false;
    }

    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(keys.AZURE_SPEECH_KEY, keys.AZURE_SPEECH_REGION);
        speechConfig.speechRecognitionLanguage = "sk-SK";

        // Setup audio config using microphone stream
        const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

        // Create Pronunciation Assessment configuration
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
                if (recognizer) {
                    recognizer.close();
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
        // Start Recording State
        isRecording = true;
        recordBtn.classList.add('recording');
        recordIcon.className = 'fa-solid fa-square';
        statusText.innerHTML = currentLang === 'uk' ? 'Слухаю тебе... говори!' : 'Слушаю тебя... говори!';
        wave.classList.remove('hidden');
        
        const targetPhrase = scenarios[currentScenario].phrase;
        
        // Attempt real Azure speech assessment
        const startedReal = await runAzurePronunciationAssessment(targetPhrase, (result) => {
            handleSpeechResult(result);
        });

        if (!startedReal) {
            // Mock recording timer (Azure Speech API call takes 3 seconds)
            recordTimer = setTimeout(() => {
                stopSpeechRecording();
            }, 3000);
        }
    } else {
        // Force Stop
        if (recognizer) {
            try {
                recognizer.close();
            } catch (e) {}
            recognizer = null;
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

    // Simulate Azure Pronunciation API response for fallback
    setTimeout(() => {
        simulateSpeechResult();
    }, 1000);
}

function simulateSpeechResult() {
    attemptCount++;
    const sc = scenarios[currentScenario];
    
    let result = {};
    if (attemptCount === 1) {
        // Simulation: First attempt is a retry with a specific word error
        result = {
            success: true,
            accuracyScore: 78,
            pronunciationScore: 78,
            words: sc.words.map(w => {
                const clean = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
                const isError = (clean.toLowerCase() === sc.audioCorrection.toLowerCase());
                return {
                    word: w,
                    accuracyScore: isError ? 45 : 95,
                    errorType: isError ? "Mispronunciation" : "None"
                };
            })
        };
    } else {
        // Success attempt
        result = {
            success: true,
            accuracyScore: 96,
            pronunciationScore: 96,
            words: sc.words.map(w => ({
                word: w,
                accuracyScore: 95,
                errorType: "None"
            }))
        };
    }
    handleSpeechResult(result);
}

function handleSpeechResult(result) {
    const feedbackCard = document.getElementById('speech-feedback-card');
    const scoreVal = document.getElementById('pronunciation-score-val');
    const headline = document.getElementById('feedback-headline');
    const subtext = document.getElementById('feedback-subtext');
    const phonemeContainer = document.getElementById('phrase-phoneme-container');
    const statusText = document.getElementById('record-status-text');

    // Reset recording UI just in case
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

    const score = Math.round(result.pronunciationScore || result.accuracyScore);
    scoreVal.innerHTML = `${score}%`;

    const minScoreToPass = 85;
    if (score >= minScoreToPass) {
        // Success
        headline.innerHTML = translations[currentLang].feedback_success;
        headline.className = 'success-text';
        subtext.innerHTML = translations[currentLang].feedback_subtext_success;

        // Reset tip
        document.getElementById('pronunciation-tip-text').innerHTML = scenarios[currentScenario].tip[currentLang];

        // Unlock current milestone
        unlockMilestone(currentScenario);

        // Vocal feedback
        speakSlovak("Výborne! Veľmi dobre.");
        
        appendChatBubble('tutor', `Výborne! Veľmi dobre. (${currentLang === 'uk' ? 'Чудово! Дуже добре.' : 'Отлично! Очень хорошо.'})`);

        // Check level progress
        checkLevelProgress();

        // New trial access rules hook
        if (!isSubscriptionActive() && !childAuthenticated && currentScenario === 1) {
            tutorTrialPassed[currentCharacter] = true;
            saveTutorTrials();
            
            setTimeout(() => {
                showPostTrialModal();
            }, 1800);
        }
    } else {
        // Retry
        headline.innerHTML = translations[currentLang].feedback_retry;
        headline.className = 'retry-text';
        subtext.innerHTML = translations[currentLang].feedback_subtext_retry;

        // Update tip to show phonetic feedback
        document.getElementById('pronunciation-tip-text').innerHTML = scenarios[currentScenario].phoneticTip[currentLang];
            
        // Speak correction
        speakSlovak(scenarios[currentScenario].audioCorrection);
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

// 4.7. HeyGen WebRTC Stream Operations
let peerConnection = null;
let sessionId = null;

async function startHeyGenSession() {
    const keys = await loadEnv();
    if (!keys || !keys.HEYGEN_API_KEY) {
        console.warn("HeyGen credentials missing. Running in fallback mode.");
        return;
    }
    const avatarId = avatarConfig[currentCharacter].avatarId;
    const voiceId = avatarConfig[currentCharacter].voiceId;
    try {
        const response = await fetch('https://api.heygen.com/v1/streaming.create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': keys.HEYGEN_API_KEY
            },
            body: JSON.stringify({
                quality: 'low',
                avatar_id: avatarId,
                voice_id: voiceId
            })
        });
        if (!response.ok) throw new Error("HeyGen session creation failed");
        const data = await response.json();
        const { session_id, sdp, ice_servers } = data.data;
        sessionId = session_id;
        peerConnection = new RTCPeerConnection({
            iceServers: ice_servers.map(server => ({
                urls: server.urls,
                username: server.username,
                credential: server.credential
            }))
        });
        const videoElement = document.getElementById('heygen-video');
        const fallbackElement = document.getElementById('avatar-fallback');
        peerConnection.ontrack = (event) => {
            if (event.track.kind === 'video' && videoElement) {
                videoElement.srcObject = event.streams[0];
                videoElement.classList.remove('hidden');
                fallbackElement.classList.add('hidden');
            }
        };
        await peerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: sdp.sdp
        }));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        const startResponse = await fetch('https://api.heygen.com/v1/streaming.start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': keys.HEYGEN_API_KEY
            },
            body: JSON.stringify({
                session_id: sessionId,
                sdp: {
                    type: 'answer',
                    sdp: answer.sdp
                }
            })
        });
        if (!startResponse.ok) throw new Error("HeyGen session start failed");
        console.log("HeyGen WebRTC session started.");
    } catch (e) {
        console.error("HeyGen session failed:", e);
        closeHeyGenSession();
    }
}

function closeHeyGenSession() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    sessionId = null;
    const videoElement = document.getElementById('heygen-video');
    const fallbackElement = document.getElementById('avatar-fallback');
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement.classList.add('hidden');
    }
    if (fallbackElement) {
        fallbackElement.classList.remove('hidden');
    }
}

// 5. Select Interactive Character (Wolf, Fox, Bear, Bunny, Оксана, Taras, Marijka, Grandfather)
function selectCharacter(char) {
    currentCharacter = char;
    
    // Set active states on all 8 buttons
    const avatarIds = ['wolf', 'fox', 'bear', 'bunny', 'human', 'taras', 'marijka', 'grandfather'];
    avatarIds.forEach(id => {
        const btn = document.getElementById(`char-btn-${id}`);
        if (btn) btn.classList.toggle('active', id === char);
    });
    
    // Switch visual avatar mock
    updateCharacterLevelImage();
    
    // Setup HeyGen Webrtc Session
    closeHeyGenSession();
    startHeyGenSession();
    
    // Reset recording feedback
    resetFeedback();
    
    // Play voice greeting out loud (Slovak synthesis)
    speakSlovak(avatarConfig[char].greetSk);
    
    // Update chat log
    updateChatHistoryLanguage();

    // Check if subscription is expired or trial is completed for this specific character
    setTimeout(() => {
        checkAccessRules();
    }, 800);
}

function speakSlovak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop current speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'sk-SK';
        
        // Dynamic pitch and rate based on active character
        const isAnimal = ['wolf', 'fox', 'bear', 'bunny'].includes(currentCharacter);
        if (isAnimal) {
            utterance.pitch = currentCharacter === 'wolf' ? 0.75 : 0.9;
            utterance.rate = 0.8;
        } else {
            utterance.pitch = currentCharacter === 'grandfather' ? 0.85 : 1.15;
            utterance.rate = 0.85;
        }
        
        // Find Slovak voice
        const voices = window.speechSynthesis.getVoices();
        const skVoice = voices.find(voice => voice.lang.includes('sk'));
        if (skVoice) {
            utterance.voice = skVoice;
        }
        
        window.speechSynthesis.speak(utterance);
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

// 8. GDPR & Privacy Operations
function exportGDPRData() {
    const safetyAuditLogs = {
        profile: {
            child_id: "slovak-student-anon-8742",
            age: "under 14",
            gdpr_consent_provided: true,
            consent_date: "2026-07-17"
        },
        speech_logs: [
            { timestamp: "2026-07-17T18:24:12Z", text: "Dobrý deň", accuracy_score: 0.78, raw_audio_retained: false },
            { timestamp: "2026-07-17T18:25:01Z", text: "Dobrý deň, ako sa máš", accuracy_score: 0.96, raw_audio_retained: false }
        ],
        data_processing_rule: "EU GDPR-K compliant: All raw voice wave recordings were deleted immediately from temporary memory (in-memory parsing) upon phonetic translation."
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(safetyAuditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "slovahoj_kids_gdpr_export.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function deleteGDPRProfile() {
    const confirmation = confirm(currentLang === 'uk' 
        ? "Ви дійсно бажаєте безповоротно видалити профіль дитини та всю історію занять відповідно до регламенту GDPR-K?" 
        : "Вы действительно хотите безвозвратно удалить профиль ребенка и всю историю занятий в соответствии с регламентом GDPR-K?");
    
    if (confirmation) {
        // Reset statistics
        document.getElementById('stat-time-val').innerHTML = '0 год 0 хв';
        document.getElementById('stat-vocab-val').innerHTML = '0 слів';
        document.getElementById('stat-social-val').innerHTML = '0 / 5 етапів';

        // Clear chart
        if (progressChart) {
            progressChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
            progressChart.update();
        }

        // Lock milestones
        const milestones = document.querySelectorAll('.milestone-item');
        milestones.forEach(item => {
            item.className = 'milestone-item locked';
            item.querySelector('.milestone-checkbox').innerHTML = '<i class="fa-solid fa-lock"></i>';
        });

        alert(currentLang === 'uk' 
            ? "Усі дані дитини успішно та назавжди видалено з баз даних." 
            : "Все данные ребенка успешно и навсегда удалены из баз данных.");
        
        switchView('playground');
    }
}


// --- PIN Authentication, Registration, and Expiry Check Rules ---

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

function showPostTrialModal() {
    document.getElementById('post-trial-modal').classList.remove('hidden');
}

function closePostTrialModal() {
    document.getElementById('post-trial-modal').classList.add('hidden');
}

function openRegModalFromInvite() {
    closePostTrialModal();
    document.getElementById('registration-modal').classList.remove('hidden');
}

function closeRegistrationModal() {
    document.getElementById('registration-modal').classList.add('hidden');
}

function generateRandomPin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function processRegistration() {
    const email = document.getElementById('reg-email').value.trim();
    
    // Admin override: typing '9999' automatically registers as admin
    if (email === ADMIN_PIN) {
        currentUserEmail = "admin@test.com";
        isRegistered = true;
        parentPin = "9999";
        childPin = "1111";
        saveSubState();
        
        // Directly proceed to cabinet dashboard
        closeRegistrationModal();
        setParentVerified(true);
        switchView('cabinet');
        checkCabinetExpiryAlert();
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        document.getElementById('reg-error').classList.remove('hidden');
        return;
    }
    document.getElementById('reg-error').classList.add('hidden');
    
    currentUserEmail = email;
    isRegistered = true;
    parentPin = generateRandomPin();
    childPin = generateRandomPin();
    
    saveSubState();
    
    document.getElementById('reg-child-pin').innerText = childPin;
    document.getElementById('reg-parent-pin').innerText = parentPin;
    document.getElementById('reg-success-details').classList.remove('hidden');
    
    document.getElementById('reg-modal-footer').classList.add('hidden');
    document.getElementById('reg-modal-footer-success').classList.remove('hidden');
    
    console.log(`Registered successfully. Child PIN: ${childPin}, Parent PIN: ${parentPin}`);
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
        wolf: false,
        fox: false,
        bear: false,
        bunny: false,
        human: false,
        taras: false,
        marijka: false,
        grandfather: false
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
            subscriptionType = 'paid';
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
    const message = currentLang === 'uk'
        ? 'Вітаємо! Ви успішно активували безкоштовний пробний доступ на 7 днів.'
        : 'Поздравляем! Вы успешно активировали бесплатный пробный доступ на 7 дней.';
        
    alert(message);
    
    // Set trial state (Preserves child's progress!)
    subscriptionStart = Date.now();
    subscriptionEnd = subscriptionStart + (7 * 24 * 60 * 60 * 1000);
    subscriptionType = 'trial';
    saveSubState();
    
    // Clean lock screens
    document.getElementById('sub-expired-lock-modal').classList.add('hidden');
    document.getElementById('parent-expiry-modal').classList.add('hidden');

    // Activate subscription banner as trial active
    const banner = document.getElementById('subscription-status-banner');
    banner.querySelector('.sub-title').setAttribute('data-i18n', 'trial_active_title');
    banner.querySelector('.sub-title').innerText = currentLang === 'uk' ? 'Ваш пробний період активний!' : 'Ваш пробный период активен!';
    
    const expDate = new Date(subscriptionEnd);
    const expString = `${expDate.getDate()}.${expDate.getMonth()+1}.${expDate.getFullYear()}`;
    banner.querySelector('.sub-details').innerText = currentLang === 'uk'
        ? `Пробний період дійсний до ${expString}.`
        : `Пробный период действителен до ${expString}.`;
    banner.classList.remove('hidden');
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
    updateScenarioUI();
    updateCharacterLevelImage();
    
    // Start HeyGen Streaming
    startHeyGenSession();
});
