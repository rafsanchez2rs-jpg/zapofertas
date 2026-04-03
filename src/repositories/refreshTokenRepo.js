const { db } = require('../db/firestore');
const tokens = db.collection('refreshTokens');

async function getRefreshToken(token) {
  const doc = await tokens.doc(token).get();
  if (!doc.exists) return null;
  return { token: doc.id, ...doc.data() };
}

async function createRefreshToken(userId, token, expiresAt) {
  const now = new Date().toISOString();
  await tokens.doc(token).set({
    userId,
    expiresAt,
    createdAt: now
  });
}

async function deleteRefreshToken(token) {
  await tokens.doc(token).delete();
}

async function deleteUserRefreshTokens(userId) {
  const snap = await tokens.where('userId', '==', userId).get();
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

module.exports = { getRefreshToken, createRefreshToken, deleteRefreshToken, deleteUserRefreshTokens };