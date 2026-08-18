// Initialize Back4App Parse SDK
Parse.initialize("YOUR_BACK4APP_APP_ID", "YOUR_BACK4APP_JS_KEY");
Parse.serverURL = "https://parseapi.back4app.com/";

const TMDB_API_KEY = '1070730380f5fee0d87cf0382670b255';
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY'; // Must match backend VAPID public key

let currentType = 'tv'; // 'tv' (TVmaze) or 'movie' (TMDB)
let allItems = [];
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
  currentType = type;
  document.getElementById('tabTv').classList.toggle('active', type === 'tv');
  document.getElementById('tabMovie').classList.toggle('active', type === 'movie');
  fetchMediaData();
}

// Fetch Media Items from APIs
async function fetchMediaData() {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '<p style="color:#94a3b8;">Loading media gallery...</p>';

  if (currentType === 'tv') {
    // Fetch from TVmaze
    try {
      const response = await fetch('https://api.tvmaze.com/shows');
      const data = await response.json();
      allItems = data.slice(0, 50).map(item => ({
        id: `tvmaze_${item.id}`,
        tvmazeId: item.id,
        title: item.name,
        image: item.image?.medium || 'https://via.placeholder.com/210x295?text=No+Image',
        year: item.premiered ? item.premiered.split('-')[0] : 'N/A',
        genres: item.genres || [],
        summary: item.summary ? item.summary.replace(/<[^>]*>?/gm, '') : '',
        premiereDate: item.premiered || null
      }));
      renderGallery(allItems);
    } catch (err) {
      gallery.innerHTML = '<p style="color:#ef4444;">Failed to load TV shows.</p>';
    }
  } else {
    // Fetch Movies from TMDB using provided Key
    try {
      const response = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`);
      const data = await response.json();
      allItems = (data.results || []).map(item => ({
        id: `tmdb_${item.id}`,
        title: item.title,
        image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/210x295?text=No+Image',
        year: item.release_date ? item.release_date.split('-')[0] : 'N/A',
        genres: [], // Handled by standard genre dropdown match
        summary: item.overview || ''
      }));
      renderGallery(allItems);
    } catch (err) {
      gallery.innerHTML = '<p style="color:#ef4444;">Failed to load movies.</p>';
    }
  }
}

// Render Gallery Grid
function renderGallery(items) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  if (items.length === 0) {
    gallery.innerHTML = '<p style="color:#94a3b8;">No results found.</p>';
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${(index % 10) * 0.05}s`;

    const isTvShow = currentType === 'tv';

    card.innerHTML = `
      <div class="card-img-wrapper">
        <img src="${item.image}" alt="${item.title}" loading="lazy" />
      </div>
      <div class="card-content">
        <div class="card-title" title="${item.title}">${item.title}</div>
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

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'");
}

// Handle Search and Filtering
function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    applyFilters();
  }, 300);
}

function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const selectedGenre = document.getElementById('genreSelect').value;
  const selectedYear = document.getElementById('yearSelect').value;

  const filtered = allItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm);
    const matchesGenre = selectedGenre ? item.genres.some(g => g.toLowerCase().includes(selectedGenre.toLowerCase())) : true;
    const matchesYear = selectedYear ? item.year.toString() === selectedYear : true;

    return matchesSearch && matchesGenre && matchesYear;
  });

  renderGallery(filtered);
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
