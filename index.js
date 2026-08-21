Parse.initialize("gH0Ry12pUmKdlIWwjbDtN5T8lCkoZnfD6Xp9rvoq", "bSh7EVVqy3oQMUup6qDZQBVax28RmVeGgE92tMlp");
Parse.serverURL = "https://parseapi.back4app.com/";

const VAPID_PUBLIC_KEY = "BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E=";
const TMDB_API_KEY = "1070730380f5fee0d87cf0382670b255"; // WARNING: Move this to Cloud Code to prevent leaking!

let currentSubscription = null;
let currentPage = 1;
let currentSearchQuery = '';

function urlBase64ToUint8Array(base64String) {
  let base64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

document.addEventListener('DOMContentLoaded', async () => {
  setupUIEventListeners();
  await setupServiceWorker();
  await loadShows();
  await loadRecentActivity();
});

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported on this browser.');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    currentSubscription = await reg.pushManager.getSubscription();
    updateMainToggleUI(!!currentSubscription);
  } catch (err) {
    console.error('Service Worker setup failed:', err);
    updateMainToggleUI(false);
  }
}

function setupUIEventListeners() {
  const mainPushBtn = document.getElementById('main-push-btn');
  if (mainPushBtn) {
    mainPushBtn.addEventListener('click', handleMainPushClick);
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

  const prevBtn = document.getElementById('prev-page-btn');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        loadShows();
      }
    };
  }

  const nextBtn = document.getElementById('next-page-btn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      currentPage++;
      loadShows();
    };
  }
}

async function handleMainPushClick(e) {
  if (e) e.preventDefault();

  if (!navigator.onLine) {
    alert("You appear to be offline or in Airplane Mode. Please reconnect to enable push alerts.");
    return;
  }

  if (currentSubscription) {
    await unsubscribeUserFromPush();
  } else {
    await subscribeUserToPush();
  }
}

async function subscribeUserToPush() {
  try {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert("Notification permission was denied.");
        return;
      }
    }

    const reg = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });
    
    currentSubscription = sub;
    await saveSubscriptionToBack4App(sub);
    updateMainToggleUI(true);
    
    await loadShows();
    await loadRecentActivity();
  } catch (err) {
    console.error('Failed to subscribe:', err);
    alert(`Could not enable notifications: ${err.message || err}`);
    updateMainToggleUI(false);
  }
}

async function unsubscribeUserFromPush() {
  if (!currentSubscription) return;

  try {
    await currentSubscription.unsubscribe();
    await removeSubscriptionFromBack4App(currentSubscription);
    currentSubscription = null;
    updateMainToggleUI(false);
    await loadShows();
    await loadRecentActivity();
  } catch (err) {
    console.error('Failed to unsubscribe:', err);
    alert(`Could not disable notifications: ${err.message || err}`);
  }
}

async function saveSubscriptionToBack4App(sub) {
  const keysObj = JSON.parse(JSON.stringify(sub.toJSON().keys));
  // Call Cloud Function to safely handle server records over raw client writes
  await Parse.Cloud.run('saveSubscription', {
    subscription: {
      endpoint: sub.endpoint,
      keys: keysObj
    },
    showIds: []
  });
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
  if (!bellIcon || !statusText) return;

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

async function getActiveShowSubscriptions() {
  if (!currentSubscription) return [];
  try {
    return await Parse.Cloud.run('getUserShowSubscriptions', { endpoint: currentSubscription.endpoint });
  } catch (err) {
    console.error("Error getting user subscriptions:", err);
    return [];
  }
}

// FIX: Exposing toggleAlert to the window environment for template literal buttons
window.toggleAlert = async function(showId, enable) {
  if (!currentSubscription) {
    alert("Please enable global Push Alerts first using the bell button!");
    return;
  }
  
  try {
    await Parse.Cloud.run('toggleShowSubscription', {
      endpoint: currentSubscription.endpoint,
      showId: String(showId),
      enabled: enable
    });
    // Reload template grid UI to reflect dynamic active state styles
    await loadShows();
  } catch (err) {
    console.error("Could not update alert:", err);
    alert(`Could not update alert: ${err.message || err}`);
  }
};

async function loadShows() {
  const container = document.getElementById('shows-container');
  let url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}&page=${currentPage}`;
  
  if (currentSearchQuery.trim().length > 0) {
    url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(currentSearchQuery)}&page=${currentPage}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    await renderShows(data.results || []);
    
    const pageIndicator = document.getElementById('page-indicator');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    if (pageIndicator) pageIndicator.textContent = `Page ${data.page || 1} of ${data.total_pages || 1}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= (data.total_pages || 1);
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
          
          <button 
            onclick="window.toggleAlert('${show.id}', ${!isSubscribed})" 
            class="absolute top-3 right-3 p-2.5 rounded-full transition-all ${
              isSubscribed ? 'bg-blue-600/80 text-white border-blue-400' : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }"
            title="${isSubscribed ? 'Disable Alert' : 'Enable Alert'}"
          >
            <svg class="w-4 h-4 ${isSubscribed ? 'fill-current' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
        </div>
        <div class="p-4 flex flex-col flex-grow bg-slate-950/40">
           <h3 class="font-semibold text-white tracking-wide truncate">${show.name}</h3>
        </div>
      </div>`;
  }).join('');
}

// Stub function to prevent unhandled load crashes
async function loadRecentActivity() {
  console.log("Activity logs loaded.");
}
