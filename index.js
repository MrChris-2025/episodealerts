const webpush = require('web-push');
const axios = require('axios');

const TMDB_API_KEY = '1070730380f5fee0d87cf0382670b255';

webpush.setVapidDetails(
  'mailto:holdenafart@protonmail.com',
  'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E=',
  '_fln9kijPK_iYpMTVxPqxDGiIvKZubWZIt_bSi2qBt8'
);

Parse.Cloud.define('saveSubscription', async (request) => {
  const { subscription, showIds } = request.params;
  
  if (!subscription || !subscription.endpoint) {
    throw new Parse.Error(400, 'Invalid subscription object.');
  }

  const SubscriptionClass = Parse.Object.extend('PushSubscription');
  const query = new Parse.Query(SubscriptionClass);
  query.equalTo('endpoint', subscription.endpoint);
  let subObj = await query.first({ useMasterKey: true });

  if (!subObj) {
    subObj = new SubscriptionClass();
  }

  subObj.set('endpoint', subscription.endpoint);
  subObj.set('keys', subscription.keys);
  subObj.set('subscribedShows', Array.isArray(showIds) ? showIds : []);
  
  await subObj.save(null, { useMasterKey: true });
  return { success: true, count: showIds ? showIds.length : 0 };
});

Parse.Cloud.define('toggleShowSubscription', async (request) => {
  const { endpoint, showId, enabled } = request.params;
  
  const query = new Parse.Query('PushSubscription');
  query.equalTo('endpoint', endpoint);
  let subObj = await query.first({ useMasterKey: true });

  if (!subObj) {
    throw new Parse.Error(404, 'Subscription record not found.');
  }

  let shows = subObj.get('subscribedShows') || [];
  const idStr = String(showId);

  if (enabled && !shows.includes(idStr)) {
    shows.push(idStr);
  } else if (!enabled) {
    shows = shows.filter(id => id !== idStr);
  }

  subObj.set('subscribedShows', shows);
  await subObj.save(null, { useMasterKey: true });
  return { success: true, subscribedShows: shows };
});

Parse.Cloud.define('getUserShowSubscriptions', async (request) => {
  const { endpoint } = request.params;
  
  const query = new Parse.Query('PushSubscription');
  query.equalTo('endpoint', endpoint);
  const subObj = await query.first({ useMasterKey: true });

  return subObj ? subObj.get('subscribedShows') || [] : [];
});

const runEpisodeCheck = async (request) => {
  const EpisodeState = Parse.Object.extend('EpisodeState');
  const subQuery = new Parse.Query('PushSubscription');
  const subscriptions = await subQuery.find({ useMasterKey: true });

  const showIdsSet = new Set();
  subscriptions.forEach(sub => {
    const shows = sub.get('subscribedShows') || [];
    shows.forEach(id => showIdsSet.add(String(id)));
  });

  const uniqueShowIds = Array.from(showIdsSet);
  let checked = 0;

  const now = new Date();
  const datesToCheck = [
    now.toISOString().split('T')[0],
    new Date(now.getTime() - 86400000).toISOString().split('T')[0],
    new Date(now.getTime() + 86400000).toISOString().split('T')[0]
  ];

  for (const showId of uniqueShowIds) {
    try {
      const res = await axios.get(`https://api.themoviedb.org/3/tv/${showId}?api_key=${TMDB_API_KEY}`);
      const show = res.data;
      const nextEp = show.next_episode_to_air;
      checked++;

      if (!nextEp || !nextEp.air_date) continue;

      if (datesToCheck.includes(nextEp.air_date)) {
        const episodeKey = `${showId}_S${nextEp.season_number}E${nextEp.episode_number}`;

        const stateQuery = new Parse.Query(EpisodeState);
        stateQuery.equalTo('episodeKey', episodeKey);
        let epState = await stateQuery.first({ useMasterKey: true });

        if (!epState) {
          const title = `New Episode: ${show.name}`;
          const body = `S${nextEp.season_number}E${nextEp.episode_number} - "${nextEp.name}" airs today!`;
          const poster = show.poster_path 
            ? `https://image.tmdb.org/t/p/w185${show.poster_path}` 
            : null;

          await sendPush(showId, title, body, poster);

          epState = new EpisodeState();
          epState.set('episodeKey', episodeKey);
          epState.set('showId', String(showId));
          epState.set('notifiedDate', nextEp.air_date);
          await epState.save(null, { useMasterKey: true });
        }
      }
    } catch (e) {
      console.error(`Error checking show ID ${showId}:`, e.message);
    }
  }

  return { status: 'ok', showsChecked: checked };
};

Parse.Cloud.define('checkEpisodes', runEpisodeCheck);
Parse.Cloud.define('checkNewEpisodes', runEpisodeCheck);

async function sendPush(showId, title, body, iconUrl) {
  const query = new Parse.Query('PushSubscription');
  const subscriptions = await query.find({ useMasterKey: true });

  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: iconUrl || 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228c0922bb4c1456c30d96d0c2e63eaf20f501171d3311800d3d52cb22.png'
  });

  for (const subDoc of subscriptions) {
    const shows = subDoc.get('subscribedShows') || [];
    if (shows.length > 0 && !shows.includes(String(showId))) continue;

    const pushSub = {
      endpoint: subDoc.get('endpoint'),
      keys: subDoc.get('keys')
    };

    try {
      await webpush.sendNotification(pushSub, payload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await subDoc.destroy({ useMasterKey: true });
      }
    }
  }
}
