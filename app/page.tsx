"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

type Quote = {
  id: number;
  text: string;
  video_id: string;
  video_title: string;
  youtube_url: string;
  start_seconds: number;
  end_seconds: number | null;
  context?: string;
};

type SearchResult = Quote & {
  context: string;
};

type VideoResult = {
  video_id: string;
  video_title: string;
  youtube_url: string;
  quotes: SearchResult[];
};

type ActiveVideo = {
  key: string;
  quote: SearchResult;
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

  const showroomMatch = text.match(
    /(\d{1,2})-(\d{1,2})-(\d{2})/
  );

  if (showroomMatch) {
    const day = Number(showroomMatch[1]);
    const month = Number(showroomMatch[2]) - 1;
    const year = 2000 + Number(showroomMatch[3]);

    return new Date(year, month, day).getTime();
  }

  return 0;
}

function getYoutubeUrl(
  quote: Pick<Quote, "youtube_url" | "start_seconds">
) {
  const baseUrl = quote.youtube_url.split("&")[0];
  const timestamp = Math.max(
    0,
    Math.floor(quote.start_seconds) - 1
  );

  return baseUrl + "&t=" + timestamp + "s";
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return (
      hours +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0")
    );
  }

  return (
    minutes +
    ":" +
    String(secs).padStart(2, "0")
  );
}

function highlightText(
  text: string,
  searchTerm: string
) {
  const cleanTerm = searchTerm.trim();

  if (!cleanTerm) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const lowerTerm = cleanTerm.toLowerCase();

  const pieces: React.ReactNode[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const foundIndex = lowerText.indexOf(
      lowerTerm,
      currentIndex
    );

    if (foundIndex === -1) {
      pieces.push(
        <span key={currentIndex}>
          {text.slice(currentIndex)}
        </span>
      );
      break;
    }

    if (foundIndex > currentIndex) {
      pieces.push(
        <span key={currentIndex}>
          {text.slice(
            currentIndex,
            foundIndex
          )}
        </span>
      );
    }

    pieces.push(
      <mark
        key={foundIndex}
        className="bg-yellow-300 px-0.5 text-black"
      >
        {text.slice(
          foundIndex,
          foundIndex + cleanTerm.length
        )}
      </mark>
    );

    currentIndex =
      foundIndex + cleanTerm.length;
  }

  return pieces;
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
        const timeout = window.setTimeout(
          () => {
            if (!window.YT?.Player) {
              reject(
                new Error(
                  "Timed out loading YouTube Player API."
                )
              );
            }
          },
          10000
        );

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

export default function Home() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] =
    useState("");

  const [searchHistory, setSearchHistory] =
    useState<string[]>([]);

  const [results, setResults] = useState<
    VideoResult[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [activeVideo, setActiveVideo] =
    useState<ActiveVideo | null>(null);

  const [embedStatus, setEmbedStatus] = useState<
    "loading" | "playing" | "blocked" | "error"
  >("loading");

  const playerContainerRef =
    useRef<HTMLDivElement | null>(null);

  const playerRef = useRef<{
    destroy: () => void;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(
        "marsha-search-history"
      );

      if (stored) {
        const parsed = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          setSearchHistory(
            parsed
              .filter(
                (item): item is string =>
                  typeof item === "string"
              )
              .slice(0, MAX_HISTORY)
          );
        }
      }
    } catch {
      // Ignore invalid local storage.
    }
  }, []);

  useEffect(() => {
    if (!activeVideo) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Player may already be destroyed.
        }

        playerRef.current = null;
      }

      return;
    }

    const selectedVideo = activeVideo;
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

        const quote = selectedVideo.quote;

        const timestamp = Math.max(
          0,
          Math.floor(quote.start_seconds) - 1
        );

        const player = new YT.Player(
          container,
          {
            videoId: quote.video_id,

            playerVars: {
              autoplay: 1,
              rel: 0,
              playsinline: 1,
              start: timestamp,
              origin: window.location.origin,
            },

            events: {
              onReady: () => {
                if (cancelled) {
                  return;
                }

                setEmbedStatus("playing");
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
                  event.data === 150 ||
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
  }, [activeVideo]);

  async function performSearch(value: string) {
    const cleanSearch = value.trim();

    if (!cleanSearch) {
      setResults([]);
      setSubmittedSearch("");
      setLoadError("");
      return;
    }

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase.rpc(
      "search_quotes",
      {
        search_term: cleanSearch,
      }
    );

    if (error) {
      console.error(error);

      setResults([]);
      setLoadError(
        "something went wrong while searching."
      );
      setLoading(false);

      return;
    }

    const rows = (data ?? []) as SearchResult[];

    const grouped = new Map<
      string,
      VideoResult
    >();

    for (const quote of rows) {
      if (!quote.video_id) {
        continue;
      }

      const existing = grouped.get(
        quote.video_id
      );

      if (existing) {
        existing.quotes.push(quote);
      } else {
        grouped.set(quote.video_id, {
          video_id: quote.video_id,
          video_title: quote.video_title,
          youtube_url: quote.youtube_url,
          quotes: [quote],
        });
      }
    }

    const groupedResults = Array.from(
      grouped.values()
    ).sort((a, b) => {
      const dateDifference =
        getVideoDate(b.video_title) -
        getVideoDate(a.video_title);

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return (
        (b.quotes[0]?.id ?? 0) -
        (a.quotes[0]?.id ?? 0)
      );
    });

    setResults(groupedResults);
    setSubmittedSearch(cleanSearch);
    setLoading(false);
  }

  function handleSearch(
    event?: React.FormEvent
  ) {
    event?.preventDefault();

    const cleanSearch = search.trim();

    if (!cleanSearch) {
      setResults([]);
      setSubmittedSearch("");
      return;
    }

    const nextHistory = [
      cleanSearch,
      ...searchHistory.filter(
        (item) =>
          item.toLowerCase() !==
          cleanSearch.toLowerCase()
      ),
    ].slice(0, MAX_HISTORY);

    setSearchHistory(nextHistory);

    try {
      localStorage.setItem(
        "marsha-search-history",
        JSON.stringify(nextHistory)
      );
    } catch {
      // Ignore local storage errors.
    }

    performSearch(cleanSearch);
  }

  async function handleRandomQuotes() {
    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("quotes")
      .select(
        "id,text,video_id,video_title,youtube_url,start_seconds,end_seconds"
      )
      .limit(1000);

    if (error) {
      console.error(error);

      setLoadError(
        "couldn't get a random quote."
      );

      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Quote[];

    if (!rows.length) {
      setLoadError(
        "there aren't any quotes yet."
      );

      setLoading(false);
      return;
    }

    const words = rows
      .flatMap((quote) =>
        quote.text
          .replace(
            /[^\p{L}\p{N}\s]/gu,
            " "
          )
          .split(/\s+/)
          .map((word) => word.trim())
          .filter(
            (word) => word.length >= 3
          )
      );

    if (!words.length) {
      setLoadError(
        "couldn't find a random word."
      );

      setLoading(false);
      return;
    }

    const randomWord =
      words[
        Math.floor(
          Math.random() * words.length
        )
      ];

    setSearch(randomWord);

    const nextHistory = [
      randomWord,
      ...searchHistory.filter(
        (item) =>
          item.toLowerCase() !==
          randomWord.toLowerCase()
      ),
    ].slice(0, MAX_HISTORY);

    setSearchHistory(nextHistory);

    try {
      localStorage.setItem(
        "marsha-search-history",
        JSON.stringify(nextHistory)
      );
    } catch {
      // Ignore local storage errors.
    }

    await performSearch(randomWord);
  }

  function openVideo(quote: SearchResult) {
    setActiveVideo({
      key:
        quote.video_id +
        "-" +
        quote.id +
        "-" +
        Date.now(),
      quote,
    });
  }

  function closePlayer() {
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // Ignore cleanup errors.
      }

      playerRef.current = null;
    }

    setActiveVideo(null);
  }

  function clearHistory() {
    setSearchHistory([]);

    try {
      localStorage.removeItem(
        "marsha-search-history"
      );
    } catch {
      // Ignore local storage errors.
    }
  }

  return (
    <main className="min-h-screen bg-[#008080] p-3 font-mono text-black sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="border-2 border-white bg-[#c0c0c0] shadow-[4px_4px_0_#000]">
          <div className="flex items-center justify-between bg-[#000080] px-2 py-1 text-sm font-bold text-white">
            <div className="flex items-center gap-1">
              <span>💻</span>
              <span>marsha quotes</span>
            </div>

            <div className="flex gap-1">
              <span className="flex h-4 w-4 items-center justify-center bg-[#c0c0c0] text-xs text-black">
                _
              </span>

              <span className="flex h-4 w-4 items-center justify-center bg-[#c0c0c0] text-xs text-black">
                □
              </span>

              <span className="flex h-4 w-4 items-center justify-center bg-[#c0c0c0] text-xs text-black">
                ×
              </span>
            </div>
          </div>

          <div className="border-b-2 border-gray-500 bg-[#c0c0c0] p-4">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="w-full max-w-[150px]">
                <img
                  src="/marsha.gif"
                  alt="marsha"
                  className="h-auto w-full object-cover"
                />
              </div>

              <div className="text-center sm:text-left">
                <h1 className="text-3xl font-bold tracking-tight">
                  marsha quotes
                </h1>

                <p className="mt-1 text-sm">
                  search through marsha&apos;s
                  livestream transcripts
                </p>

                <p className="mt-2 text-xs">
                  click a moment to watch it
                  directly from that part
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#c0c0c0] p-4">
            <form
              onSubmit={handleSearch}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={
                  'search what she said... try "chipsy" or "kok gitu"'
                }
                className="min-w-0 flex-1 border-2 border-gray-600 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#000080]"
              />

              <button
                type="submit"
                disabled={loading}
                className="border-2 border-white bg-[#c0c0c0] px-5 py-2 text-sm font-bold shadow-[2px_2px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
              >
                {loading
                  ? "searching..."
                  : "search"}
              </button>

              <button
                type="button"
                onClick={handleRandomQuotes}
                disabled={loading}
                className="border-2 border-white bg-[#c0c0c0] px-5 py-2 text-sm font-bold shadow-[2px_2px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
              >
                random
              </button>
            </form>

            {searchHistory.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold">
                  recent:
                </span>

                {searchHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setSearch(item);
                      performSearch(item);
                    }}
                    className="border border-gray-600 bg-white px-2 py-1 underline"
                  >
                    {item}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={clearHistory}
                  className="px-2 py-1 text-red-700 underline"
                >
                  clear
                </button>
              </div>
            )}
          </div>

          <div className="border-t-2 border-gray-500 bg-white p-4">
            {loadError && (
              <div className="mb-4 border-2 border-red-700 bg-red-100 p-3 text-sm text-red-800">
                {loadError}
              </div>
            )}

            {!loading &&
              submittedSearch &&
              results.length === 0 &&
              !loadError && (
                <div className="border-2 border-gray-500 bg-[#eeeeee] p-4 text-sm">
                  no results for{" "}
                  <strong>
                    &quot;{submittedSearch}&quot;
                  </strong>
                  .
                </div>
              )}

            {!loading &&
              results.length > 0 && (
                <div className="mb-4 text-sm">
                  found{" "}
                  <strong>
                    {results.reduce(
                      (total, video) =>
                        total + video.quotes.length,
                      0
                    )}
                  </strong>{" "}
                  matching moments across{" "}
                  <strong>
                    {results.length}
                  </strong>{" "}
                  videos.
                </div>
              )}

            <div className="space-y-5">
              {results.map((video) => (
                <section
                  key={video.video_id}
                  className="border-2 border-gray-600 bg-[#eeeeee]"
                >
                  <div className="flex flex-col gap-2 border-b-2 border-gray-600 bg-[#d0d0d0] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-bold">
                        {video.video_title}
                      </h2>

                      <div className="mt-1 text-xs text-gray-700">
                        {video.quotes.length}{" "}
                        matching{" "}
                        {video.quotes.length ===
                        1
                          ? "moment"
                          : "moments"}
                      </div>
                    </div>

                    <a
                      href={video.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs underline"
                    >
                      watch ↗
                    </a>
                  </div>

                  <div className="divide-y divide-gray-400">
                    {video.quotes.map(
                      (quote) => (
                        <div
                          key={quote.id}
                          className="flex gap-3 p-3"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              openVideo(quote)
                            }
                            className="shrink-0 self-start border-2 border-gray-600 bg-[#c0c0c0] px-2 py-1 text-xs font-bold shadow-[2px_2px_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                          >
                            {formatTime(
                              quote.start_seconds
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openVideo(quote)
                            }
                            className="min-w-0 flex-1 text-left text-sm"
                          >
                            <div className="font-bold">
                              {highlightText(
                                quote.text,
                                submittedSearch
                              )}
                            </div>

                            <div className="mt-1 text-xs text-gray-700">
                              {highlightText(
                                quote.context,
                                submittedSearch
                              )}
                            </div>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </section>
              ))}
            </div>

            {!loading &&
              !submittedSearch &&
              results.length === 0 && (
                <div className="py-10 text-center text-sm">
                  <p className="font-bold">
                    search something marsha said
                  </p>

                  <p className="mt-2 text-xs text-gray-600">
                    try a word, phrase, or use
                    random.
                  </p>
                </div>
              )}
          </div>

          <div className="border-t-2 border-gray-500 bg-[#c0c0c0] px-3 py-2 text-center text-xs">
            marsha quotes
            <span className="mx-2">
              •
            </span>
            created by @bnuratmaja
          </div>
        </div>
      </div>

      {activeVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="w-full max-w-4xl border-2 border-white bg-[#c0c0c0] shadow-[6px_6px_0_#000]">
            <div className="flex items-center justify-between bg-[#000080] px-2 py-1 text-sm font-bold text-white">
              <span className="truncate pr-3">
                {activeVideo.quote.video_title}
              </span>

              <button
                type="button"
                onClick={closePlayer}
                className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#c0c0c0] text-xs text-black"
              >
                ×
              </button>
            </div>

            <div className="p-3">
              {embedStatus ===
                "blocked" && (
                <div className="border-2 border-gray-600 bg-white p-6 text-center">
                  <p className="text-lg font-bold">
                    this video can&apos;t be
                    played here
                  </p>

                  <p className="mt-2 text-sm">
                    embedding is disabled for
                    this video.
                  </p>

                  <a
                    href={getYoutubeUrl(
                      activeVideo.quote
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block border-2 border-white bg-[#c0c0c0] px-4 py-2 text-sm font-bold underline shadow-[2px_2px_0_#000]"
                  >
                    watch on YouTube ↗
                  </a>

                  <div>
                    <button
                      type="button"
                      onClick={closePlayer}
                      className="mt-4 text-xs underline"
                    >
                      close
                    </button>
                  </div>
                </div>
              )}

              {embedStatus ===
                "error" && (
                <div className="border-2 border-gray-600 bg-white p-6 text-center">
                  <p className="text-lg font-bold">
                    this video can&apos;t be
                    played here
                  </p>

                  <p className="mt-2 text-sm">
                    try watching it directly
                    on YouTube.
                  </p>

                  <a
                    href={getYoutubeUrl(
                      activeVideo.quote
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block border-2 border-white bg-[#c0c0c0] px-4 py-2 text-sm font-bold underline shadow-[2px_2px_0_#000]"
                  >
                    watch on YouTube ↗
                  </a>

                  <div>
                    <button
                      type="button"
                      onClick={closePlayer}
                      className="mt-4 text-xs underline"
                    >
                      close
                    </button>
                  </div>
                </div>
              )}

              {embedStatus !==
                "blocked" &&
                embedStatus !== "error" && (
                  <>
                    <div className="aspect-video w-full bg-black">
                      <div
                        ref={
                          playerContainerRef
                        }
                        className="h-full w-full"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 border-x-2 border-b-2 border-gray-600 bg-white px-3 py-2 text-xs">
                      <span>
                        {embedStatus ===
                        "loading"
                          ? "loading video..."
                          : "playing from " +
                            formatTime(
                              Math.max(
                                0,
                                Math.floor(
                                  activeVideo
                                    .quote
                                    .start_seconds
                                ) - 1
                              )
                            )}
                      </span>

                      <button
                        type="button"
                        onClick={closePlayer}
                        className="underline"
                      >
                        close
                      </button>
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
