const { redisClient } = require('../config/redis');
const LiveClass = require('../models/LiveClass.model');
const User = require('../models/User.model');

/**
 * Validates if a user is authorized to join the given class.
 */
const validateClassAccess = async (userId, userRole, roomId) => {
  const liveClass = await LiveClass.findById(roomId);
  if (!liveClass) {
    return { valid: false, message: 'Class not found' };
  }
  if (liveClass.roomStatus === 'completed' || liveClass.roomStatus === 'ended') {
    return { valid: false, message: 'Class is no longer active' };
  }

  const role = (userRole || '').toLowerCase();
  
  if (role === 'admin') {
    return { valid: true, isTeacher: true, liveClass };
  } 
  
  if (role === 'faculty' || role === 'teacher') {
    if (liveClass.faculty && liveClass.faculty.toString() === userId.toString()) {
      return { valid: true, isTeacher: true, liveClass };
    }
    // Faculty who did not organize the class join as students
    return { valid: true, isTeacher: false, liveClass };
  }

  // Student check
  let isAuthorized = false;
  if (liveClass.accessControl === 'all') {
    isAuthorized = true;
  } else if (liveClass.accessControl === 'selected') {
    if (liveClass.selectedStudents && liveClass.selectedStudents.includes(userId)) {
      isAuthorized = true;
    }
  } else if (liveClass.course) {
    const user = await User.findById(userId);
    if (user && user.enrolledCourses && user.enrolledCourses.some(ec => ec.course.toString() === liveClass.course.toString())) {
      isAuthorized = true;
    }
  }

  if (isAuthorized) {
    return { valid: true, isTeacher: false, liveClass };
  }

  return { valid: false, message: 'Not authorized to join this class' };
};

/**
 * Adds a student to the Redis waiting room.
 */
const addStudentToWaitingRoom = async (roomId, studentData) => {
  const key = `waiting-room:${roomId}:${studentData.userId}`;
  await redisClient.set(key, JSON.stringify({
    ...studentData,
    requestedAt: new Date().toISOString()
  }), {
    EX: 3600 // Expire in 1 hour independently
  });
};

/**
 * Removes a student from the Redis waiting room.
 */
const removeStudentFromWaitingRoom = async (roomId, userId) => {
  const key = `waiting-room:${roomId}:${userId}`;
  await redisClient.del(key);
};

/**
 * Gets all waiting students for a room.
 */
const getWaitingStudents = async (roomId) => {
  const pattern = `waiting-room:${roomId}:*`;
  const keys = await redisClient.keys(pattern);
  if (!keys || keys.length === 0) return [];
  
  const data = await redisClient.mGet(keys);
  return data.filter(Boolean).map(str => JSON.parse(str));
};

module.exports = {
  validateClassAccess,
  addStudentToWaitingRoom,
  removeStudentFromWaitingRoom,
  getWaitingStudents
};
