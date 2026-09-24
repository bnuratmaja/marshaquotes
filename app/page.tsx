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
    const monthName = namedMonthMatch[2].toLowerCase();

    return new Date(
      Number(namedMonthMatch[3]),
      monthNames[monthName],
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

function loadYouTubeIframeAPI(): Promise<void> {
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
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      const previousCallback =
        window.onYouTubeIframeAPIReady;

      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        resolve();
      };

      const fail = (error: Error) => {
        if (finished) {
          return;
        }

        finished = true;
        reject(error);
      };

      window.onYouTubeIframeAPIReady = () => {
        if (previousCallback) {
          previousCallback();
        }

        finish();
      };

      if (existingScript) {
        if (window.YT?.Player) {
          finish();
          return;
        }

        window.setTimeout(() => {
          if (window.YT?.Player) {
            finish();
          } else {
            fail(
              new Error(
                "Timed out loading YouTube Player API."
              )
            );
          }
        }, 10000);

        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://www.youtube.com/iframe_api";

      script.async = true;

      script.onerror = () => {
        fail(
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
  const total = Math.max(
    0,
    Math.floor(seconds)
  );

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(
    (total % 3600) / 60
  );
  const secs = total % 60;

  if (hours > 0) {
    return (
      String(hours) +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0")
    );
  }

  return (
    String(minutes) +
    ":" +
    String(secs).padStart(2, "0")
  );
}

function highlightText(
  text: string,
  searchTerm: string
) {
  const cleanSearch = searchTerm.trim();

  if (!cleanSearch) {
    return text;
  }

  const words = cleanSearch
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return text;
  }

  const escapedWords = words.map((word) =>
    word.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )
  );

  const pattern = new RegExp(
    "(" + escapedWords.join("|") + ")",
    "gi"
  );

  return text.split(pattern).map(
    (part, index) => {
      const isMatch = words.some(
        (word) =>
          part.toLowerCase() ===
          word.toLowerCase()
      );

      if (isMatch) {
        return (
          <mark
            key={index}
            className="bg-yellow-300 px-0.5 text-black"
          >
            {part}
          </mark>
        );
      }

      return part;
    }
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] =
    useState("");

  const [searchHistory, setSearchHistory] =
    useState<string[]>([]);

  const [results, setResults] =
    useState<VideoResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [activeQuote, setActiveQuote] =
    useState<Quote | null>(null);

  const [flagQuote, setFlagQuote] =
    useState<Quote | null>(null);

  const [flagReason, setFlagReason] =
    useState("");

  const [flagSending, setFlagSending] =
    useState(false);

  const [flagSubmitted, setFlagSubmitted] =
    useState(false);

  const [embedStatus, setEmbedStatus] =
    useState<
      "loading" | "playing" | "blocked" | "error"
    >("loading");

  const playerContainerRef =
    useRef<HTMLDivElement | null>(null);

  const playerRef = useRef<{
    destroy: () => void;
  } | null>(null);
const flagConfirmationRef =
  useRef<HTMLDivElement | null>(null);
  const searchRequestRef = useRef(0);
  const playerRequestRef = useRef(0);

  useEffect(() => {
    const savedHistory =
      localStorage.getItem(
        "marshaSearchHistory"
      );

    if (!savedHistory) {
      return;
    }

    try {
      const parsed = JSON.parse(savedHistory);

      if (Array.isArray(parsed)) {
        setSearchHistory(
          parsed.slice(0, MAX_HISTORY)
        );
      }
    } catch {
      localStorage.removeItem(
        "marshaSearchHistory"
      );
    }
  }, []);
useEffect(() => {
  if (!flagSubmitted) {
    return;
  }

  const timer = window.setTimeout(() => {
    const element =
      flagConfirmationRef.current;

    if (!element) {
      return;
    }

    /*
     * Mobile only.
     */
    if (window.innerWidth >= 640) {
      return;
    }

    /*
     * Find the nearest scrollable parent.
     */
    let parent =
      element.parentElement;

    while (parent) {
      if (
        parent.scrollHeight >
        parent.clientHeight
      ) {
        parent.scrollTo({
          top:
            element.offsetTop -
            parent.clientHeight / 2 +
            element.offsetHeight / 2,
          behavior: "smooth",
        });

        break;
      }

      parent = parent.parentElement;
    }

    /*
     * Also move the mobile page itself
     * so the confirmation is visible.
     */
    const rect =
      element.getBoundingClientRect();

    const pageTop =
      window.scrollY +
      rect.top -
      window.innerHeight / 2 +
      rect.height / 2;

    window.scrollTo({
      top: Math.max(0, pageTop),
      behavior: "smooth",
    });
  }, 300);

  return () => {
    window.clearTimeout(timer);
  };
}, [flagSubmitted]);
  useEffect(() => {
    const playerRequestId =
      playerRequestRef.current + 1;

    playerRequestRef.current =
      playerRequestId;

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

        if (
          cancelled ||
          playerRequestRef.current !==
            playerRequestId
        ) {
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
            // Ignore cleanup errors.
          }

          playerRef.current = null;
        }

        container.innerHTML = "";

        /*
         * Start one second before the transcript
         * result's start_seconds.
         */
        const timestamp = Math.max(
          0,
          Math.floor(
            selectedQuote.start_seconds
          ) - 1
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
                if (
                  cancelled ||
                  playerRequestRef.current !==
                    playerRequestId ||
                  playerRef.current !== player
                ) {
                  return;
                }

                setEmbedStatus("playing");
              },

              onError: (event) => {
                if (
                  cancelled ||
                  playerRequestRef.current !==
                    playerRequestId ||
                  playerRef.current !== player
                ) {
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
                    Math.floor(
                      selectedQuote.start_seconds
                    ) - 1
                  );

                  const youtubeUrl =
                    "https://www.youtube.com/watch?v=" +
                    selectedQuote.video_id +
                    "&t=" +
                    String(timestamp) +
                    "s";

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

        if (
          cancelled ||
          playerRequestRef.current !==
            playerRequestId
        ) {
          try {
            player.destroy();
          } catch {
            // Ignore cleanup errors.
          }

          return;
        }

        playerRef.current = player;
      } catch (error) {
        console.error(
          "YouTube player error:",
          error
        );

        if (
          !cancelled &&
          playerRequestRef.current ===
            playerRequestId
        ) {
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

  async function performSearch(
    value: string
  ) {
    const cleanSearch = value.trim();

    const requestId =
      searchRequestRef.current + 1;

    searchRequestRef.current =
      requestId;

    setSubmittedSearch(cleanSearch);
    setLoadError("");

    if (!cleanSearch) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } =
      await supabase.rpc(
        "search_quotes",
        {
          search_term: cleanSearch,
        }
      );

    if (
      requestId !==
      searchRequestRef.current
    ) {
      return;
    }

    if (error) {
      console.error(error);

      setResults([]);

      setLoadError(
        "couldn't search the transcript archive."
      );

      setLoading(false);

      return;
    }

    const grouped = new Map<
      string,
      VideoResult
    >();

    for (
      const quote of (data || []) as Quote[]
    ) {
      const existing =
        grouped.get(quote.video_id);

      const searchResult: SearchResult = {
        quote,
        context:
          quote.context || quote.text,
      };

      if (existing) {
        existing.matches.push(
          searchResult
        );
      } else {
        grouped.set(quote.video_id, {
          video_id: quote.video_id,
          video_title:
            quote.video_title ||
            "Marsha JKT48 Livestream",
          youtube_url:
            quote.youtube_url,
          matches: [searchResult],
        });
      }
    }

    const groupedResults =
      Array.from(grouped.values()).sort(
        (a, b) =>
          getVideoDate(
            b.video_title
          ) -
          getVideoDate(
            a.video_title
          )
      );

    if (
      requestId !==
      searchRequestRef.current
    ) {
      return;
    }

    setResults(groupedResults);
    setLoading(false);
  }

  function handleSearch(
    value = search
  ) {
    const cleanSearch = value.trim();

    /*
     * Remove the old selected video immediately.
     */
    setActiveQuote(null);
    setFlagQuote(null);
    setFlagReason("");
    setFlagSubmitted(false);

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

    void performSearch(cleanSearch);
  }

  async function handleRandomQuotes() {
    /*
     * Invalidate any existing search.
     */
    const requestId =
      searchRequestRef.current + 1;

    searchRequestRef.current =
      requestId;

    setActiveQuote(null);
    setFlagQuote(null);
    setFlagReason("");
    setFlagSubmitted(false);

    setLoading(true);
    setLoadError("");
    setSubmittedSearch("");

    const {
      data: latestRow,
      error: latestError,
    } = await supabase
      .from("quotes")
      .select("id")
      .order("id", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (
      requestId !==
      searchRequestRef.current
    ) {
      return;
    }

    if (latestError || !latestRow) {
      setLoadError(
        "couldn't find a random quote."
      );

      setLoading(false);

      return;
    }

    const maxId =
      Number(latestRow.id);

    const startId = Math.max(
      1,
      Math.floor(
        Math.random() *
          Math.max(
            1,
            maxId - 1000
          )
      )
    );

    const { data, error } =
      await supabase
        .from("quotes")
        .select(
          "id, video_id, text"
        )
        .order("id", {
          ascending: true,
        })
        .range(
          startId - 1,
          startId + 998
        );

    if (
      requestId !==
      searchRequestRef.current
    ) {
      return;
    }

    if (
      error ||
      !data ||
      data.length === 0
    ) {
      setLoadError(
        "couldn't find a random quote."
      );

      setLoading(false);

      return;
    }

    type QuoteRow = {
      id: number;
      video_id: string | null;
      text: string;
    };

    const rows =
      data as QuoteRow[];

    const wordRegex =
      /[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)?/gi;

    const stopWords =
      new Set([
        "yang",
        "dan",
        "atau",
        "dari",
        "untuk",
        "dengan",
        "ini",
        "itu",
        "aku",
        "kamu",
        "dia",
        "nya",
        "ada",
        "jadi",
        "kalau",
        "karena",
        "sudah",
        "lebih",
        "juga",
        "akan",
        "sama",
        "bisa",
        "banget",
        "nggak",
        "enggak",
        "gak",
        "ga",
      ]);

    for (
      let i = 0;
      i < rows.length;
      i++
    ) {
      if (
        requestId !==
        searchRequestRef.current
      ) {
        return;
      }

      const currentVideo =
        rows[i].video_id;

      if (!currentVideo) {
        continue;
      }

      const windowRows =
        rows.slice(i, i + 5);

      if (
        windowRows.length < 2 ||
        windowRows.some(
          (row) =>
            row.video_id !==
            currentVideo
        )
      ) {
        continue;
      }

      const words =
        new Set<string>();

      for (
        const row of windowRows
      ) {
        const matches =
          row.text.match(
            wordRegex
          ) || [];

        for (
          const word of matches
        ) {
          const normalized =
            word.toLowerCase();

          if (
            normalized.length >= 3 &&
            !stopWords.has(
              normalized
            )
          ) {
            words.add(
              normalized
            );
          }
        }
      }

      const availableWords =
        Array.from(words);

      if (
        availableWords.length < 2
      ) {
        continue;
      }

      for (
        let attempt = 0;
        attempt < 10;
        attempt++
      ) {
        if (
          requestId !==
          searchRequestRef.current
        ) {
          return;
        }

        const first =
          availableWords[
            Math.floor(
              Math.random() *
                availableWords.length
            )
          ];

        const remaining =
          availableWords.filter(
            (word) =>
              word !== first
          );

        if (
          remaining.length === 0
        ) {
          continue;
        }

        const second =
          remaining[
            Math.floor(
              Math.random() *
                remaining.length
            )
          ];

        const randomPair =
          first + " " + second;

        setSearch(randomPair);

        setSearchHistory(
          (current) => {
            const next = [
              randomPair,
              ...current.filter(
                (item) =>
                  item.toLowerCase() !==
                  randomPair.toLowerCase()
              ),
            ].slice(
              0,
              MAX_HISTORY
            );

            localStorage.setItem(
              "marshaSearchHistory",
              JSON.stringify(next)
            );

            return next;
          }
        );

        await performSearch(
          randomPair
        );

        return;
      }
    }

    if (
      requestId !==
      searchRequestRef.current
    ) {
      return;
    }

    setLoadError(
      "couldn't find a random quote."
    );

    setLoading(false);
  }

  async function handleFlagSubmit() {
    if (
      !flagQuote ||
      !flagReason.trim()
    ) {
      return;
    }

    setFlagSending(true);

    const { error } =
      await supabase
        .from("transcript_flags")
        .insert({
          video_id:
            flagQuote.video_id,
          text: flagQuote.text,
          reason:
            flagReason.trim(),
        });

    if (error) {
      console.error(
        "Could not submit flag:",
        error
      );

      alert(
        "Flag error: " +
          error.message
      );

      setFlagSending(false);

      return;
    }

    setFlagSending(false);
    setFlagSubmitted(true);
    setFlagReason("");
  }

  function openFlagForm(
    quote: Quote
  ) {
    setFlagQuote(quote);
    setFlagSubmitted(false);
    setFlagReason("");
  }

  function closeFlagForm() {
    setFlagQuote(null);
    setFlagReason("");
    setFlagSubmitted(false);
  }

  function clearHistory() {
    localStorage.removeItem(
      "marshaSearchHistory"
    );

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
        <div className="overflow-hidden border-2 border-white bg-[#c0c0c0] shadow-[5px_5px_0px_#000]">
          <div className="flex h-8 items-center justify-between bg-gradient-to-r from-[#000080] via-[#000080] to-[#1084d0] px-1">
            <div className="flex min-w-0 items-center gap-1.5 px-1 text-xs font-bold text-white">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-white bg-[#c0c0c0] text-[11px] text-black shadow-[1px_1px_0px_#000]">
                💻
              </span>

              <span className="truncate">
                marsha_quotes.exe
              </span>
            </div>

            <div className="flex gap-1">
              <button
                aria-label="minimize"
                className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black shadow-[1px_1px_0px_#000]"
              >
                _
              </button>

              <button
                aria-label="maximize"
                className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black shadow-[1px_1px_0px_#000]"
              >
                □
              </button>

              <button
                aria-label="close"
                className="flex h-6 w-6 items-center justify-center border-2 border-white border-r-gray-600 border-b-gray-600 bg-[#c0c0c0] text-xs font-bold text-black shadow-[1px_1px_0px_#000]"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex h-7 items-center border-b border-gray-500 bg-[#c0c0c0] px-2 text-xs">
            <a
              href="/"
              className="px-1.5 py-0.5 underline-offset-2 hover:bg-[#000080] hover:text-white"
            >
              <u>H</u>ome
            </a>
          </div>

          <div className="bg-[#d4d0c8] p-2 sm:p-3">
            <section className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-2 shadow-[1px_1px_0px_#808080]">
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-full max-w-[160px] border-2 border-gray-700 border-r-white border-b-white bg-black p-0.5">
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

                  <div className="mx-auto mt-2 h-px w-32 bg-gray-400" />

                  <p className="mt-2 text-xs leading-relaxed text-gray-700">
                    search moments from her live streams
                  </p>

                  <p className="mt-1 text-[10px] text-gray-500">
                    (transcripts may not be perfect)
                  </p>

                  <p className="mt-1 text-[9px] text-gray-500">
                    🚩 use the flag button to help improve incorrect transcriptions
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-2 border-2 border-gray-500 border-t-white border-l-white bg-[#c0c0c0] p-2 shadow-[1px_1px_0px_#808080]">
              <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span className="flex h-4 w-4 items-center justify-center bg-white text-[10px]">
                  🔎
                </span>

                <span className="font-bold">
                  find a quote
                </span>
              </div>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                onKeyDown={
                  handleKeyDown
                }
                placeholder={
                  'search what she said... try "chipsy" or "kok gitu"'
                }
                className="w-full border-2 border-gray-700 border-r-white border-b-white bg-white px-2.5 py-2 text-xs text-black outline-none placeholder:text-gray-500 focus:bg-[#ffffee]"
              />

              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() =>
                    handleSearch()
                  }
                  className="flex-1 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#c0c0c0] px-4 py-1.5 text-xs font-bold active:border-gray-700 active:border-r-white active:border-b-white"
                >
                  search
                </button>

                <button
                  onClick={
                    handleRandomQuotes
                  }
                  className="flex-1 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#d4d0c8] px-3 py-1.5 text-[10px] font-bold active:border-gray-700 active:border-r-white active:border-b-white"
                >
                  🎲 random quotes
                </button>
              </div>

              {searchHistory.length >
                0 && (
                <div className="mt-2 border-t border-gray-500 pt-2">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-gray-700">
                    <span>
                      search history
                    </span>

                    <button
                      onClick={
                        clearHistory
                      }
                      className="font-normal text-gray-600 underline hover:text-black"
                    >
                      clear
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {searchHistory.map(
                      (item) => (
                        <button
                          key={item}
                          onClick={() => {
                            setSearch(
                              item
                            );

                            handleSearch(
                              item
                            );
                          }}
                          className="max-w-full truncate border border-gray-500 bg-[#e8e8e8] px-2 py-1 text-[10px] text-black shadow-[1px_1px_0px_#808080] hover:bg-white"
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="mt-2">
              {submittedSearch.trim() ===
              "" ? (
                <div />
              ) : loading ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm shadow-[1px_1px_0px_#808080]">
                  <div className="font-bold">
                    searching...
                  </div>

                  <div className="mt-1 text-[10px] text-gray-600">
                    searching the transcript archive
                  </div>
                </div>
              ) : loadError ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm shadow-[1px_1px_0px_#808080]">
                  {loadError}

                  <div className="mt-1 text-[10px] text-gray-600">
                    refresh the page and try again.
                  </div>
                </div>
              ) : results.length ===
                0 ? (
                <div className="border-2 border-gray-500 border-t-white border-l-white bg-[#efefef] p-4 text-center text-sm shadow-[1px_1px_0px_#808080]">
                  no quotes found.
                </div>
              ) : (
                <div>
                  <div className="mb-1 flex items-center justify-between border-2 border-gray-600 border-t-white border-l-white bg-[#c0c0c0] px-2 py-1 text-[10px]">
                    <span className="font-bold">
                      search results
                    </span>

                    <span className="text-gray-600">
                      {results.length}{" "}
                      {results.length ===
                      1
                        ? "video"
                        : "videos"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {results.map(
                      (video) => (
                        <div
                          key={
                            video.video_id
                          }
                          className="border-2 border-gray-600 border-t-white border-l-white bg-[#c0c0c0] p-1.5 shadow-[1px_1px_0px_#808080]"
                        >
                          <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2 bg-[#000080] px-2 py-1 text-[10px] font-bold text-white">
                            <span className="min-w-0 truncate">
                              📺{" "}
                              {
                                video.video_title
                              }
                            </span>

                            <a
                              href={
                                video.youtube_url
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 underline hover:text-yellow-300"
                            >
                              watch
                            </a>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {activeQuote?.video_id ===
                              video.video_id && (
                              <div className="relative w-full overflow-hidden border-2 border-gray-700 bg-black shadow-[2px_2px_0px_#808080]">
                                <div
                                  ref={
                                    playerContainerRef
                                  }
                                  className="aspect-video w-full"
                                />
                              </div>
                            )}

                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                              {activeQuote?.video_id !==
                                video.video_id && (
                                <a
                                  href={
                                    video.youtube_url
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group relative block aspect-video w-full shrink-0 overflow-hidden border-2 border-gray-700 border-r-white border-b-white bg-black sm:max-w-[165px]"
                                >
                                  <img
                                    src={
                                      "https://i.ytimg.com/vi/" +
                                      video.video_id +
                                      "/hqdefault.jpg"
                                    }
                                    alt=""
                                    className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]"
                                  />

                                  <div className="absolute inset-0 bg-black/10 transition group-hover:bg-black/20" />
                                </a>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center justify-between text-[9px] text-gray-600">
                                  <span className="font-bold">
                                    🚩{" "}
                                    {
                                      video
                                        .matches
                                        .length
                                    }{" "}
                                    matching{" "}
                                    {video.matches
                                      .length ===
                                    1
                                      ? "moment"
                                      : "moments"}
                                  </span>

                                  <span>
                                    scroll to browse
                                  </span>
                                </div>

                                <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                                  {video.matches.map(
                                    ({
                                      quote,
                                      context,
                                    }) => (
                                      <div
                                        key={
                                          quote.id
                                        }
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActiveQuote(
                                              quote
                                            )
                                          }
                                          className={
  "group block w-full border-2 border-gray-500 border-t-white border-l-white p-2 text-left shadow-[1px_1px_0px_#808080] " +
  (flagQuote?.id === quote.id
    ? "bg-[#ffb0b0]"
    : activeQuote?.id === quote.id
      ? "bg-[#ffffe0]"
      : "bg-white hover:bg-[#ffffe0]")
}
                                        >
                                          <div className="mb-1.5 flex items-center justify-between gap-2">
                                            <span className="border border-gray-500 bg-[#e8e8e8] px-1.5 py-0.5 text-[9px] font-bold shadow-[1px_1px_0px_#808080]">
                                              {formatTime(
                                                quote.start_seconds
                                              )}
                                            </span>

                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] font-bold text-blue-800 underline">
                                                watch →
                                              </span>

                                              <span
                                                role="button"
                                                tabIndex={
                                                  0
                                                }
                                                onClick={(
                                                  e
                                                ) => {
                                                  e.stopPropagation();

                                                  openFlagForm(
                                                    quote
                                                  );
                                                }}
                                                onKeyDown={(
                                                  e
                                                ) => {
                                                  if (
                                                    e.key ===
                                                      "Enter" ||
                                                    e.key ===
                                                      " "
                                                  ) {
                                                    e.preventDefault();

                                                    e.stopPropagation();

                                                    openFlagForm(
                                                      quote
                                                    );
                                                  }
                                                }}
                                                className="cursor-pointer text-[9px] font-bold text-red-700 underline hover:text-red-900"
                                              >
                                                🚩 flag
                                              </span>
                                            </div>
                                          </div>

                                          <p className="text-[11px] font-bold leading-relaxed">
                                            “
                                            {highlightText(
                                              quote.text,
                                              submittedSearch
                                            )}
                                            ”
                                          </p>

                                          <div className="mt-1.5 border-t border-dotted border-gray-400 pt-1">
                                            <p className="text-[9px] leading-relaxed text-gray-600">
                                              {
                                                context
                                              }
                                            </p>
                                          </div>
                                        </button>

                                        {flagQuote?.id ===
                                          quote.id && (
                                          <div
  ref={
    flagSubmitted
      ? flagConfirmationRef
      : undefined
  }
  className="mt-1.5 border-2 border-gray-600 border-t-white border-l-white bg-[#efefef] p-3 shadow-[2px_2px_0px_#808080]"
>
                                            {!flagSubmitted ? (
                                              <>
                                                <div className="mb-2 text-[11px] font-bold">
                                                  what's wrong with this transcription?
                                                </div>

                                                <div className="mb-2 border-2 border-gray-500 border-r-white border-b-white bg-white p-2 text-[10px] text-gray-700">
                                                  “
                                                  {
                                                    flagQuote.text
                                                  }
                                                  ”
                                                </div>

                                                <textarea
                                                  value={
                                                    flagReason
                                                  }
                                                  onChange={(
                                                    e
                                                  ) =>
                                                    setFlagReason(
                                                      e
                                                        .target
                                                        .value
                                                    )
                                                  }
                                                  placeholder='tolong ganti kata "won bean" jadi "wonbin"'
                                                  rows={
                                                    3
                                                  }
                                                  className="w-full resize-none border-2 border-gray-700 border-r-white border-b-white bg-white px-2 py-1.5 text-[10px] text-black outline-none placeholder:text-gray-500 focus:bg-[#ffffee]"
                                                />

                                                <div className="mt-2 flex gap-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={
                                                      handleFlagSubmit
                                                    }
                                                    disabled={
                                                      flagSending ||
                                                      !flagReason.trim()
                                                    }
                                                    className="border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#c0c0c0] px-3 py-1.5 text-[10px] font-bold disabled:opacity-50"
                                                  >
                                                    {flagSending
                                                      ? "sending..."
                                                      : "send flag"}
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={
                                                      closeFlagForm
                                                    }
                                                    className="border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#d4d0c8] px-3 py-1.5 text-[10px] font-bold"
                                                  >
                                                    cancel
                                                  </button>
                                                </div>
                                              </>
                                            ) : (
                                              <div className="text-center">
                                                <div className="text-[11px] font-bold">
                                                  🚩 flag submitted
                                                </div>

                                                <div className="mt-1 text-[10px] text-gray-600">
                                                  thanks for helping improve the transcripts.
                                                </div>

                                                <div className="mt-1 text-[9px] text-gray-500">
                                                  (all reports need to be approved and changed manually)
                                                </div>

                                                <button
                                                  type="button"
                                                  onClick={
                                                    closeFlagForm
                                                  }
                                                  className="mt-2 border-2 border-white border-r-gray-700 border-b-gray-700 bg-[#c0c0c0] px-3 py-1.5 text-[10px] font-bold"
                                                >
                                                  close
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="min-h-6 border-t border-gray-500 bg-[#c0c0c0] px-2 py-1 text-[9px] text-gray-600">
            <span>
              {loading
                ? "Working..."
                : submittedSearch
                  ? "Search complete"
                  : ""}
            </span>
          </div>

          <footer className="border-t-2 border-gray-500 bg-[#c0c0c0] px-3 py-3 text-center text-[11px] text-gray-700">
            <div className="font-bold">
              marsha quotes
            </div>

            <div className="mt-0.5">
              created by{" "}
              <a
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