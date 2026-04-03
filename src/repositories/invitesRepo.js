const { db } = require('../db/firestore');
const invites = db.collection('invites');

async function getInviteByToken(token) {
  const doc = await invites.doc(token).get();
  if (!doc.exists) return null;
  return { token: doc.id, ...doc.data() };
}

async function createInvite(inviteData) {
  const now = new Date().toISOString();
  const invite = {
    ...inviteData,
    plan: inviteData.plan || 'pro',
    created_at: now
  };
  const docRef = await invites.add(invite);
  return docRef.id;
}

async function updateInvite(token, updates) {
  await invites.doc(token).update(updates);
}

async function getUserInvites(createdBy) {
  const snap = await invites.where('createdBy', '==', createdBy).get();
  return snap.docs.map(doc => ({ token: doc.id, ...doc.data() }));
}

module.exports = { getInviteByToken, createInvite, updateInvite, getUserInvites };