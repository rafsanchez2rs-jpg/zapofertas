const { db } = require('../db/firestore');
const campaignGroups = db.collection('campaignGroups');

async function getCampaignGroups(campaignId) {
  const snap = await campaignGroups.where('campaignId', '==', campaignId).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function createCampaignGroup(groupData) {
  const docRef = await campaignGroups.add({
    ...groupData,
    status: groupData.status || 'pending'
  });
  return docRef.id;
}

async function updateCampaignGroup(id, updates) {
  await campaignGroups.doc(id).update(updates);
}

async function deleteCampaignGroups(campaignId) {
  const snap = await campaignGroups.where('campaignId', '==', campaignId).get();
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

module.exports = { getCampaignGroups, createCampaignGroup, updateCampaignGroup, deleteCampaignGroups };