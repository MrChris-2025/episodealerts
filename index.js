const webpush = require('web-push');
const axios = require('axios');

webpush.setVapidDetails(
  'mailto:holdenafart@protonmail.com',
  'BA8NXZjt4Aj2NsNFZwFQJPvNHoGdz87nVB_0MJCQdbXFMhgOmkWsd-STbCKtgPIBPrWF7-Umqrili8Ef4xS352E',
  '_fln9kijPK_iYpMTVxPqxDGiIvKZubWZIt_bSi2qBt8'
);

const SPORT_ENDPOINTS = [
  { key: 'mlb', name: 'MLB', url: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard' },
  { key: 'nba', name: 'NBA', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' },
  { key: 'nfl', name: 'NFL', url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard' },
  { key: 'nhl', name: 'NHL', url: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard' },
  { key: 'soccer', name: 'Soccer', url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard' },
  { key: 'mma', name: 'MMA', url: 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard' }
];

Parse.Cloud.define('saveSubscription', async (request) => {
  const { subscription, gameIds } = request.params;
  
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
  subObj.set('subscribedGames', Array.isArray(gameIds) ? gameIds : []);
  
  await subObj.save(null, { useMasterKey: true });
  return { success: true, count: gameIds ? gameIds.length : 0 };
});

Parse.Cloud.define('sendTestPush', async (request) => {
  const query = new Parse.Query('PushSubscription');
  const subscriptions = await query.find({ useMasterKey: true });

  if (subscriptions.length === 0) {
    return { status: 'No subscriptions found in database' };
  }

  const payload = JSON.stringify({
    title: 'Test Notification',
    body: 'If you see this, push notifications are working on your iPad!',
    data: { url: '/' }
  });

  for (const subDoc of subscriptions) {
    const pushSub = {
      endpoint: subDoc.get('endpoint'),
      keys: subDoc.get('keys')
    };
    try {
      await webpush.sendNotification(pushSub, payload);
    } catch (err) {
      console.error('Push error:', err);
    }
  }

  return { status: 'Sent push to ' + subscriptions.length + ' device(s)' };
});

Parse.Cloud.define('checkScores', async (request) => {
  const GameState = Parse.Object.extend('GameState');
  let checked = 0;

  for (const sport of SPORT_ENDPOINTS) {
    try {
      const res = await axios.get(sport.url);
      const events = res.data.events || [];
      checked += events.length;

      for (const event of events) {
        const gameId = String(event.id);
        const comp = event.competitions[0];
        const competitors = comp.competitors || [];
        if (competitors.length < 2) continue;

        const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
        const away = competitors.find(c => c.homeAway === 'away') || competitors[1];

        const homeScore = parseInt(home.score || '0', 10);
        const awayScore = parseInt(away.score || '0', 10);
        const status = event.status.type.state;

        const query = new Parse.Query(GameState);
        query.equalTo('gameId', gameId);
        let gameState = await query.first({ useMasterKey: true });

        if (!gameState) {
          gameState = new GameState();
          gameState.set('gameId', gameId);
          gameState.set('sport', sport.key);
          gameState.set('homeScore', homeScore);
          gameState.set('awayScore', awayScore);
          gameState.set('status', status);
          await gameState.save(null, { useMasterKey: true });
          continue;
        }

        const pHome = gameState.get('homeScore');
        const pAway = gameState.get('awayScore');

        if (status === 'in' && (homeScore !== pHome || awayScore !== pAway)) {
          const hName = home.team?.shortDisplayName || 'Home';
          const aName = away.team?.shortDisplayName || 'Away';
          
          await sendPush(gameId, `[${sport.name}] ${aName} @ ${hName}`, `${aName}: ${awayScore} | ${hName}: ${homeScore}`);

          gameState.set('homeScore', homeScore);
          gameState.set('awayScore', awayScore);
          gameState.set('status', status);
          await gameState.save(null, { useMasterKey: true });
        }
      }
    } catch (e) {
      console.error(e.message);
    }
  }

  return { status: 'ok', gamesChecked: checked };
});

async function sendPush(gameId, title, body) {
  const query = new Parse.Query('PushSubscription');
  const subscriptions = await query.find({ useMasterKey: true });

  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: 'https://a.espncdn.com/i/espn/espn_logos/espn_red.png'
  });

  for (const subDoc of subscriptions) {
    const games = subDoc.get('subscribedGames') || [];
    if (games.length > 0 && !games.includes(String(gameId))) continue;

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
