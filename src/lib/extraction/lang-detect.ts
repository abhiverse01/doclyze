/**
 * Simple language detection using character-range heuristics and keyword lists.
 * No ML, no API calls — fully deterministic and re-runnable.
 */

interface LanguageResult {
  code: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
}

/** CJK Unicode ranges */
const CJK_RANGES = /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/;

/** Cyrillic range */
const CYRILLIC_RANGE = /[\u0400-\u04FF\u0500-\u052F]/;

/** Arabic range */
const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Devanagari range (Hindi, Marathi, Nepali, etc.) */
const DEVANAGARI_RANGE = /[\u0900-\u097F\uA8E0-\uA8FF]/;

/** Thai range */
const THAI_RANGE = /[\u0E00-\u0E7F]/;

/** High-frequency word lists for common non-English languages */
const LANGUAGE_WORDS: Array<{ code: string; name: string; words: string[] }> = [
  {
    code: 'es',
    name: 'Spanish',
    words: ['el', 'la', 'los', 'las', 'de', 'en', 'que', 'por', 'para', 'con', 'una', 'uno', 'es', 'fue',
            'como', 'más', 'pero', 'su', 'al', 'del', 'se', 'no', 'han', 'también', 'muy', 'este', 'esta',
            'ello', 'ella', 'nos', 'ha', 'sido', 'son', 'tiene', 'puede', 'hace', 'año', 'años', 'día',
            'mientras', 'hasta', 'donde', 'cuando', 'cada', 'todos', 'todas', 'otro', 'otra', 'sino', 'sobre'],
  },
  {
    code: 'fr',
    name: 'French',
    words: ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'en', 'que', 'est', 'qui', 'dans',
            'pour', 'pas', 'plus', 'sur', 'ce', 'il', 'elle', 'sont', 'avec', 'ne', 'se', 'mais', 'tout',
            'nous', 'vous', 'leur', 'ces', 'aux', 'été', 'fait', 'elle', 'aussi', 'comme', 'même', 'été',
            'année', 'après', 'depuis', 'entre', 'autres', 'tout', 'très', 'bien', 'oui', 'non', 'cette'],
  },
  {
    code: 'de',
    name: 'German',
    words: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'und', 'ist', 'nicht', 'von', 'mit',
            'sich', 'auf', 'für', 'auch', 'als', 'nach', 'wie', 'kann', 'wird', 'hat', 'aber', 'noch', 'es',
            'werden', 'dann', 'oder', 'durch', 'wir', 'zur', 'zum', 'einer', 'einem', 'eines', 'eine',
            'jährige', 'jahren', 'jahr', 'über', 'unter', 'zwischen', 'gegen', 'wurde', 'worden'],
  },
  {
    code: 'pt',
    name: 'Portuguese',
    words: ['o', 'a', 'os', 'as', 'de', 'em', 'que', 'por', 'para', 'com', 'um', 'uma', 'não', 'é',
            'como', 'mais', 'ao', 'da', 'do', 'se', 'mas', 'foi', 'ser', 'tem', 'pode', 'sua', 'seu',
            'ou', 'já', 'também', 'anos', 'ano', 'dia', 'quando', 'onde', 'muito', 'ainda', 'entre',
            'sobre', 'após', 'desde', 'até', 'mesmo'],
  },
  {
    code: 'zh',
    name: 'Chinese',
    words: ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也',
            '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她',
            '那', '这个', '那个', '什么', '对', '为', '中', '国', '年'],
  },
  {
    code: 'ja',
    name: 'Japanese',
    words: ['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'な', 'も', 'れる', 'ある', 'から',
            'れる', 'こと', 'いう', 'です', 'ます', 'ない', 'その', 'これ', 'それ', 'もの', 'など', 'こと',
            'さ', 'れ', 'あり', 'でき', 'られ', 'よう', 'ところ', 'ため', '時間', '年'],
  },
  {
    code: 'ko',
    name: 'Korean',
    words: ['의', '에', '는', '이', '가', '을', '를', '도', '으로', '하고', '이다', '있다', '그', '이',
            '것', '그것', '저것', '우리', '너', '그녀', '하지만', '그러나', '그래서', '그런데', '때문에',
            '그리고', '그러면', '그렇지만', '수', '잘', '더', '것이다', '년', '월', '일'],
  },
  {
    code: 'ru',
    name: 'Russian',
    words: ['и', 'в', 'на', 'не', 'что', 'с', 'по', 'это', 'он', 'как', 'а', 'то', 'все', 'она',
            'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'мы', 'вы', 'за', 'бы', 'из', 'только',
            'этот', 'был', 'уже', 'или', 'ведь', 'будет', 'может', 'год', 'года', 'лет', 'года',
            'между', 'через', 'после', 'перед'],
  },
  {
    code: 'ar',
    name: 'Arabic',
    words: ['في', 'من', 'إلى', 'على', 'أن', 'هذا', 'التي', 'هو', 'هي', 'كان', 'قد', 'لا', 'ما',
            'مع', 'بعد', 'عن', 'حتى', 'عندما', 'أو', 'لكن', 'بين', 'ذلك', 'كل', 'كانت', 'تم',
            'أكثر', 'أيام', 'يوم', 'عام', 'سنوات', 'أثناء'],
  },
  {
    code: 'hi',
    name: 'Hindi',
    words: ['के', 'का', 'में', 'है', 'की', 'और', 'से', 'ने', 'को', 'इस', 'हैं', 'कोई', 'नहीं',
            'यह', 'लेकिन', 'जो', 'था', 'एक', 'वह', 'हो', 'भी', 'रहा', 'सब', 'अपने', 'अब',
            'तक', 'बाद', 'पहले', 'कई', 'वर्ष', 'साल', 'दिन'],
  },
];

/**
 * Detect the likely language of the given text.
 * Uses character-range detection first, then keyword frequency.
 * Returns English as default if no strong non-English signals are found.
 */
export function detectLanguage(text: string): LanguageResult {
  if (!text || text.trim().length === 0) {
    return { code: 'en', name: 'English', confidence: 'low' };
  }

  const sampleLength = Math.min(text.length, 5000);
  const sample = text.slice(0, sampleLength);

  // ─── Phase 1: Script detection via Unicode ranges ───────────────────────
  const cjkMatches = sample.match(CJK_RANGES);
  const cyrillicMatches = sample.match(CYRILLIC_RANGE);
  const arabicMatches = sample.match(ARABIC_RANGE);
  const devanagariMatches = sample.match(DEVANAGARI_RANGE);
  const thaiMatches = sample.match(THAI_RANGE);

  if (thaiMatches && thaiMatches.length > 5) {
    return { code: 'th', name: 'Thai', confidence: 'high' };
  }

  if (devanagariMatches && devanagariMatches.length > 5) {
    return { code: 'hi', name: 'Hindi', confidence: 'high' };
  }

  if (cjkMatches && cjkMatches.length > 10) {
    // Distinguish Chinese, Japanese, Korean via keywords
    const cjkText = cjkMatches.join('');
    const bestLang = scoreKeywords(cjkText, ['zh', 'ja', 'ko']);
    if (bestLang && bestLang.score >= 3) {
      return { code: bestLang.code, name: bestLang.name, confidence: bestLang.score >= 6 ? 'high' : 'medium' };
    }
    // Default to Chinese for CJK (most common)
    return { code: 'zh', name: 'Chinese', confidence: 'medium' };
  }

  if (cyrillicMatches && cyrillicMatches.length > 5) {
    return { code: 'ru', name: 'Russian', confidence: 'medium' };
  }

  if (arabicMatches && arabicMatches.length > 5) {
    return { code: 'ar', name: 'Arabic', confidence: 'medium' };
  }

  // ─── Phase 2: Keyword-based detection for Latin-script languages ────────
  // Tokenize into words (Latin letters only)
  const words = sample.match(/\b[a-zA-ZàâäéèêëïîôùûüÿçñæœÀÂÄÉÈÊËÏÎÔÙÛÜŸÇÑÆŒ]{2,}\b/g) ?? [];

  const bestOverall = scoreKeywords(words.join(' '), LANGUAGE_WORDS.map(l => l.code));
  if (bestOverall && bestOverall.score >= 8) {
    return {
      code: bestOverall.code,
      name: bestOverall.name,
      confidence: bestOverall.score >= 15 ? 'high' : 'medium',
    };
  }

  // Default: English
  return { code: 'en', name: 'English', confidence: 'low' };
}

/** Score a text against a subset of languages by keyword frequency. */
function scoreKeywords(text: string, codes: string[]): { code: string; name: string; score: number } | null {
  const lower = text.toLowerCase();
  let best: { code: string; name: string; score: number } | null = null;

  for (const lang of LANGUAGE_WORDS) {
    if (!codes.includes(lang.code)) continue;
    let score = 0;
    for (const word of lang.words) {
      const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
      const matches = lower.match(re);
      if (matches) {
        score += Math.min(matches.length, 10); // cap per word
      }
    }
    if (score > (best?.score ?? 0)) {
      best = { code: lang.code, name: lang.name, score };
    }
  }

  return best;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
