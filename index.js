Parse.initialize("gH0Ry12pUmKdlIWwjbDtN5T8lCkoZnfD6Xp9rvoq", "bSh7EVVqy3oQMUup6qDZQBVax28RmVeGgE92tMlp");
Parse.serverURL = "https://parseapi.back4app.com/";

ParseVAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E";
const TMDB_API_KEY = "1070730380f5fee0d87cf0382670b255";

let currentSubscription = null;
let currentPage = 1;
let currentSearchQuery = '';

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
  await loadShows();
  await loadRecentActivity();
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
  const mainPushBtn = document.getElementById('main-push-btn');
  if (mainPushBtn) {
    mainPushBtn.addEventListener('click', async () => {
      if (currentSubscription) {
        await unsubscribeUserFromPush();
      } else {
        await subscribeUserToPush();
      }
    });
  }

  const searchInput = document.getElementById('show-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      currentPage = 1;
      currentSearchQuery = e.target.value;
      debounceTimer = setTimeout(() => loadShows(), 400);
    });
  }

  document.getElementById('prev-page-btn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadShows();
    }
  });

  document.getElementById('next-page-btn').addEventListener('click', () => {
    currentPage++;
    loadShows();
  });
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
    await loadShows();
    await loadRecentActivity();
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
    await loadShows();
    await loadRecentActivity();
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
  record.set("keys", sub.toJSON().keys);
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
  const bellIcon = document.getElementById('main-bell-icon');
  const statusText = document.getElementById('main-push-status');
  if (isEnabled) {
    bellIcon.classList.remove('text-slate-400');
    bellIcon.classList.add('text-blue-400', 'fill-blue-400/20');
    statusText.textContent = "Push Alerts On";
  } else {
    bellIcon.classList.remove('text-blue-400', 'fill-blue-400/20');
    bellIcon.classList.add('text-slate-400');
    statusText.textContent = "Push Alerts Off";
  }
}

async function loadShows() {
  const container = document.getElementById('shows-container');
  let url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}&page=${currentPage}`;
  
  if (currentSearchQuery.trim().length > 0) {
    url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(currentSearchQuery)}&page=${currentPage}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    renderShows(data.results || []);
    
    document.getElementById('page-indicator').textContent = `Page ${data.page || 1} of ${data.total_pages || 1}`;
    document.getElementById('prev-page-btn').disabled = currentPage <= 1;
    document.getElementById('next-page-btn').disabled = currentPage >= (data.total_pages || 1);
  } catch (err) {
    console.error('Error fetching TMDB shows:', err);
    if (container) container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 glass-card rounded-2xl">Failed to load catalog.</div>`;
  }
}

async function renderShows(shows) {
  const container = document.getElementById('shows-container');
  if (!container) return;

  if (shows.length === 0) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 glass-card rounded-2xl">No shows found.</div>`;
    return;
  }
  
  const activeShowSubs = await getActiveShowSubscriptions();

  container.innerHTML = shows.map(show => {
    const isSubscribed = activeShowSubs.includes(String(show.id));
    const posterUrl = show.poster_path 
      ? `https://image.tmdb.org/t/p/w342${show.poster_path}` 
      : 'https://via.placeholder.com/342x513?text=No+Cover';

    return `
      <div class="glass-card rounded-2xl overflow-hidden flex flex-col group relative">
        <div class="aspect-[2/3] w-full overflow-hidden bg-slate-900 relative">
          <img src="${posterUrl}" alt="${show.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
          
          <!-- Card Heroicon Alert Bell Button -->
          <button 
            onclick="toggleAlert('${show.id}', ${!isSubscribed})" 
            class="absolute top-3 right-3 p-2.5 rounded-full glass-panel transition-all ${
              isSubscribed ? 'bg-blue-600/80 text-white border-blue-400' : 'text-slate-300 hover:text-white'
            }"
            title="${isSubscribed ? 'Disable Alert' : 'Enable Alert'}"
          >
            <svg class="w-4 h-4 ${isSubscribed ? 'fill-current' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 01-5.714 0" />
            </svg>
          </button>
        </div>
        <div class="p-3.5 flex-grow flex flex-col justify-between">
          <h3 class="font-semibold text-sm text-white line-clamp-1">${show.name}</h3>
          <span class="text-xs text-slate-400 mt-1">${show.first_air_date ? show.first_air_date.split('-')[0] : 'N/A'}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function toggleAlert(showId, enable) {
  if (!currentSubscription) {
    alert("Please enable Master Push Alerts first.");
    return;
  }

  await Parse.Cloud.run("toggleShowSubscription", {
    endpoint: currentSubscription.endpoint,
    showId: String(showId),
    enabled: enable
  });

  await loadShows();
  await loadRecentActivity();
}

async function getActiveShowSubscriptions() {
  if (!currentSubscription) return [];
  try {
    return await Parse.Cloud.run("getUserShowSubscriptions", { endpoint: currentSubscription.endpoint });
  } catch {
    return [];
  }
}

async function loadRecentActivity() {
  const container = document.getElementById('activity-container');
  if (!container) return;

  if (!currentSubscription) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 glass-card rounded-2xl">Enable push alerts to view active subscriptions.</div>`;
    return;
  }

  const subscribedIds = await getActiveShowSubscriptions();
  if (subscribedIds.length === 0) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 glass-card rounded-2xl">No active show subscriptions.</div>`;
    return;
  }

  try {
    const showPromises = subscribedIds.map(id => 
      fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}`).then(res => res.json())
    );
    const shows = await Promise.all(showPromises);

    container.innerHTML = shows.map(show => {
      const posterUrl = show.poster_path 
        ? `https://image.tmdb.org/t/p/w185${show.poster_path}` 
        : 'https://via.placeholder.com/185x278?text=No+Cover';

      const lastAir = show.last_episode_to_air 
        ? `S${show.last_episode_to_air.season_number}E${show.last_episode_to_air.episode_number} (${show.last_episode_to_air.air_date})` 
        : 'N/A';

      const nextAir = show.next_episode_to_air 
        ? `S${show.next_episode_to_air.season_number}E${show.next_episode_to_air.episode_number} (${show.next_episode_to_air.air_date})` 
        : 'TBA / Ended';

      return `
        <div class="glass-card p-4 rounded-2xl flex gap-4 relative items-center" id="activity-card-${show.id}">
          <img src="${posterUrl}" alt="${show.name}" class="w-16 h-24 object-cover rounded-xl">
          <div class="flex-grow space-y-1">
            <h3 class="font-semibold text-white text-sm line-clamp-1">${show.name}</h3>
            <p class="text-xs text-slate-300"><strong>Last:</strong> ${lastAir}</p>
            <p class="text-xs text-slate-300"><strong>Next:</strong> ${nextAir}</p>
          </div>
          <!-- Delete Subscription Button -->
          <button onclick="deleteShowSubscription('${show.id}')" class="p-2 text-slate-400 hover:text-red-400 transition" title="Delete">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading activity feed:', err);
  }
}

async function deleteShowSubscription(showId) {
  if (!currentSubscription) return;

  await Parse.Cloud.run("toggleShowSubscription", {
    endpoint: currentSubscription.endpoint,
    showId: String(showId),
    enabled: false
  });

  await loadShows();
  await loadRecentActivity();
}
