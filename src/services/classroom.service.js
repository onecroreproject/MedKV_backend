const { redisClient } = require('../config/redis');

// Raise Hand Redis Logic
const addRaisedHand = async (roomId, userId, name) => {
  const key = `hands:${roomId}`;
  const timestamp = Date.now();
  // ZADD adds the user with a score (timestamp) to maintain chronological order
  await redisClient.zAdd(key, { score: timestamp, value: JSON.stringify({ userId, name, timestamp }) });
  await redisClient.expire(key, 4 * 3600); // 4 hours TTL
};

const removeRaisedHand = async (roomId, userId) => {
  const key = `hands:${roomId}`;
  // We have to find the member. Since value is a JSON string, we can't easily ZREM by just userId unless we store userId as value
  // Let's store just userId as value, and look up names if needed, or parse all.
  // Actually, better: Store userId as the value in ZSET, and if we need the name, we just return the userId and the frontend maps it to participant info!
  await redisClient.zRem(key, userId.toString());
};

const addRaisedHandSimple = async (roomId, userId) => {
  const key = `hands:${roomId}`;
  await redisClient.zAdd(key, { score: Date.now(), value: userId.toString() });
  await redisClient.expire(key, 4 * 3600);
};

const getRaisedHands = async (roomId) => {
  const key = `hands:${roomId}`;
  // Retrieve all elements sorted by score (chronological)
  const users = await redisClient.zRange(key, 0, -1);
  return users; // Array of userIds
};

const clearAllRaisedHands = async (roomId) => {
  const key = `hands:${roomId}`;
  await redisClient.del(key);
};

// Rate Limiting Logic for Reactions
// 5 reactions per second per user
const checkReactionRateLimit = async (roomId, userId) => {
  const key = `ratelimit:reaction:${roomId}:${userId}`;
  const current = await redisClient.incr(key);
  if (current === 1) {
    await redisClient.expire(key, 1); // 1 second window
  }
  return current <= 5;
};

// Rate Limiting Logic for Chat
// 10 messages per 10 seconds per user per room
const checkChatRateLimit = async (roomId, userId) => {
  const key = `ratelimit:chat:${roomId}:${userId}`;
  const current = await redisClient.incr(key);
  if (current === 1) {
    await redisClient.expire(key, 10); // 10 second window
  }
  return current <= 10;
};

module.exports = {
  addRaisedHand: addRaisedHandSimple,
  removeRaisedHand,
  getRaisedHands,
  clearAllRaisedHands,
  checkReactionRateLimit,
  checkChatRateLimit
};
