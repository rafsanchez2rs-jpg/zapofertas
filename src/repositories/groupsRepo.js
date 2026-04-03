const { db } = require('../db/firestore');
const groups = db.collection('groups');

async function getUserGroups(userId) {
  const snap = await groups.where('userId', '==', userId).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getGroupById(id) {
  const doc = await groups.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function getGroupByWaId(userId, waGroupId) {
  const snap = await groups
    .where('userId', '==', userId)
    .where('waGroupId', '==', waGroupId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function createGroup(groupData) {
  const now = new Date().toISOString();
  const group = {
    ...groupData,
    active: groupData.active !== undefined ? groupData.active : true,
    participant_count: groupData.participant_count || 0,
    created_at: now,
    updated_at: now
  };
  const docRef = await groups.add(group);
  return docRef.id;
}

async function updateGroup(id, updates) {
  const now = new Date().toISOString();
  await groups.doc(id).update({ ...updates, updated_at: now });
}

async function deleteGroup(id) {
  await groups.doc(id).delete();
}

module.exports = { getUserGroups, getGroupById, getGroupByWaId, createGroup, updateGroup, deleteGroup };