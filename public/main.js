// public/main.js
// Live search version (no search button). Debounced input, Enter triggers immediate search.

(async function() {
  // Parse client init (public keys)
  Parse.initialize("gH0Ry12pUmKdlIWwjbDtN5T8lCkoZnfD6Xp9rvoq","bSh7EVVqy3oQMUup6qDZQBVax28RmVeGgE92tMlp");
  Parse.serverURL = "https://parseapi.back4app.com/";

  const TMDB_API_KEY = "1070730380f5fee0d87cf0382670b255";
  const VAPID_PUBLIC = "BC-LY0azo2sZzvZ4ZoQnZwnpLpIwhrOFsDTQ9YbiuSdWLNqKQYdNGmMM9Am6IH-Zd9rBPg7gcXOEYiFyNsz2Fh8";

  // DOM refs
  const gallery = document.getElementById("gallery");
  const searchInput = document.getElementById("searchInput");
  const genreSelect = document.getElementById("genreSelect");
  const yearSelect = document.getElementById("yearSelect");
  const globalSubscribeBtn = document.getElementById("globalSubscribeBtn");
  const testNotifyBtn = document.getElementById("testNotifyBtn");
  const statusBar = document.getElementById("statusBar");
  const initialLoader = document.getElementById("initialLoader");

  function setStatus(text, isError) {
    if (!statusBar) return;
    statusBar.textContent = text || "";
    statusBar.classList.toggle("error", !!isError);
  }

  function showLoader(message) {
    if (!gallery) return;
    gallery.innerHTML = `<div class="loader"><div class="spinner" aria-hidden="true"></div><div>${message}</div></div>`;
  }

  async function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // SERVICE WORKER & SUBSCRIBE
  async function registerServiceWorkerAndSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert("Push not supported in this browser. (iOS Safari requires iOS 16.4+)");
      throw new Error("Push not supported");
    }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered at', reg.scope);
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          const res = await Parse.Cloud.run("registerSubscriptionSafe", { subscription: sub.toJSON() });
          console.log('registerSubscriptionSafe (existing):', res);
          if (res && res.status === "ok") setStatus("Subscription confirmed: " + res.action, false);
          else setStatus("Server registration issue: " + (res && res.message ? res.message : JSON.stringify(res)), true);
        } catch (err) {
          console.error("registerSubscriptionSafe error:", err);
          setStatus("Server registration RPC failed", true);
        }
        return sub;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus("Notification permission denied", true);
        throw new Error("Notification permission denied");
      }

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: await urlBase64ToUint8Array(VAPID_PUBLIC)
      });
      console.log('New subscription', sub.toJSON());
      try {
        const res = await Parse.Cloud.run("registerSubscriptionSafe", { subscription: sub.toJSON() });
        console.log('registerSubscriptionSafe response:', res);
        if (res && res.status === "ok") setStatus("Subscribed and saved on server", false);
        else setStatus("Server save failed: " + (res && res.message ? res.message : JSON.stringify(res)), true);
      } catch (err) {
        console.error("registerSubscriptionSafe failed:", err);
        setStatus("Server registration RPC failed", true);
      }
      return sub;
    } catch (err) {
      console.error("Subscription error:", err);
      setStatus("Service worker / subscribe error", true);
      throw err;
    }
  }

  async function getCurrentSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return null;
      return await reg.pushManager.getSubscription();
    } catch (e) {
      console.warn("getCurrentSubscription failed:", e);
      return null;
    }
  }

  // FOLLOW / UNFOLLOW
  async function followShowForCurrentSubscription(showId, showName, media_type) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      let sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) sub = await registerServiceWorkerAndSubscribe();
      if (!sub) throw new Error("Subscription required to follow");
      const endpoint = sub.endpoint;
      const res = await Parse.Cloud.run("followShow", { endpoint, showId: String(showId), showName, media_type });
      return res;
    } catch (err) {
      console.error("followShow error:", err);
      throw err;
    }
  }

  async function unfollowShowForCurrentSubscription(showId) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) throw new Error("No subscription found; please subscribe first.");
      const endpoint = sub.endpoint;
      try {
        const res = await Parse.Cloud.run("unfollowShow", { endpoint, showId: String(showId) });
        return res;
      } catch (err) {
        const msg = err && err.message ? err.message : JSON.stringify(err);
        if (msg.toLowerCase().includes("invalid function")) {
          alert('Server function "unfollowShow" not found. Deploy the Cloud Code that includes unfollowShow.');
        } else {
          alert('Error calling unfollowShow: ' + msg);
        }
        throw err;
      }
    } catch (err) {
      console.error("unfollowShow error:", err);
      throw err;
    }
  }

  async function getFollowedShowsForCurrentSubscription() {
    try {
      const sub = await getCurrentSubscription();
      if (!sub) return { followedShowIds: [], followedShowsMeta: {} };
      return await Parse.Cloud.run("getFollowedShowsForEndpoint", { endpoint: sub.endpoint });
    } catch (err) {
      console.warn("getFollowedShowsForCurrentSubscription failed:", err);
      return { followedShowIds: [], followedShowsMeta: {} };
    }
  }

  // bell SVGs
  function bellSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15.73 8.39a4 4 0 10-7.46 0c0 7-3 7-3 7h13s-3-0-3-7"></path><path d="M13.73 21a2 2 0 01-3.46 0"></path></svg>`;
  }
  function bellFilledSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="currentColor" stroke="none"><path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"/><path d="M18 8a6 6 0 10-12 0v4l-2 2v1h16v-1l-2-2V8z"/></svg>`;
  }

  // Render results (non-blocking)
  async function renderResults(items) {
    try {
      gallery.innerHTML = "";
      const followedResp = await getFollowedShowsForCurrentSubscription();
      const followed = (followedResp && followedResp.followedShowIds) ? followedResp.followedShowIds : [];

      if (!items || items.length === 0) {
        gallery.innerHTML = `<div style="padding:20px;color:var(--muted)">No results.</div>`;
        return;
      }

      for (const i of items) {
        const poster = i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : '';
        const card = document.createElement("div");
        card.className = "card glass";
        if (poster) card.style.backgroundImage = `linear-gradient(180deg, rgba(9,2,18,0.36), rgba(9,2,18,0.12)), url(${poster})`;

        const meta = document.createElement("div");
        meta.className = "meta";

        const left = document.createElement("div");
        left.className = "left";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = i.title || i.name || "Unknown";
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = `${i.media_type || (i.first_air_date ? 'tv' : 'movie')} • ${i.vote_average || '—'}`;
        left.appendChild(title);
        left.appendChild(sub);

        const followBtn = document.createElement("button");
        followBtn.className = "followBtn";
        const showId = i.id;
        const isFollowed = followed.includes(String(showId));
        followBtn.dataset.followed = isFollowed ? "1" : "0";
        followBtn.title = isFollowed ? "Unfollow" : "Follow";
        followBtn.setAttribute("aria-label", followBtn.title);
        followBtn.innerHTML = isFollowed ? bellFilledSVG() : bellSVG();

        followBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          followBtn.disabled = true;
          try {
            if (followBtn.dataset.followed === "0") {
              const res = await followShowForCurrentSubscription(showId, i.title || i.name, i.media_type || 'tv');
              if (res && res.nextEpisode) {
                setStatus(`Following ${i.title || i.name} — next ep: S${res.nextEpisode.season}E${res.nextEpisode.episode} airs ${res.nextEpisode.air_date}`, false);
              } else {
                setStatus(`Following ${i.title || i.name}. No scheduled next episode found or push not sent.`, false);
              }
              followBtn.dataset.followed = "1";
              followBtn.innerHTML = bellFilledSVG();
            } else {
              try {
                await unfollowShowForCurrentSubscription(showId);
                setStatus(`Unfollowed ${i.title || i.name}`, false);
                followBtn.dataset.followed = "0";
                followBtn.innerHTML = bellSVG();
              } catch (err) {
                // error handled inside unfollowShowForCurrentSubscription
              }
            }
          } catch (err) {
            console.error("Follow toggle error:", err);
            alert("Error updating follow status: " + (err && err.message ? err.message : JSON.stringify(err)));
          } finally {
            followBtn.disabled = false;
          }
        });

        meta.appendChild(left);
        meta.appendChild(followBtn);
        card.appendChild(meta);
        gallery.appendChild(card);
      }
    } catch (err) {
      console.error("renderResults error:", err);
      gallery.innerHTML = `<div style="padding:18px;color:#ff8b8b">Rendering error — reload the page.</div>`;
    }
  }

  // Populate years
  (function populateYears(){
    const now = new Date().getFullYear();
    for (let y = now; y >= 1950; y--) {
      const o = document.createElement("option"); o.value = y; o.textContent = y; yearSelect.appendChild(o);
    }
  })();

  // Load genres
  async function loadGenres() {
    try {
      const [m, t] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`).then(r => r.json()).catch(() => null),
        fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${TMDB_API_KEY}&language=en-US`).then(r => r.json()).catch(() => null)
      ]);
      const map = new Map();
      (m && m.genres || []).forEach(g => map.set(g.id, g.name));
      (t && t.genres || []).forEach(g => map.set(g.id, g.name));
      for (const [id, name] of map.entries()) {
        const o = document.createElement("option"); o.value = id; o.textContent = name; genreSelect.appendChild(o);
      }
    } catch (e) {
      console.warn("loadGenres error:", e);
    }
  }

  // Search TMDB
  async function searchTMDB(query, genre, year) {
    try {
      let url;
      if (query && query.trim().length > 0) {
        url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(query)}&page=1&include_adult=false`;
      } else {
        url = `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
      }
      const res = await fetch(url, { cache: "no-store", mode: "cors" });
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      const data = await res.json();
      let results = data && data.results ? data.results : [];
      if (genre) results = results.filter(r => (r.genre_ids || []).includes(parseInt(genre)));
      if (year) results = results.filter(r => {
        const y = (r.media_type === "movie" ? r.release_date : r.first_air_date) || "";
        return y.startsWith(String(year));
      });
      return results;
    } catch (err) {
      console.error("searchTMDB error:", err);
      setStatus("Search failed — network or TMDB issue", true);
      return [];
    }
  }

  // DEBOUNCE live search
  let liveTimer = null;
  const DEBOUNCE_MS = 400;

  async function doSearchImmediate() {
    if (!searchInput) return;
    const q = searchInput.value;
    const g = genreSelect.value;
    const y = yearSelect.value;
    setStatus("", false);
    showLoader("Searching...");
    const res = await searchTMDB(q, g, y);
    await renderResults(res);
  }

  function scheduleLiveSearch() {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      doSearchImmediate().catch(e => console.error("live search failed:", e));
    }, DEBOUNCE_MS);
  }

  // Attach input + select handlers for live search
  function attachLiveSearchHandlers() {
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        scheduleLiveSearch();
      }, { passive: true });
      // Enter key immediate
      searchInput.addEventListener("keydown", (ev) => {
        const key = ev.key || ev.keyIdentifier || ev.keyCode;
        if (key === "Enter" || key === "Return" || key === 13 || key === "13") {
          ev.preventDefault();
          if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
          setTimeout(() => doSearchImmediate(), 0);
        }
      }, { passive: false });
    }
    if (genreSelect) genreSelect.addEventListener("change", () => { scheduleLiveSearch(); });
    if (yearSelect) yearSelect.addEventListener("change", () => { scheduleLiveSearch(); });
  }

  // Wire subscribe/test buttons
  globalSubscribeBtn.addEventListener("click", async () => {
    try {
      await registerServiceWorkerAndSubscribe();
    } catch (err) {
      console.error("Subscribe failed:", err);
    }
  });

  testNotifyBtn.addEventListener("click", async () => {
    testNotifyBtn.disabled = true;
    try {
      let sub = await getCurrentSubscription();
      if (!sub) sub = await registerServiceWorkerAndSubscribe();
      if (!sub) throw new Error("No subscription available.");
      const endpoint = sub.endpoint;
      const resp = await Parse.Cloud.run("sendTestPushForEndpoint", { endpoint, title: "Test Alert", body: "This is a test push from the site." });
      if (resp && resp.status === 'sent') setStatus("Test push sent", false);
      else setStatus("Test push failed: " + JSON.stringify(resp), true);
    } catch (err) {
      console.error("Test push failed:", err);
      setStatus("Test push failed", true);
    } finally {
      testNotifyBtn.disabled = false;
    }
  });

  // Init: attach handlers and load initial results
  (async function init() {
    try {
      setStatus("Loading…", false);
      initialLoader && (initialLoader.style.display = "flex");
      attachLiveSearchHandlers();
      await loadGenres();
      // show trending initially
      const trending = await searchTMDB("", "", "");
      await renderResults(trending.slice(0, 24));
      setStatus("", false);
    } catch (e) {
      console.error("Init error:", e);
      gallery.innerHTML = `<div style="padding:18px;color:#ff8b8b">Failed to load content. Try refreshing.</div>`;
      setStatus("Initialization failed — see console", true);
    } finally {
      initialLoader && (initialLoader.style.display = "none");
    }
  })();

})();
