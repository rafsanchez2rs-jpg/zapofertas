const { db } = require('../db/firestore');
const users = db.collection('users');

async function getUserById(id) {
  const doc = await users.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function getUserByEmail(email) {
  const snap = await users.where('email', '==', email.toLowerCase()).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function createUser(userData) {
  const now = new Date().toISOString();
  const user = {
    ...userData,
    email: userData.email.toLowerCase(),
    created_at: now,
    updated_at: now,
    active: userData.active !== undefined ? userData.active : true,
    role: userData.role || 'user',
    plan: userData.plan || 'free',
    daily_sends: userData.daily_sends || 0,
    last_send_date: userData.last_send_date || null
  };
  const docRef = await users.add(user);
  return docRef.id;
}

async function updateUser(id, updates) {
  const now = new Date().toISOString();
  await users.doc(id).update({ ...updates, updated_at: now });
}

async function getAllUsers() {
  const snap = await users.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = { getUserById, getUserByEmail, createUser, updateUser, getAllUsers };