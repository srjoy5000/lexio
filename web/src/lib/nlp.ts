const GLOBAL_IGNORE_LIST = [
  "Estados Unidos", "United States", "Japan", "Brazil", "China", "India", "Germany", "France", "Italy", "Spain",
  "Canada", "Australia", "Russia", "Mexico", "South Korea", "United Kingdom", "Argentina", "Colombia", "Peru", "Chile"
];

// Language-specific stopwords (functional words that carry no vocabulary learning value)
export const STOPWORDS: Record<string, Set<string>> = {
  en: new Set([
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "by","from","is","are","was","were","be","been","being","have","has",
    "had","do","does","did","will","would","could","should","may","might",
    "shall","can","not","no","nor","so","yet","as","its","it","this","that",
    "these","those","i","you","he","she","we","they","me","him","her","us",
    "them","my","your","his","our","their","what","which","who","when",
    "where","why","how","all","any","if","into","up","out","about","also",
    "just","still","then","than","too","very","even","back","there","here",
    "own","same","each","both","such","more","most","other","few","some",
    // common verbs with low learning value
    "go","get","make","take","come","see","know","think","want","use",
    "find","give","tell","ask","say","look","seem","put","keep","let",
    "try","call","work","need","feel","become","show","leave","move",
    "set","turn","run","start","play","hold","follow","stop","must",
    // adverbs / connectors
    "never","always","already","often","again","once","away","down",
    "well","only","new","after","before","while","though","however",
    "every","without","around","through","under","long","first","last",
    "next","another","rather","quite","almost","either","against","along",
    "during","off","less","much","many","upon","ago","now","later","really",
    "actually","maybe","perhaps","usually","simply","often","however",
    "something","anything","everything","someone","anyone","nothing",
    "whether","since","because","per","via","over","right","away",
  ]),
  ja: new Set([
    "は","が","を","に","で","の","と","も","から","まで","より","へ","や",
    "か","ね","よ","わ","さ","だ","です","ます","ました","でした","でも",
    "しかし","そして","また","さらに","ため","こと","もの","ので","のに",
    "という","として","について","において","に対して","による","ながら",
    "その","この","あの","それ","これ","あれ","ここ","そこ","あそこ",
    "ている","てい","ており","など","たり","たら","において","なお","ただ",
    "とても","非常","すでに","まだ","もう","まず","つまり","のよう",
    "一方","そのため","すなわち","例えば","一方で","加えて","また",
    "及び","ただし","なお","さて","加えて","その後","その他","その上",
    // auxiliary/inflection fragments
    "ば","れば","たい","させ","られ","てしまう","てしまい","でしょう",
    "らしい","そうだ","ようだ","みたい","はず","べき","かも","だった",
    "だろう","でした","ません","ましょう","ましたか","だけど","だけれど",
    "けれど","けれども","ところが","だから","ですから","ですが","ですね",
    "ですよ","ので","のに","から","ため","たため","ことが","ことも",
    "ものの","のを","のは","のが","ための","による","にとって","において",
    "でございます","ております","おります","になります","になって",
    "していた","していく","してきた","してきて","している","していき",
    "というか","というより","にしても","としても","であること","とする",
    "に関して","に関する","によって","に基づく","といった","にあたって",
  ]),
  fr: new Set([
    // elision clitics (must appear before word tokenization removes them)
    "l'","d'","j'","c'","n'","s'","m'","qu'","jusqu'","lorsqu'","puisqu'","quoiqu'",
    "l\u2019","d\u2019","j\u2019","c\u2019","n\u2019","s\u2019","m\u2019","qu\u2019",
    "le","la","les","un","une","des","et","ou","mais","donc","or","ni","car",
    "je","tu","il","elle","nous","vous","ils","elles","me","te","se","lui",
    "en","de","du","au","aux","dans","sur","sous","par","pour","avec","sans",
    "à","ce","cet","cette","ces","mon","ma","mes","ton","ta","tes","son","sa",
    "ses","notre","votre","leur","leurs","que","qui","dont","où","est","sont",
    "était","a","ont","très","plus","aussi","même","pas","ne","bien","tout",
    "comme","si","quand","alors","ainsi","car","cependant","y","en",
    // être / avoir conjugations
    "suis","es","sommes","êtes","étais","étions","étiez","étaient","sera",
    "serait","soient","soit","fût","ai","as","avons","avez","avait",
    "avions","aviez","avaient","aura","aurait","aient","ait",
    // common high-frequency verbs
    "fait","fais","faite","faites","font","va","vais","vas","allons","allez","vont",
    "peut","peux","peuvent","pouvons","pouvez","veut","veux","veulent",
    "voulons","voulez","sait","sais","savent","savons","savez","voit","vois",
    "voient","voyons","voyez","vient","viens","viennent","venons","venez",
    "dois","doit","doivent","devons","devez","prend","prends","prennent",
    "prenons","prenez","faut","faudrait","suffit",
    // connectors / fillers
    "celui","celle","ceux","celles","lequel","laquelle","lesquels","moi",
    "toi","soi","eux","ici","là","puis","encore","jamais","toujours",
    "souvent","parfois","d'abord","ensuite","enfin","notamment","puisque",
    "lorsque","afin","malgré","pendant","avant","après","chez","depuis",
    "vers","contre","selon","parmi","sauf","néanmoins","pourtant","certes",
    "d'ailleurs","en effet","en outre","c'est","il y a","déjà","rien","quelque",
  ]),
  es: new Set([
    "el","la","los","las","un","una","unos","unas","y","o","pero","que","de",
    "del","al","en","con","por","para","sin","sobre","entre","desde","hasta",
    "yo","tú","él","ella","nosotros","ellos","ellas","me","te","se","le","lo",
    "les","mi","tu","su","nuestro","este","ese","es","son","era","fue","ser",
    "estar","ha","han","muy","más","también","como","si","cuando","donde",
    "porque","no","ni","ya","así","sin","según","durante","después","antes",
    // tener / hacer / ir
    "tener","tengo","tiene","tenemos","tienen","tenía","tenían","haber",
    "hacer","hago","hace","hacemos","hacen","hacía","hay","había","hubo",
    "ir","voy","va","vamos","van","iba","iban",
    // poder / querer / decir / ver / saber / venir
    "poder","puedo","puede","podemos","pueden","podía","querer","quiero",
    "quiere","queremos","quieren","quería","decir","digo","dice","decimos",
    "dicen","ver","veo","ve","vemos","ven","saber","sé","sabe","sabemos",
    "saben","venir","vengo","viene","venimos","vienen","deber","debe",
    // pronouns / determiners / connectors
    "todo","todos","toda","todas","algo","alguien","nadie","nada","nunca",
    "siempre","jamás","hoy","ayer","mañana","ahora","aquí","allí","allá",
    "bien","mal","solo","sólo","menos","mejor","peor","cuyo","cuya",
    "esta","estos","estas","aquel","aquella","aquellos","aquellas",
    "otro","otra","otros","otras","mismo","misma","mismos","mismas",
    "sin embargo","por eso","por tanto","es decir","a pesar de","aunque",
    "mientras","pues","luego","entonces","además","ante","bajo","tras",
    "mediante","excepto","incluso","cómo","cuándo","dónde","quién",
  ]),
  "pt-BR": new Set([
    "o","a","os","as","um","uma","uns","umas","e","ou","mas","porém","que",
    "de","do","da","dos","das","em","no","na","nos","nas","com","por","para",
    "sem","sobre","entre","desde","até","eu","tu","ele","ela","nós","eles",
    "elas","me","te","se","lhe","nos","meu","minha","seu","sua","nosso",
    "nossa","este","esse","aquele","é","são","era","foi","ser","estar","tem",
    "têm","muito","mais","também","como","se","quando","onde","porque","não",
    "nem","já","assim","bem","só","aqui","lá","agora","então","pois","porém",
    // prepositions / conjunctions
    "ao","aos","à","às","pelo","pela","pelos","pelas","num","numa","isso",
    "isto","aquilo","depois","qual","quem","seja","será",
    // pronouns
    "você","vocês","vos","lhes","seus","suas","dela","dele","delas","deles",
    "essa","esse","essas","esses","meus","minhas","teu","tua","teus","tuas",
    "nossos","nossas","foram",
    // ter / fazer / ir
    "ter","tenho","temos","tinha","tinham","haver","há","havia","houve",
    "fazer","faço","faz","fazemos","fazem","fazia","ir","vou","vai","vamos",
    "vão","ia","iam",
    // poder / querer / dizer / ver / saber / vir
    "poder","posso","pode","podemos","podem","podia","querer","quero","quer",
    "queremos","querem","queria","dizer","digo","diz","dizemos","dizem",
    "ver","vejo","vê","vemos","veem","saber","sei","sabe","sabemos","sabem",
    "vir","venho","vem","vimos","vêm","dever","deve","devemos","devem",
    // estar conjugations
    "estou","está","estamos","estão","estive","esteve","estivemos","estiveram",
    "estava","estávamos","estavam","estivera","estivéramos","esteja","estejamos",
    "estejam","estivesse","estivéssemos","estivessem","estiver","estivermos","estiverem",
    // haver conjugations
    "hei","havemos","hão","houvemos","houveram","houvera","houvéramos",
    "haja","hajamos","hajam","houvesse","houvéssemos","houvessem",
    "houver","houvermos","houverem","houverei","houverá","houveremos",
    "houverão","houveria","houveríamos","houveriam","fosse",
    // ser conjugations
    "sou","somos","éramos","eram","fui","fomos","fora","fôramos",
    "sejamos","sejam","fôssemos","fossem","for","formos","forem",
    "serei","seremos","serão","seria","seríamos","seriam",
    // ter conjugations (extended)
    "tém","tínhamos","tive","teve","tivemos","tiveram","tivera","tivéramos",
    "tenha","tenhamos","tenham","tivesse","tivéssemos","tivessem",
    "tiver","tivermos","tiverem","terei","terá","teremos","terão","teria","teríamos","teriam",
    // pronouns / determiners / connectors
    "tudo","todos","toda","todas","algo","alguém","ninguém","nada","nunca",
    "sempre","jamais","hoje","ontem","amanhã","agora","aqui","ali","lá",
    "bem","mal","sozinho","menos","melhor","pior","cujo","cuja","cujos","cujas",
    "esta","estes","estas","aquela","aqueles","aquelas",
    "outro","outra","outros","outras","mesmo","mesma","mesmos","mesmas",
    "no entanto","portanto","ou seja","apesar de","embora","enquanto",
    "além","todavia","contudo","entretanto","apesar","mediante","através",
    "inclusive","exceto","salvo","sob","ante","logo","pois",
  ]),
  ko: new Set([
    "은","는","이","가","을","를","의","에","에서","로","으로","와","과",
    "이나","이고","이며","도","만","부터","까지","보다","에게","께","라",
    "이라","이고","며","서","라고","이라고","그","이","저","여기","거기",
    "어디","그것","이것","저것","있다","없다","이다","되다","하다","것",
    "수","때","곳","등","및","또","그리고","하지만","그런데","그래서",
    "따라서","즉","또한","다만","한편","물론","매우","아주","너무","정말",
    // verb endings / auxiliary forms
    "하는","하고","하면","하여","해서","했다","했습니다","한다","합니다",
    "됩니다","됐다","되는","되어","되고","되면","있는","있고","있어",
    "없는","없고","없어","하게","하기","하지","않다","않고","않아",
    "않으면","이런","그런","저런","어떤","모든","각","여러",
    // time / manner adverbs
    "다음","이전","현재","지금","아직","이미","바로","다시","계속",
    "먼저","나중에","만약","그래서","그러나","그렇지만","그럼에도",
    "사실","실제로","단지","오직","비록","아마","혹시","분명히",
    "특히","주로","일반적으로","대부분","항상","자주","가끔","보통",
    "절대","거의","종종","함께","또한","이후","이전에","동시에",
    // common endings
    "입니다","습니다","었습니다","겠습니다","시겠습니까","으로서","에게서",
    "한테서","에게는","에서는","으로는","라는","라도","라면","더라도",
  ]),
};

export function isStopword(word: string, lang: string, exceptions?: string[]): boolean {
  const stopwords = STOPWORDS[lang];
  if (!stopwords) return false;
  const lower = word.toLowerCase();
  if (exceptions && exceptions.includes(lower)) return false;
  return stopwords.has(lower);
}

// Cache shouldHighlightWord results to avoid re-running the NLP library on every render
const _highlightCache = new Map<string, boolean>();

export function shouldHighlightWord(word: string, sentence: string, language: string = "en"): boolean {
  const cacheKey = `${language}:${word}`;
  if (_highlightCache.has(cacheKey)) return _highlightCache.get(cacheKey)!;

  // Extended unicode range to include hiragana, katakana, and Hangul
  const cleanWord = word.replace(/[^A-Za-zÀ-ž\u3040-\u30FF\uAC00-\uD7A3一-鿿0-9]/g, "").toLowerCase();
  let result = false;

  if (cleanWord) {
    result = true;
    // Skip tokens that contain digits (time expressions like "21h", "3pm", version numbers, etc.)
    if (/\d/.test(cleanWord)) result = false;
    // Skip if in global ignore list
    else if (GLOBAL_IGNORE_LIST.some(name => name.toLowerCase().includes(cleanWord))) result = false;
    // Skip acronyms (2+ uppercase letters)
    else if (/^[A-Z]{2,}$/.test(word)) result = false;
    // Skip proper nouns (capitalized, not first word of sentence)
    else {
      const sentenceStart = sentence.trim().split(/\s+/)[0];
      if (word[0] === word[0].toUpperCase() && word !== sentenceStart && /^[A-Z]/.test(word)) result = false;
      // Additional heuristic for English: capitalized mid-sentence = proper noun
      else if (language === "en" && /^[A-Z][a-z]+$/.test(word) && !sentence.trimStart().startsWith(word)) {
        result = false;
      }
    }
  }

  _highlightCache.set(cacheKey, result);
  return result;
}

export function extractSentence(text: string, targetWord: string, lang: string = "en"): string {
  const segmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
  const sentences = Array.from(segmenter.segment(text)).map((s) =>
    s.segment.trim()
  );

  const foundSentence = sentences.find(
    (sentence) =>
      sentence
        .toLowerCase()
        .includes(targetWord.toLowerCase()) && sentence.length > 0
  );

  return foundSentence || "";
}

export function tokenizeWords(text: string, language: string): string[] {
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const raw: string[] = [];

  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) {
      raw.push(segment.segment.toLowerCase());
    }
  }

  // Split elisions (e.g. "d'abord" → "abord", "l'éco" → "éco") to match
  // how renderHighlighted tracks words in the reader.
  // Matches straight apostrophe (U+0027) and right single quotation mark (U+2019)
  const ELISION_RE = /['\u2019]/;
  const words: string[] = [];
  for (const w of raw) {
    const idx = w.search(ELISION_RE);
    if (idx > 0 && idx < w.length - 1) {
      words.push(w.slice(idx + 1));
    } else {
      words.push(w);
    }
  }

  return words;
}

export function getPartOfSpeech(word: string, lang: string): string {
  if (lang === "en") {
    // Suffix-based heuristics (Google Translate provides full POS when online)
    const w = word.toLowerCase();
    if (/ly$/.test(w) && w.length > 3) return "Adverb";
    if (/ing$|ize$|ise$/.test(w)) return "Verb";
    if (/ness$|tion$|ity$|ment$|ance$|ence$/.test(w)) return "Noun";
    if (/ful$|less$|ous$|ive$|able$|ible$/.test(w)) return "Adjective";
    return "Word";
  }
  const labels: Record<string, string> = {
    ja: "語",
    fr: "Mot",
    es: "Palabra",
    "pt-BR": "Palavra",
    ko: "단어",
  };
  return labels[lang] || "Word";
}

// BCP-47 locale tags for SpeechSynthesisUtterance.lang
export const SPEECH_LANG_MAP: Record<string, string> = {
  ja: "ja-JP",
  en: "en-US",
  fr: "fr-FR",
  "pt-BR": "pt-BR",
  es: "es-ES",
  ko: "ko-KR",
};

/**
 * Pronounce `text` in `lang` via the Web Speech API.
 * Explicitly selects a matching voice to avoid the browser defaulting to whatever
 * voice happens to be loaded first (often pt-BR in Chrome).
 * Pass `preferredVoiceURI` to override the default voice selection.
 */
export function speakText(text: string, lang: string, preferredVoiceURI?: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const targetLang = SPEECH_LANG_MAP[lang] ?? lang;

  const doSpeak = () => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = targetLang;
    const voices = window.speechSynthesis.getVoices();
    if (preferredVoiceURI) {
      const preferred = voices.find((v) => v.voiceURI === preferredVoiceURI || v.name === preferredVoiceURI);
      if (preferred) { utt.voice = preferred; }
    }
    if (!utt.voice) {
      const baseLang = targetLang.split("-")[0];
      // Prefer exact locale match (e.g. fr-FR), fall back to same base language (fr)
      const voice =
        voices.find((v) => v.lang === targetLang) ??
        voices.find((v) => v.lang.startsWith(baseLang));
      if (voice) utt.voice = voice;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  };

  // Chrome loads voices asynchronously — wait for voiceschanged if not ready yet
  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true });
  }
}

export function getHeatmapColor(
  count: number,
  minCount: number,
  maxCount: number
): string {
  // Normalize count to 0-1
  const normalized =
    maxCount === minCount ? 1 : (count - minCount) / (maxCount - minCount);

  // HSL: rare = red (0), common = green (120)
  const hue = normalized * 120;
  const saturation = 70;
  const lightness = 40 + normalized * 20; // 40-60

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
