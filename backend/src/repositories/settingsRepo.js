const { db } = require('../db/firestore');
const settings = db.collection('settings');

async function getUserSettings(userId) {
  const doc = await settings.doc(userId).get();
  if (!doc.exists) return null;
  return { userId: doc.id, ...doc.data() };
}

async function createUserSettings(userId, settingsData) {
  const now = new Date().toISOString();
  const defaultSettings = {
    delay_between_sends: 3000,
    send_image: true,
    auto_reconnect: true,
    coupon_default_link: null,
    ...settingsData,
    created_at: now,
    updated_at: now
  };
  await settings.doc(userId).set(defaultSettings);
}

async function updateUserSettings(userId, updates) {
  const now = new Date().toISOString();
  await settings.doc(userId).update({ ...updates, updated_at: now });
}

module.exports = { getUserSettings, createUserSettings, updateUserSettings };