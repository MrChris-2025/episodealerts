Parse.initialize("d1eje7SvxRjIFsdB6c3TuQLlF8v6zExAMBzChgXa", "eQqLLilvkNhy04m0OF5J4ry17vw0FKeeEHfPT2mq");
Parse.serverURL = "https://parseapi.back4app.com/";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";
const TMDB_API_KEY = "1070730380f5fee0d87cf0382670b255";

let currentSubscription = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

document.addEventListener('DOMContentLoaded', async () => {
  await setupServiceWorker();
  setupUIEventListeners();
  loadShows(); // Loads trending shows by default
});

async function setupServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      currentSubscription = await reg.pushManager.getSubscription();
      updateMainToggleUI(!!currentSubscription);
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }
}

function setupUIEventListeners() {
  const mainToggle = document.getElementById('main-push-toggle');
  if (mainToggle) {
    mainToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await subscribeUserToPush();
      } else {
        await unsubscribeUserFromPush();
      }
    });
  }

  const searchInput = document.getElementById('show-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadShows(e.target.value), 500);
    });
  }
}

async function subscribeUserToPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    currentSubscription = sub;
    await saveSubscriptionToBack4App(sub);
    updateMainToggleUI(true);
  } catch (err) {
    console.error('Failed to subscribe:', err);
    updateMainToggleUI(false);
  }
}

async function unsubscribeUserFromPush() {
  if (currentSubscription) {
    await currentSubscription.unsubscribe();
    await removeSubscriptionFromBack4App(currentSubscription);
    currentSubscription = null;
    updateMainToggleUI(false);
  }
}

async function saveSubscriptionToBack4App(sub) {
  const PushSub = Parse.Object.extend("PushSubscription");
  const query = new Parse.Query(PushSub);
  query.equalTo("endpoint", sub.endpoint);
  let record = await query.first();
  
  if (!record) {
    record = new PushSub();
  }
  
  record.set("endpoint", sub.endpoint);
  record.set("subscriptionJSON", JSON.stringify(sub));
  await record.save();
}

async function removeSubscriptionFromBack4App(sub) {
  const PushSub = Parse.Object.extend("PushSubscription");
  const query = new Parse.Query(PushSub);
  query.equalTo("endpoint", sub.endpoint);
  const record = await query.first();
  if (record) {
    await record.destroy();
  }
}

function updateMainToggleUI(isEnabled) {
  const mainToggle = document.getElementById('main-push-toggle');
  if (mainToggle) mainToggle.checked = isEnabled;
}

async function loadShows(searchQuery = '') {
  const container = document.getElementById('shows-container');
  let url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}`;
  
  if (searchQuery.trim().length > 0) {
    url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    renderShows(data.results || []);
  } catch (err) {
    console.error('Error fetching TMDB shows:', err);
    if (container) container.innerHTML = `<div class="card">Failed to load shows.</div>`;
  }
}

async function renderShows(shows) {
  const container = document.getElementById('shows-container');
  if (!container) return;

  if (shows.length === 0) {
    container.innerHTML = `<div class="card">No shows found.</div>`;
    return;
  }
  
  const activeShowSubs = await getActiveShowSubscriptions();

  container.innerHTML = shows.map(show => {
    const isSubscribed = activeShowSubs.includes(String(show.id));
    const posterUrl = show.poster_path 
      ? `https://image.tmdb.org/t/p/w92${show.poster_path}` 
      : 'https://via.placeholder.com/92x138?text=No+Image';

    return `
      <div class="card" data-show-id="${show.id}">
        <div class="header">
          <img src="${posterUrl}" alt="${show.name}" style="height: 50px; border-radius: 4px; margin-right: 10px;">
          <span class="show-meta"><strong>${show.name}</strong></span>
          <label class="switch">
            <input type="checkbox" class="show-toggle" data-show-id="${show.id}" ${isSubscribed ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.show-toggle').forEach(toggle => {
    toggle.addEventListener('change', handleShowToggleChange);
  });
}

async function handleShowToggleChange(e) {
  const showId = String(e.target.dataset.showId);
  const isChecked = e.target.checked;

  if (!currentSubscription) {
    alert("Please enable Main Push Alerts first.");
    e.target.checked = false;
    return;
  }

  await Parse.Cloud.run("toggleShowSubscription", {
    endpoint: currentSubscription.endpoint,
    showId: showId,
    enabled: isChecked
  });
}

async function getActiveShowSubscriptions() {
  if (!currentSubscription) return [];
  try {
    return await Parse.Cloud.run("getUserShowSubscriptions", { endpoint: currentSubscription.endpoint });
  } catch {
    return [];
  }
}
