const { db } = require('../db/firestore');
const collections = db.collection('collections');

async function getUserCollections(userId) {
  const snap = await collections.where('userId', '==', userId).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getCollectionById(id) {
  const doc = await collections.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function createCollection(userId, name) {
  const now = new Date().toISOString();
  const docRef = await collections.add({
    userId,
    name,
    created_at: now
  });
  return docRef.id;
}

async function updateCollection(id, updates) {
  await collections.doc(id).update(updates);
}

async function deleteCollection(id) {
  await collections.doc(id).delete();
}

module.exports = { getUserCollections, getCollectionById, createCollection, updateCollection, deleteCollection };