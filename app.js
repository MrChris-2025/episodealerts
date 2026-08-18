// Initialize Back4App Parse SDK
Parse.initialize("gH0Ry12pUmKdlIWwjbDtN5T8lCkoZnfD6Xp9rvoq", "bSh7EVVqy3oQMUup6qDZQBVax28RmVeGgE92tMlp");
Parse.serverURL = "https://parseapi.back4app.com/";

const TMDB_API_KEY = '1070730380f5fee0d87cf0382670b255';
const VAPID_PUBLIC_KEY = 'BC-LY0azo2sZzvZ4ZoQnZwnpLpIwhrOFsDTQ9YbiuSdWLNqKQYdNGmMM9Am6IH-Zd9rBPg7gcXOEYiFyNsz2Fh8'; // Must match backend VAPID public key


// Map TMDB genre IDs to human-readable string names for uniform client-side filtering
const TMDB_GENRE_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science-Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

let currentType = 'tv'; // 'tv' (TVmaze) or 'movie' (TMDB)
let currentPage = 1;
let totalPages = 1;
let fetchedItems = [];
let searchTimeout = null;

// On Page Load Initialization
document.addEventListener('DOMContentLoaded', () => {
  populateYearDropdown();
  registerServiceWorker();
  fetchMediaData();
});

// Populate Year Filter (Current Year back to 1980)
function populateYearDropdown() {
  const yearSelect = document.getElementById('yearSelect');
  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year >= 1980; year--) {
    const opt = document.createElement('option');
    opt.value = year;
    opt.textContent = year;
    yearSelect.appendChild(opt);
  }
}

// Switch Tab (TV Shows vs Movies)
function switchMediaType(type) {
  if (currentType === type) return;
  currentType = type;
  currentPage = 1;
  document.getElementById('searchInput').value = '';
  document.getElementById('genreSelect').value = '';
  document.getElementById('yearSelect').value = '';
  document.getElementById('tabTv').classList.toggle('active', type === 'tv');
  document.getElementById('tabMovie').classList.toggle('active', type === 'movie');
  fetchMediaData();
}

// Handle Live API Search Input (Debounced)
function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1; // Reset to page 1 on new search term
    fetchMediaData();
  }, 400);
}

// Fetch Media Items from TVmaze or TMDB APIs based on Page & Search Query
async function fetchMediaData() {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '<p style="color:#94a3b8; grid-column: 1/-1; text-align: center;">Loading media items...</p>';

  const query = document.getElementById('searchInput').value.trim();

  if (currentType === 'tv') {
    // TVmaze Logic
    try {
      let url = query 
        ? `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`
        : `https://api.tvmaze.com/shows?page=${currentPage - 1}`; // TVmaze is 0-indexed

      const response = await fetch(url);
      const data = await response.json();

      let itemsArray = query ? data.map(item => item.show) : data;

      fetchedItems = itemsArray.map(item => ({
        id: `tvmaze_${item.id}`,
        tvmazeId: item.id,
        title: item.name,
        image: item.image?.medium || item.image?.original || 'https://via.placeholder.com/210x295?text=No+Poster',
        year: item.premiered ? item.premiered.split('-')[0] : 'N/A',
        genres: item.genres || [],
        summary: item.summary ? item.summary.replace(/<[^>]*>?/gm, '') : '',
        premiereDate: item.premiered || null
      }));

      // TVmaze search endpoint returns single result list; pagination browse handles pages
      totalPages = query ? 1 : 250; 
      applyFilters();
    } catch (err) {
      gallery.innerHTML = '<p style="color:#ef4444; grid-column: 1/-1; text-align: center;">Failed to load TV shows.</p>';
    }
  } else {
    // TMDB Logic
    try {
      let url = query
        ? `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${currentPage}`
        : `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&page=${currentPage}`;

      const response = await fetch(url);
      const data = await response.json();

      totalPages = data.total_pages || 1;

      fetchedItems = (data.results || []).map(item => ({
        id: `tmdb_${item.id}`,
        title: item.title,
        image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/210x295?text=No+Poster',
        year: item.release_date ? item.release_date.split('-')[0] : 'N/A',
        genres: (item.genre_ids || []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean),
        summary: item.overview || ''
      }));

      applyFilters();
    } catch (err) {
      gallery.innerHTML = '<p style="color:#ef4444; grid-column: 1/-1; text-align: center;">Failed to load movies.</p>';
    }
  }
}

// Client-side Genre & Year Filter Application
function applyFilters() {
  const selectedGenre = document.getElementById('genreSelect').value;
  const selectedYear = document.getElementById('yearSelect').value;

  const filtered = fetchedItems.filter(item => {
    const matchesGenre = selectedGenre 
      ? item.genres.some(g => g.toLowerCase().includes(selectedGenre.toLowerCase())) 
      : true;
    const matchesYear = selectedYear ? item.year.toString() === selectedYear : true;

    return matchesGenre && matchesYear;
  });

  renderGallery(filtered);
  updatePaginationUI();
}

// Render Cards to Gallery Grid
function renderGallery(items) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  if (items.length === 0) {
    gallery.innerHTML = '<p style="color:#94a3b8; grid-column: 1/-1; text-align: center;">No matching media items found.</p>';
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${(index % 10) * 0.04}s`;

    const isTvShow = currentType === 'tv';

    card.innerHTML = `
      <div class="card-img-wrapper">
        <img src="${item.image}" alt="${escapeQuotes(item.title)}" loading="lazy" />
      </div>
      <div class="card-content">
        <div class="card-title" title="${escapeQuotes(item.title)}">${item.title}</div>
        <div class="card-meta">
          <span>📅 ${item.year}</span>
          <span>${item.genres[0] || 'Media'}</span>
        </div>
        ${isTvShow ? `<button class="notify-btn" onclick="subscribeToShow('${item.tvmazeId}', '${escapeQuotes(item.title)}', '${escapeQuotes(item.summary)}', '${item.premiereDate}', this)">🔔 Notify Me (TVmaze)</button>` : ''}
      </div>
    `;

    gallery.appendChild(card);
  });
}

// Change Page & Fetch Next/Prev Results
function changePage(direction) {
  const newPage = currentPage + direction;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    fetchMediaData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Update Pagination Control States
function updatePaginationUI() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageIndicator = document.getElementById('pageIndicator');

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Register PWA Service Worker
async function registerServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.error('Service Worker Registration Failed:', err);
    }
  }
}

// Trigger Web Push Subscription for TVmaze Show Premiere Updates
async function subscribeToShow(tvmazeId, title, summary, premiereDate, btnElement) {
  try {
    const swRegistration = await navigator.serviceWorker.ready;
    let pushSubscription = await swRegistration.pushManager.getSubscription();

    if (!pushSubscription) {
      pushSubscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const subJson = pushSubscription.toJSON();

    // 1. Save/Update Show Record in Back4App (Fires afterSave trigger for premiere notifications)
    const ShowClass = Parse.Object.extend('Show');
    const showQuery = new Parse.Query(ShowClass);
    showQuery.equalTo('tvmazeId', tvmazeId);
    let showObj = await showQuery.first();

    if (!showObj) {
      showObj = new ShowClass();
      showObj.set('tvmazeId', tvmazeId);
      showObj.set('title', title);
      showObj.set('summary', summary);
      if (premiereDate) {
        showObj.set('premiereDate', new Date(premiereDate));
      }
      await showObj.save();
    }

    // 2. Call Back4App Cloud Code to map Web Push Endpoint to Show
    await Parse.Cloud.run('subscribeToWebPush', {
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      showId: showObj.id
    });

    btnElement.textContent = '✓ Subscribed';
    btnElement.classList.add('subscribed');
  } catch (err) {
    console.error('Subscription error:', err);
    alert('Could not enable notifications. Please check browser permissions.');
  }
}

// Helper: Convert VAPID public key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}


