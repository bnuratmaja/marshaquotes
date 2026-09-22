"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Quote = {
  id: number;
  text: string;
  video_id: string;
  video_title: string;
  youtube_url: string;
  start_seconds: number;
  end_seconds: number | null;
};

type SearchResult = {
  quote: Quote;
  context: string;
};

type VideoResult = {
  video_id: string;
  video_title: string;
  youtube_url: string;
  matches: SearchResult[];
};

const PAGE_SIZE = 1000;
const MAX_HISTORY = 8;
const MAX_RANDOM_CANDIDATES = 5000;

function getYoutubeUrl(quote: Quote) {
  const timestamp = Math.max(0, quote.start_seconds - 1);
  return `${quote.youtube_url}${quote.youtube_url.includes("?") ? "&" : "?"}t=${timestamp}`;
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function highlightText(text: string, search: string) {
  if (!search.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-[#ffff00] px-0.5 text-black">
        {text.slice(index, index + search.length)}
      </mark>
      {text.slice(index + search.length)}
    </>
  );
}

function buildRandomCandidates(quotes: Quote[]) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const quote of quotes) {
    const words = quote.text.match(/[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)?/gi) || [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase();
      if (word.length >= 3 && !seen.has(word)) {
        seen.add(word);
        candidates.push(word);
      }

      if (i < words.length - 1) {
        const next = words[i + 1].toLowerCase();
        if (word.length >= 3 && next.length >= 3) {
          const phrase = `${word} ${next}`;
          if (!seen.has(phrase)) {
            seen.add(phrase);
            candidates.push(phrase);
          }
        }
      }

      if (candidates.length >= MAX_RANDOM_CANDIDATES) return candidates;
    }
  }

  return candidates;
}

export default function Home() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [randomCandidates, setRandomCandidates] = useState<string[]>([]);

  useEffect(() => {
    const savedHistory = localStorage.getItem("marshaSearchHistory");
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setSearchHistory(parsed.slice(0, MAX_HISTORY));
      } catch {
        localStorage.removeItem("marshaSearchHistory");
      }
    }

    async function loadQuotes() {
      setLoading(true);
      setLoadError("");

      const allQuotes: Quote[] = [];
      let lastId = 0;

      while (true) {
        const { data, error } = await supabase
          .from("quotes")
          .select("*")
          .gt("id", lastId)
          .order("id", { ascending: true })
          .limit(PAGE_SIZE);

        if (error) {
          console.error(error);
          setLoadError("couldn't load the transcript archive.");
          break;
        }

        const batch = data || [];
        allQuotes.push(...batch);

        if (batch.length === 0 || batch.length < PAGE_SIZE) break;
        lastId = batch[batch.length - 1].id;
      }

      const sorted = allQuotes.sort((a, b) => {
        if (a.video_id !== b.video_id) return a.video_id.localeCompare(b.video_id);
        if (a.start_seconds !== b.start_seconds) return a.start_seconds - b.start_seconds;
        return a.id - b.id;
      });

      setQuotes(sorted);
      setRandomCandidates(buildRandomCandidates(sorted));
      setLoading(false);
    }

    loadQuotes();
  }, []);

  const quotesByVideo = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const quote of quotes) {
      const list = map.get(quote.video_id) || [];
      list.push(quote);
      map.set(quote.video_id, list);
    }
    return map;
  }, [quotes]);

  function handleSearch(value = search) {
    const cleanSearch = value.trim();
    setSubmittedSearch(cleanSearch);

    if (cleanSearch) {
      setSearchHistory((current) => {
        const next = [
          cleanSearch,
          ...current.filter((item) => item.toLowerCase() !== cleanSearch.toLowerCase()),
        ].slice(0, MAX_HISTORY);
        localStorage.setItem("marshaSearchHistory", JSON.stringify(next));
        return next;
      });
    }
  }

  function handleRandomQuotes() {
    if (randomCandidates.length === 0) return;
    const randomPhrase = randomCandidates[Math.floor(Math.random() * randomCandidates.length)];
    setSearch(randomPhrase);
    handleSearch(randomPhrase);
  }

  function clearHistory() {
    localStorage.removeItem("marshaSearchHistory");
    setSearchHistory([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  const matchingQuotes = useMemo(() => {
    if (!submittedSearch.trim()) return [];
    const needle = submittedSearch.toLowerCase();
    return quotes.filter((quote) => quote.text.toLowerCase().includes(needle));
  }, [quotes, submittedSearch]);

  const results = useMemo<VideoResult[]>(() => {
    const grouped = new Map<string, VideoResult>();

    for (const match of matchingQuotes) {
      const videoQuotes = quotesByVideo.get(match.video_id) || [];
      const matchIndex = videoQuotes.findIndex((quote) => quote.id === match.id);
      const context = videoQuotes
        .slice(Math.max(0, matchIndex - 2), matchIndex + 3)
        .map((quote) => quote.text)
        .join(" ");

      const existing = grouped.get(match.video_id);
      const searchResult = { quote: match, context };

      if (existing) {
        existing.matches.push(searchResult);
      } else {
        grouped.set(match.video_id, {
          video_id: match.video_id,
          video_title: match.video_title || "Marsha JKT48 Livestream",
          youtube_url: match.youtube_url,
          matches: [searchResult],
        });
      }
    }

    return Array.from(grouped.values());
  }, [matchingQuotes, quotesByVideo]);

  return (
    <main className="min-h-screen bg-[#008080] p-2 font-[Tahoma,Arial,sans-serif] text-black sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="border-2 border-white bg-[#c0c0c0] shadow-[4px_4px_0px_#000]">
          <div className="flex h-8 items-center justify-end bg-gradient-to-r from-[#000080] to-[#1084d0] px-1">
            <div className="flex gap-1">
              <button aria-label="minimize" className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black">_</button>
              <button aria-label="maximize" className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black">□</button>
              <button aria-label="close" className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black">×</button>
            </div>
          </div>

          <div className="flex h-7 items-center border-b border-gray-500 bg-[#c0c0c0] px-2 text-xs">
            <a href="/" className="underline-offset-2 hover:underline"><u>H</u>ome</a>
          </div>

          <div className="bg-[#d4d0c8] p-2 sm:p-3">
            <section className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-2">
              <div className="flex flex-col items-center gap-2">
                <div className="w-full max-w-[150px]">
                  <img src="/marsha.gif" alt="marsha" className="h-auto w-full object-cover" />
                </div>
                <div className="w-full text-center">
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">what did marsha say?</h1>
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-700">search moments from her live streams uploaded on youtube</p>
                  <p className="mt-1 text-[10px] text-gray-500">(transcripts may not be perfect)</p>
                </div>
              </div>
            </section>

            <section className="mt-2 border-2 border-gray-500 border-t-white border-l-white bg-[#c0c0c0] p-2">
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <span>🔎</span><span className="font-bold">find a quote</span>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={'search something she said... try "brewek" or "sumpah aku"'}
                className="w-full border-2 border-gray-700 border-r-white border-b-white bg-white px-2 py-1.5 text-xs text-black outline-none placeholder:text-gray-500 focus:bg-[#ffffee]"
              />

              <div className="mt-1 flex flex-col gap-1 sm:flex-row">
                <button onClick={() => handleSearch()} className="flex-1 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#c0c0c0] px-4 py-1.5 text-xs font-bold active:border-gray-700 active:border-r-white active:border-b-white">search</button>
                <button onClick={handleRandomQuotes} disabled={randomCandidates.length === 0} className="flex-1 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#d4d0c8] px-3 py-1.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-50 active:border-gray-700 active:border-r-white active:border-b-white">random quotes</button>
              </div>

              {searchHistory.length > 0 && (
                <div className="mt-2 border-t border-gray-500 pt-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-gray-700">
                    <span>search history</span>
                    <button onClick={clearHistory} className="font-normal text-gray-600 underline hover:text-black">clear</button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {searchHistory.map((item) => (
                      <button key={item} onClick={() => { setSearch(item); handleSearch(item); }} className="max-w-full truncate border border-gray-500 bg-[#e8e8e8] px-2 py-1 text-[10px] text-black hover:bg-white">{item}</button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="mt-2">
              {loading ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm">loading quotes...</div>
              ) : loadError ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm">{loadError}<div className="mt-1 text-[10px] text-gray-600">refresh the page and try again.</div></div>
              ) : submittedSearch.trim() === "" ? (
                <div />
              ) : results.length === 0 ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm">no quotes found.</div>
              ) : (
                <div className="space-y-2">
                  {results.map((video) => (
                    <div key={video.video_id} className="border-2 border-gray-600 border-t-white border-l-white bg-[#c0c0c0] p-1.5">
                      <div className="mb-1 flex items-center justify-between gap-2 bg-[#000080] px-2 py-1 text-[10px] font-bold text-white">
                        <span className="min-w-0 truncate">📺 {video.video_title}</span>
                        <a href={video.youtube_url} target="_blank" rel="noopener noreferrer" className="shrink-0 underline hover:text-yellow-300">watch</a>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                        <a href={video.youtube_url} target="_blank" rel="noopener noreferrer" className="group relative block aspect-video w-full max-w-[150px] shrink-0 overflow-hidden border-2 border-gray-700 border-r-white border-b-white bg-black sm:max-w-[155px]">
                          <img src={`https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`} alt="" className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]" />
                          <div className="absolute inset-0 bg-black/10 transition group-hover:bg-black/20" />
                        </a>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between text-[9px] text-gray-600">
                            <span>{video.matches.length} matching {video.matches.length === 1 ? "moment" : "moments"}</span>
                            <span>scroll to browse</span>
                          </div>
                          <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                            {video.matches.map(({ quote, context }) => (
                              <a key={quote.id} href={getYoutubeUrl(quote)} target="_blank" rel="noopener noreferrer" className="group block w-full border-2 border-gray-500 border-t-white border-l-white bg-white p-1.5 text-left hover:bg-[#ffffe0]">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="border border-gray-500 bg-[#e8e8e8] px-1.5 py-0.5 text-[9px] font-bold">{formatTime(quote.start_seconds)}</span>
                                  <span className="text-[9px] text-blue-800 underline">watch →</span>
                                </div>
                                <p className="text-[11px] leading-relaxed">“{highlightText(quote.text, submittedSearch)}”</p>
                                <p className="mt-1 text-[9px] leading-relaxed text-gray-600">{highlightText(context, submittedSearch)}</p>
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <footer className="border-t-2 border-gray-500 bg-[#c0c0c0] px-3 py-3 text-center text-[11px] text-gray-700">
            <div className="font-bold">marsha quotes</div>
            <div className="mt-0.5">created by @bnuratmaja</div>
            <div className="mt-1 text-[9px] text-gray-500">© 2026 • not affiliated with JKT48</div>
          </footer>
        </div>
      </div>
    </main>
  );
}
