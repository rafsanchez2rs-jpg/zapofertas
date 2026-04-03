const { db } = require('../db/firestore');
const campaigns = db.collection('campaigns');

async function getUserCampaigns(userId, limit = 50, offset = 0) {
  const snap = await campaigns
    .where('userId', '==', userId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getCampaignById(id) {
  const doc = await campaigns.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function createCampaign(campaignData) {
  const now = new Date().toISOString();
  const campaign = {
    ...campaignData,
    status: campaignData.status || 'pending',
    has_headline: campaignData.has_headline || false,
    created_at: now
  };
  const docRef = await campaigns.add(campaign);
  return docRef.id;
}

async function updateCampaign(id, updates) {
  await campaigns.doc(id).update(updates);
}

async function deleteCampaign(id) {
  await campaigns.doc(id).delete();
}

async function getPendingCampaigns() {
  const snap = await campaigns
    .where('status', '==', 'scheduled')
    .where('scheduled_at', '<=', new Date().toISOString())
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = { getUserCampaigns, getCampaignById, createCampaign, updateCampaign, deleteCampaign, getPendingCampaigns };