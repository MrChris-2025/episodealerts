// public/main.js // Live search version (no search button). Debounced input, Enter triggers immediate search. // Hardened: defensive DOM checks, error boundaries, graceful degradation.

(async function () { // ---- Parse init ---- try { Parse.initialize("gH0Ry12pUmKdlIWwjbDtN5T8lCkoZnfD6Xp9rvoq", "bSh7EVVqy3oQMUup6qDZQBVax28RmVeGgE92tMlp"); Parse.serverURL = "https://parseapi.back4app.com/"; } catch (e) { console.error("Parse init failed:", e); }

const TMDB_API_KEY = "1070730380f5fee0d87cf0382670b255"; const VAPID_PUBLIC = "BC-LY0azo2sZzvZ4ZoQnZwnpLpIwhrOFsDTQ9YbiuSdWLNqKQYdNGmMM9Am6IH-Zd9rBPg7gcXOEYiFyNsz2Fh8";

// ---- DOM refs (guarded) ---- const gallery = document.getElementById("gallery"); const searchInput = document.getElementById("searchInput"); const genreSelect = document.getElementById("genreSelect"); const yearSelect = document.getElementById("yearSelect"); const globalSubscribeBtn = document.getElementById("globalSubscribeBtn"); const testNotifyBtn = document.getElementById("testNotifyBtn"); const statusBar = document.getElementById("statusBar"); const initialLoader = document.getElementById("initialLoader");

// ---- Helpers ---- function setStatus(text, isError) { if (!statusBar) return; statusBar.textContent = text || ""; statusBar.classList.toggle("error", !!isError); }

function showLoader(message) { if (!gallery) return; gallery.innerHTML = <div class="loader"><div class="spinner" aria-hidden="true"></div><div>${message}</div></div>; }

async function urlBase64ToUint8Array(base64String) { const padding = '='.repeat((4 - base64String.length % 4) % 4); const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/'); const rawData = window.atob(base64); const outputArray = new Uint8Array(rawData.length); for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i); return outputArray; }

// ---- Service Worker & Subscribe ---- async function registerServiceWorkerAndSubscribe() { if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert("Push not supported in this browser. (iOS Safari requires iOS 16.4+)"); throw new Error("Push not supported"); } try { const reg = await navigator.serviceWorker.register('/sw.js'); console.log('Service worker registered at', reg.scope); let sub = await reg.pushManager.getSubscription(); if (sub) { try { const res = await Parse.Cloud.run("registerSubscriptionSafe", { subscription: sub.toJSON() }); console.log('registerSubscriptionSafe (existing):', res); if (res && res.status === "ok") setStatus("Subscription confirmed: " + res.action, false); else setStatus("Server registration issue: " + (res && res.message ? res.message : JSON.stringify(res)), true); } catch (err) { console.error("registerSubscriptionSafe error:", err); setStatus("Server registration RPC failed", true); } return sub; }

const permission = await Notification.requestPermission(); if (permission !== 'granted') { setStatus("Notification permission denied", true); throw new Error("Notification permission denied"); } sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: await urlBase64ToUint8Array(VAPID_PUBLIC) }); console.log('New subscription', sub.toJSON()); try { const res = await Parse.Cloud.run("registerSubscriptionSafe", { subscription: sub.toJSON() }); console.log('registerSubscriptionSafe response:', res); if (res && res.status === "ok") setStatus("Subscribed and saved on server", false); else setStatus("Server save failed: " + (res && res.message ? res.message : JSON.stringify(res)), true); } catch (err) { console.error("registerSubscriptionSafe failed:", err); setStatus("Server registration RPC failed", true); } return sub; } catch (err) { console.error("Subscription error:", err); setStatus("Service worker / subscribe error", true); throw err; }
}

async function getCurrentSubscription() { if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null; try { const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return null; return await reg.pushManager.getSubscription(); } catch (e) { console.warn("getCurrentSubscription failed:", e); return null; } }

// ---- Follow / Unfollow ---- async function followShowForCurrentSubscription(showId, showName, media_type) { try { let reg = await navigator.serviceWorker.getRegistration(); let sub = reg ? await reg.pushManager.getSubscription() : null; if (!sub) sub = await registerServiceWorkerAndSubscribe(); if (!sub) throw new Error("Subscription required to follow"); const endpoint = sub.endpoint; const res = await Parse.Cloud.run("followShow", { endpoint, showId: String(showId), showName, media_type }); return res; } catch (err) { console.error("followShow error:", err); throw err; } }

async function unfollowShowForCurrentSubscription(showId) { try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg ? await reg.pushManager.getSubscription() : null; if (!sub) throw new Error("No subscription found; please subscribe first."); const endpoint = sub.endpoint; try { const res = await Parse.Cloud.run("unfollowShow", { endpoint, showId: String(showId) }); return res; } catch (err) { const msg = err && err.message ? err.message : JSON.stringify(err); if (msg.toLowerCase().includes("invalid function")) { alert('Server function "unfollowShow" not found. Deploy the Cloud Code that includes unfollowShow.'); } else { alert('Error calling unfollowShow: ' + msg); } throw err; } } catch (err) { console.error("unfollowShow error:", err); throw err; } }

async function getFollowedShowsForCurrentSubscription() { try { const sub = await getCurrentSubscription(); if (!sub) return { followedShowIds: [], followedShowsMeta: {} }; return await Parse.Cloud.run("getFollowedShowsForEndpoint", { endpoint: sub.endpoint }); } catch (err) { console.warn("getFollowedShowsForCurrentSubscription failed:", err); return

Generation failed

This model landed into an issue.

View details
Try Again
