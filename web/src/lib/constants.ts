import { FeedMeta, Language } from "./types";

export const LANGUAGE_NAMES: Record<Language, string> = {
  ja: "JAPANESE",
  en: "ENGLISH",
  fr: "FRENCH",
  es: "SPANISH",
  "pt-BR": "BRAZILIAN PORTUGUESE",
  ko: "KOREAN",
};

export const DEFAULT_FEEDS: Record<Language, FeedMeta[]> = {
  en: [
    { name: "BBC World (General)", url: "https://feeds.bbci.co.uk/news/world/rss.xml", genre: "General", difficulty: "B2" },
    { name: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", genre: "Tech", difficulty: "B2" },
    { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", genre: "Business", difficulty: "B2" },
    { name: "BBC Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", genre: "Science", difficulty: "B2" },
    { name: "TechCrunch (Tech/Startup)", url: "https://techcrunch.com/feed/", genre: "Tech", difficulty: "C1" },
    { name: "Reuters (World)", url: "https://feeds.reuters.com/reuters/topNews", genre: "General", difficulty: "B2" },
    { name: "The Guardian (World)", url: "https://www.theguardian.com/world/rss", genre: "General", difficulty: "C1" },
  ],
  ja: [
    { name: "毎日新聞 (主要ニュース)", url: "https://mainichi.jp/rss/etc/mainichi-flash.rss", genre: "General", difficulty: "N1/N2" },
    { name: "NHK Web Easy (やさしい日本語)", url: "https://www3.nhk.or.jp/news/easy/k10_news_easy.rss", genre: "General", difficulty: "N3/N4" },
    { name: "Gigazine (Tech/Culture)", url: "https://gigazine.net/news/rss_2.0/", genre: "Culture", difficulty: "N2" },
    { name: "Zenn (テクノロジー/IT)", url: "https://zenn.dev/feed", genre: "Tech", difficulty: "N1" },
    { name: "PR TIMES (ビジネス/Tech)", url: "https://prtimes.jp/tv/release.xml", genre: "Business", difficulty: "N2" },
  ],
  fr: [
    { name: "France 24 (General)", url: "https://www.france24.com/fr/rss", genre: "General", difficulty: "B1" },
    { name: "France 24 (Économie)", url: "https://www.france24.com/fr/economie/rss", genre: "Business", difficulty: "B2" },
    { name: "Le Monde (General)", url: "https://www.lemonde.fr/rss/une.xml", genre: "General", difficulty: "C1" },
    { name: "Le Monde (Sciences)", url: "https://www.lemonde.fr/sciences/rss_full.xml", genre: "Science", difficulty: "C1" },
  ],
  es: [
    { name: "BBC Mundo (General)", url: "https://feeds.bbci.co.uk/mundo/rss.xml", genre: "General", difficulty: "B1" },
    { name: "BBC Mundo (Economía)", url: "https://feeds.bbci.co.uk/mundo/temas/economia/rss.xml", genre: "Business", difficulty: "B2" },
    { name: "El País (General)", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada", genre: "General", difficulty: "C1" },
    { name: "El Mundo (General)", url: "https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml", genre: "General", difficulty: "C1" },
  ],
  "pt-BR": [
    { name: "BBC Brasil (General)", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", genre: "General", difficulty: "B1" },
    { name: "G1 / Globo (General)", url: "https://g1.globo.com/rss/g1/", genre: "General", difficulty: "B2" },
    { name: "Folha de S.Paulo (General)", url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml", genre: "General", difficulty: "C1" },
  ],
  ko: [
    { name: "Yonhap News (General)", url: "https://www.yna.co.kr/rss/news.xml", genre: "General", difficulty: "Topik 5/6" },
    { name: "조선일보 (General)", url: "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml", genre: "General", difficulty: "Topik 5/6" },
  ],
};