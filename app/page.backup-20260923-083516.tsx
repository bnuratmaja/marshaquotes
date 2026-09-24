"use client";

import { useEffect, useRef, useState } from "react";
declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars?: {
            autoplay?: number;
            rel?: number;
            playsinline?: number;
            start?: number;
            origin?: string;
          };
          events?: {
            onReady?: () => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => {
        destroy: () => void;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
    __youtubeIframeApiPromise?: Promise<void>;
  }
}
import { supabase } from "../lib/supabase";

type Quote = {
  id: number;
  text: string;
  video_id: string;
  video_title: string;
  youtube_url: string;
  start_seconds: number;
  end_seconds: number | null;
  context: string;
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

const MAX_HISTORY = 8;

const monthNames: Record<string, number> = {
  januari: 0,
  februari: 1,
  maret: 2,
  april: 3,
  mei: 4,
  juni: 5,
  juli: 6,
  agustus: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
};

function getVideoDate(title: string) {
  const text = title.toLowerCase();

  const namedMonthMatch = text.match(
    /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i
  );

  if (namedMonthMatch) {
    return new Date(
      Number(namedMonthMatch[3]),
      monthNames[namedMonthMatch[2].toLowerCase()],
      Number(namedMonthMatch[1])
    ).getTime();
  }

  const showroomMatch = text.match(/(\d{1,2})-(\d{1,2})-(\d{2})/);

  if (showroomMatch) {
    const day = Number(showroomMatch[1]);
    const month = Number(showroomMatch[2]) - 1;
    const year = 2000 + Number(showroomMatch[3]);

    return new Date(year, month, day).getTime();
  }

  return 0;
}

function getYoutubeUrl(quote: Quote) {
  const timestamp = Math.max(
  0,
  Math.floor(quote.start_seconds) - 1
);

  return `https://www.youtube.com/watch?v=${quote.video_id}&t=${timestamp}s`;
}
function loadYouTubeIframeAPI() {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Window is unavailable.")
    );
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (window.__youtubeIframeApiPromise) {
    return window.__youtubeIframeApiPromise;
  }

  window.__youtubeIframeApiPromise =
    new Promise<void>((resolve, reject) => {
      const existingScript =
        document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]'
        );

      const previousCallback =
        window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        resolve();
      };

      if (existingScript) {
        const timeout = window.setTimeout(() => {
          if (!window.YT?.Player) {
            reject(
              new Error(
                "Timed out loading YouTube Player API."
              )
            );
          }
        }, 10000);

        if (window.YT?.Player) {
          window.clearTimeout(timeout);
          resolve();
        }

        return;
      }

      const script =
        document.createElement("script");

      script.src =
        "https://www.youtube.com/iframe_api";
      script.async = true;

      script.onerror = () => {
        reject(
          new Error(
            "Could not load YouTube Player API."
          )
        );
      };

      document.head.appendChild(script);
    });

  return window.__youtubeIframeApiPromise;
}
function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function highlightText(text: string, searchTerm: string) {
  if (!searchTerm.trim()) {
    return text;
  }

  const words = searchTerm
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const pattern = new RegExp(
    `(${words.map((word) =>
      word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|")})`,
    "gi"
  );

  return text.split(pattern).map((part, index) =>
    pattern.test(part) ? (
      <mark
        key={index}
        className="bg-yellow-300 px-0.5 text-black"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [results, setResults] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
const [activeQuote, setActiveQuote] =
  useState<Quote | null>(null);

const [embedStatus, setEmbedStatus] = useState<
  "loading" | "playing" | "blocked" | "error"
>("loading");

const playerContainerRef =
  useRef<HTMLDivElement | null>(null);

const playerRef = useRef<{
  destroy: () => void;
} | null>(null);
  useEffect(() => {
    const savedHistory = localStorage.getItem(
      "marshaSearchHistory"
    );

    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);

        if (Array.isArray(parsed)) {
          setSearchHistory(parsed.slice(0, MAX_HISTORY));
        }
      } catch {
        localStorage.removeItem("marshaSearchHistory");
      }
    }
  }, []);
  useEffect(() => {
    if (!activeQuote) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore cleanup errors.
        }

        playerRef.current = null;
      }

      return;
    }

    const selectedQuote = activeQuote;
    let cancelled = false;

    setEmbedStatus("loading");

    async function createPlayer() {
      try {
        await loadYouTubeIframeAPI();

        if (cancelled) {
          return;
        }

        const YT = window.YT;

        if (!YT?.Player) {
          throw new Error(
            "YouTube Player API is unavailable."
          );
        }

        const container =
          playerContainerRef.current;

        if (!container) {
          return;
        }

        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // Ignore old player cleanup errors.
          }

          playerRef.current = null;
        }

        container.innerHTML = "";

        const timestamp = Math.max(
          0,
          Math.floor(selectedQuote.start_seconds) - 1
        );

        const player = new YT.Player(
          container,
          {
            videoId: selectedQuote.video_id,

            playerVars: {
              autoplay: 1,
              rel: 0,
              playsinline: 1,
              start: timestamp,
              origin: window.location.origin,
            },

            events: {
              onReady: () => {
                if (!cancelled) {
                  setEmbedStatus("playing");
                }
              },

              onError: (event) => {
  if (cancelled) {
    return;
  }

  console.log(
    "YouTube player error:",
    event.data
  );

  if (
    event.data === 101 ||
    event.data === 150
  ) {
    const timestamp = Math.max(
      0,
      Math.floor(selectedQuote.start_seconds) - 1
    );

    const youtubeUrl =
      `https://www.youtube.com/watch?v=${selectedQuote.video_id}&t=${timestamp}s`;

    window.open(
      youtubeUrl,
      "_blank",
      "noopener,noreferrer"
    );

    setEmbedStatus("blocked");
  } else if (
    event.data === 100 ||
    event.data === 153
  ) {
    setEmbedStatus("blocked");
  } else {
    setEmbedStatus("error");
  }
},
            },
          }
        );

        playerRef.current = player;
      } catch (error) {
        console.error(
          "YouTube player error:",
          error
        );

        if (!cancelled) {
          setEmbedStatus("error");
        }
      }
    }

    createPlayer();

    return () => {
      cancelled = true;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore cleanup errors.
        }

        playerRef.current = null;
      }
    };
  }, [activeQuote]);
  async function performSearch(value: string) {
    const cleanSearch = value.trim();

    setSubmittedSearch(cleanSearch);
    setLoadError("");

    if (!cleanSearch) {
      setResults([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.rpc(
      "search_quotes",
      {
        search_term: cleanSearch,
      }
    );

    if (error) {
      console.error(error);
      setResults([]);
      setLoadError("couldn't search the transcript archive.");
      setLoading(false);
      return;
    }

    const grouped = new Map<string, VideoResult>();

    for (const quote of (data || []) as Quote[]) {
      const existing = grouped.get(quote.video_id);

      const searchResult: SearchResult = {
        quote,
        context: quote.context || quote.text,
      };

      if (existing) {
        existing.matches.push(searchResult);
      } else {
        grouped.set(quote.video_id, {
          video_id: quote.video_id,
          video_title:
            quote.video_title ||
            "Marsha JKT48 Livestream",
          youtube_url: quote.youtube_url,
          matches: [searchResult],
        });
      }
    }

    const groupedResults = Array.from(grouped.values()).sort(
      (a, b) =>
        getVideoDate(b.video_title) -
        getVideoDate(a.video_title)
    );

    setResults(groupedResults);
    setLoading(false);
  }

  function handleSearch(value = search) {
    const cleanSearch = value.trim();

    setSearch(cleanSearch);
    setSubmittedSearch(cleanSearch);

    if (cleanSearch) {
      setSearchHistory((current) => {
        const next = [
          cleanSearch,
          ...current.filter(
            (item) =>
              item.toLowerCase() !==
              cleanSearch.toLowerCase()
          ),
        ].slice(0, MAX_HISTORY);

        localStorage.setItem(
          "marshaSearchHistory",
          JSON.stringify(next)
        );

        return next;
      });
    }

    performSearch(cleanSearch);
  }

  async function handleRandomQuotes() {
    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("quotes")
      .select("text")
      .limit(1000);

    if (error || !data || data.length === 0) {
      setLoadError("couldn't find a random quote.");
      setLoading(false);
      return;
    }

    const words: string[] = [];

    for (const quote of data) {
      const matches =
        quote.text.match(
          /[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)?/gi
        ) || [];

      for (const word of matches) {
        if (word.length >= 3) {
          words.push(word.toLowerCase());
        }
      }
    }

    if (words.length === 0) {
      setLoadError("couldn't find a random quote.");
      setLoading(false);
      return;
    }

    const randomWord =
      words[Math.floor(Math.random() * words.length)];

    setSearch(randomWord);

    setSearchHistory((current) => {
      const next = [
        randomWord,
        ...current.filter(
          (item) =>
            item.toLowerCase() !==
            randomWord.toLowerCase()
        ),
      ].slice(0, MAX_HISTORY);

      localStorage.setItem(
        "marshaSearchHistory",
        JSON.stringify(next)
      );

      return next;
    });

    await performSearch(randomWord);
  }

  function clearHistory() {
    localStorage.removeItem("marshaSearchHistory");
    setSearchHistory([]);
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  return (
    <main className="min-h-screen bg-[#008080] p-2 font-[Tahoma,Arial,sans-serif] text-black sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="border-2 border-white bg-[#c0c0c0] shadow-[4px_4px_0px_#000]">
          <div className="flex h-8 items-center justify-between bg-gradient-to-r from-[#000080] to-[#1084d0] px-1">
            <div className="flex min-w-0 items-center gap-1.5 px-1 text-xs font-bold text-white">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-white bg-[#c0c0c0] text-[11px] text-black">
                💻
              </span>

              <span className="truncate">
                marsha_quotes.exe
              </span>
            </div>

            <div className="flex gap-1">
              <button
                aria-label="minimize"
                className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black"
              >
                _
              </button>

              <button
                aria-label="maximize"
                className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black"
              >
                □
              </button>

              <button
                aria-label="close"
                className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex h-7 items-center border-b border-gray-500 bg-[#c0c0c0] px-2 text-xs">
            <a
              href="/"
              className="underline-offset-2 hover:underline"
            >
              <u>H</u>ome
            </a>
          </div>

          <div className="bg-[#d4d0c8] p-2 sm:p-3">
            <section className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-2">
              <div className="flex flex-col items-center gap-2">
                <div className="w-full max-w-[150px]">
                  <img
                    src="/marsha.gif"
                    alt="marsha"
                    className="h-auto w-full object-cover"
                  />
                </div>

                <div className="w-full text-center">
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                    what did marsha say?
                  </h1>

                  <p className="mt-1.5 text-xs leading-relaxed text-gray-700">
                    search moments from her live streams
                  </p>

                  <p className="mt-1 text-[10px] text-gray-500">
                    (transcripts may not be perfect)
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-2 border-2 border-gray-500 border-t-white border-l-white bg-[#c0c0c0] p-2">
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <span>🔎</span>

                <span className="font-bold">
                  find a quote
                </span>
              </div>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder={
                  'search what she said... try "chipsy" or "kok gitu"'
                }
                className="w-full border-2 border-gray-700 border-r-white border-b-white bg-white px-2 py-1.5 text-xs text-black outline-none placeholder:text-gray-500 focus:bg-[#ffffee]"
              />

              <div className="mt-1 flex flex-col gap-1 sm:flex-row">
                <button
                  onClick={() => handleSearch()}
                  className="flex-1 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#c0c0c0] px-4 py-1.5 text-xs font-bold active:border-gray-700 active:border-r-white active:border-b-white"
                >
                  search
                </button>

                <button
                  onClick={handleRandomQuotes}
                  className="flex-1 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#d4d0c8] px-3 py-1.5 text-[10px] font-bold active:border-gray-700 active:border-r-white active:border-b-white"
                >
                  random quotes
                </button>
              </div>

              {searchHistory.length > 0 && (
                <div className="mt-2 border-t border-gray-500 pt-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-gray-700">
                    <span>search history</span>

                    <button
                      onClick={clearHistory}
                      className="font-normal text-gray-600 underline hover:text-black"
                    >
                      clear
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {searchHistory.map((item) => (
                      <button
                        key={item}
                        onClick={() => {
                          setSearch(item);
                          handleSearch(item);
                        }}
                        className="max-w-full truncate border border-gray-500 bg-[#e8e8e8] px-2 py-1 text-[10px] text-black hover:bg-white"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="mt-2">
              {submittedSearch.trim() === "" ? (
                <div />
              ) : loading ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm">
                  searching...
                </div>
              ) : loadError ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm">
                  {loadError}

                  <div className="mt-1 text-[10px] text-gray-600">
                    refresh the page and try again.
                  </div>
                </div>
              ) : results.length === 0 ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm">
                  no quotes found.
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((video) => (
                    <div
                      key={video.video_id}
                      className="border-2 border-gray-600 border-t-white border-l-white bg-[#c0c0c0] p-1.5"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 bg-[#000080] px-2 py-1 text-[10px] font-bold text-white">
                        <span className="min-w-0 truncate">
                          📺 {video.video_title}
                        </span>

                        <a
                          href={video.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 underline hover:text-yellow-300"
                        >
                          watch
                        </a>
                      </div>

                      <div className="flex flex-col gap-1.5">
  {activeQuote?.video_id === video.video_id && (
    <div className="relative w-full overflow-hidden border-2 border-gray-700 bg-black">
      <div
        ref={playerContainerRef}
        className="aspect-video w-full"
      />
    </div>
  )}

  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
    {activeQuote?.video_id !== video.video_id && (
      <a
        href={video.youtube_url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block aspect-video w-full max-w-[150px] shrink-0 overflow-hidden border-2 border-gray-700 border-r-white border-b-white bg-black sm:max-w-[155px]"
      >
        <img
          src={`https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`}
          alt=""
          className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]"
        />

        <div className="absolute inset-0 bg-black/10 transition group-hover:bg-black/20" />
      </a>
    )}

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between text-[9px] text-gray-600">
                            <span>
                              {video.matches.length} matching{" "}
                              {video.matches.length === 1
                                ? "moment"
                                : "moments"}
                            </span>

                            <span>
                              scroll to browse
                            </span>
                          </div>

                          <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                            {video.matches.map(
                              ({ quote, context }) => (
                                <button
  type="button"
  key={quote.id}
  onClick={() => setActiveQuote(quote)}
                                  className="group block w-full border-2 border-gray-500 border-t-white border-l-white bg-white p-1.5 text-left hover:bg-[#ffffe0]"
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="border border-gray-500 bg-[#e8e8e8] px-1.5 py-0.5 text-[9px] font-bold">
                                      {formatTime(
                                        quote.start_seconds
                                      )}
                                    </span>

                                    <span className="text-[9px] text-blue-800 underline">
                                      watch →
                                    </span>
                                  </div>

                                  <p className="text-[11px] leading-relaxed">
                                    “
                                    {highlightText(
                                      quote.text,
                                      submittedSearch
                                    )}
                                    ”
                                  </p>

                                  <p className="mt-1 text-[9px] leading-relaxed text-gray-600">
                                    {highlightText(
                                      context,
                                      submittedSearch
                                    )}
                                  </p>
                                </button>
                              )
                            )}
                          </div>
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
            <div className="font-bold">
              marsha quotes
            </div>

            <div className="mt-0.5">
              created by <a
  href="https://x.com/bnuratmaja"
  target="_blank"
  rel="noopener noreferrer"
  className="underline hover:text-yellow-300"
>
  @bnuratmaja
</a>
            </div>

            <div className="mt-1 text-[9px] text-gray-500">
              © 2026 • not affiliated with JKT48
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}