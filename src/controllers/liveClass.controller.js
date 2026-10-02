const LiveClass = require('../models/LiveClass.model');
const User = require('../models/User.model');
const { createAndSendNotification } = require('../utils/notification.util');
const dispatcher = require('../services/notificationDispatcher');
const { stopActiveRecording, activeRooms } = require('../socket/webrtcHandler');
const { clearRoomModerationState } = require('../services/classroom.service');
const { redisClient } = require('../config/redis');
const { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting } = require('../services/zoom.service');
const generateGCalLink = (liveClass) => {
  try {
    const d = new Date(liveClass.date);
    let hours = 0;
    let mins = 0;
    const timeParts = liveClass.time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (timeParts) {
      hours = parseInt(timeParts[1], 10);
      mins = parseInt(timeParts[2], 10);
      if (timeParts[3] && timeParts[3].toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (timeParts[3] && timeParts[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    
    d.setHours(hours, mins, 0, 0);
    const endD = new Date(d.getTime() + (liveClass.duration || 60) * 60000);
    
    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g,"");
    
    const text = encodeURIComponent(liveClass.title || 'Live Class');
    const dates = `${formatDate(d)}/${formatDate(endD)}`;
    const detailsEncoded = encodeURIComponent('Join the live class from your student portal.');
    const locationEncoded = encodeURIComponent('Online');
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${detailsEncoded}&location=${locationEncoded}`;
  } catch (e) {
    return '';
  }
};

// @desc    Get all live classes
// @route   GET /api/v1/live-classes
// @access  Public (or semi-public depending on auth)
exports.getLiveClasses = async (req, res) => {
  try {
    let query = LiveClass.find()
      .populate('course', 'title price')
      .populate('courseModule', 'title')
      .populate('lesson', 'title isFreePreview')
      .populate('faculty', 'name');
    
    // Sort by date ascending (closest first)
    query = query.sort({ date: 1, time: 1 });

    const classes = await query;
    res.status(200).json({ success: true, count: classes.length, data: classes });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get single live class
// @route   GET /api/v1/live-classes/:id
// @access  Public
exports.getLiveClass = async (req, res) => {
  try {
    const liveClass = await LiveClass.findById(req.params.id)
      .populate('course', 'title')
      .populate('courseModule', 'title')
      .populate('lesson', 'title')
      .populate('faculty', 'name');
      
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    res.status(200).json({ success: true, data: liveClass });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create new live class
// @route   POST /api/v1/live-classes
// @access  Private (Admin/Faculty)
exports.createLiveClass = async (req, res) => {
  try {
    const meetingProvider = req.body.meetingProvider || 'zoom';
    if (meetingProvider === 'zoom') {
      const faculty = await User.findById(req.body.faculty);
      if (!faculty) throw new Error('Invalid faculty assigned to class');
      
      const zoomMeeting = await createZoomMeeting(req.body);
      req.body.zoomId = zoomMeeting.meetingId;
      req.body.zoomPasscode = zoomMeeting.passcode;
      req.body.zoomLink = zoomMeeting.joinUrl;
      req.body.zoomStartUrl = zoomMeeting.startUrl;
      req.body.hostZoomUserId = zoomMeeting.hostZoomUserId;
    }

    const liveClass = await LiveClass.create(req.body);

    // Notify users based on access control
    let userIds = [];
    if (liveClass.accessControl === 'all') {
      const allUsers = await User.find({ role: { $regex: /^student$/i } }).select('_id');
      userIds = allUsers.map(u => u._id);
    } else if (liveClass.accessControl === 'selected' && liveClass.selectedStudents && liveClass.selectedStudents.length > 0) {
      userIds = liveClass.selectedStudents;
    } else if (liveClass.course) {
      const enrolledUsers = await User.find({ 'enrolledCourses.course': liveClass.course }).select('_id');
      userIds = enrolledUsers.map(u => u._id);
    }

    if (userIds.length > 0) {
      dispatcher.sendLiveClassScheduled(
        userIds, 
        liveClass.course || '', 
        liveClass.course ? 'Enrolled Course' : 'Dr. Sam Reefath Radiology Academy', 
        liveClass.title, 
        `${new Date(liveClass.date).toLocaleDateString()} at ${liveClass.time}`,
        generateGCalLink(liveClass)
      ).catch(err => console.error('Background email dispatch failed:', err));
    }

    if (global.io) {
      global.io.emit('liveClassUpdate', liveClass);
    }

    res.status(201).json({ success: true, data: liveClass });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update live class
// @route   PUT /api/v1/live-classes/:id
// @access  Private (Admin/Faculty)
exports.updateLiveClass = async (req, res) => {
  try {
    let liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    const oldStatus = liveClass.status;
    const oldDate = liveClass.date;
    const oldTime = liveClass.time;

    const targetProvider = req.body.meetingProvider !== undefined ? req.body.meetingProvider : liveClass.meetingProvider;
    if (targetProvider === 'zoom') {
      if (liveClass.meetingProvider !== 'zoom' || !liveClass.zoomId) {
        // Switched from WebRTC to Zoom, create new meeting
        const faculty = await User.findById(req.body.faculty || liveClass.faculty);
        if (faculty) {
           const zoomMeeting = await createZoomMeeting({ ...liveClass.toObject(), ...req.body });
           req.body.zoomId = zoomMeeting.meetingId;
           req.body.zoomPasscode = zoomMeeting.passcode;
           req.body.zoomLink = zoomMeeting.joinUrl;
           req.body.zoomStartUrl = zoomMeeting.startUrl;
           req.body.hostZoomUserId = zoomMeeting.hostZoomUserId;
        }
      } else if (req.body.date || req.body.time || req.body.duration || req.body.title) {
        // Update existing zoom meeting if scheduling details changed
        await updateZoomMeeting(liveClass.zoomId, { ...liveClass.toObject(), ...req.body }).catch(err => {
          console.error("Warning: Zoom update failed", err);
        });
      }
    }

    liveClass = await LiveClass.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    // Build user list for notifications
    let userIds = [];
    if (liveClass.accessControl === 'all') {
      const allUsers = await User.find({ role: { $regex: /^student$/i } }).select('_id');
      userIds = allUsers.map(u => u._id);
    } else if (liveClass.accessControl === 'selected' && liveClass.selectedStudents && liveClass.selectedStudents.length > 0) {
      userIds = liveClass.selectedStudents;
    } else if (liveClass.course) {
      const enrolledUsers = await User.find({ 'enrolledCourses.course': liveClass.course }).select('_id');
      userIds = enrolledUsers.map(u => u._id);
    }

    if (userIds.length > 0) {
      // 1. Notify if rescheduled
      if ((oldDate !== liveClass.date || oldTime !== liveClass.time) && liveClass.status !== 'Live Now') {
        dispatcher.sendLiveClassRescheduled(
          userIds,
          liveClass.course || '',
          liveClass.title,
          `${new Date(liveClass.date).toLocaleDateString()} at ${liveClass.time}`,
          generateGCalLink(liveClass)
        ).catch(err => console.error('Background email dispatch failed:', err));
      }
      
      // 2. Notify if the class just went live
      if (oldStatus !== 'Live Now' && liveClass.status === 'Live Now') {
        // We can reuse the "Starting Soon" or a custom one. Dispatcher has sendLiveClassReminder.
        dispatcher.sendLiveClassReminder(
          userIds,
          liveClass.course || '',
          liveClass.title,
          'RIGHT NOW'
        ).catch(err => console.error('Background email dispatch failed:', err));
      }
    }

    if (global.io) {
      global.io.emit('liveClassUpdate', liveClass);
      
      if (liveClass.status === 'Live Now' && oldStatus !== 'Live Now') {
        // Just went live
        await LiveClass.updateOne({ _id: liveClass._id }, { roomStatus: 'active', startedAt: new Date() });
      }

      // 3. Handle End Class explicitly
      if (liveClass.status === 'Completed' && oldStatus !== 'Completed') {
        const roomId = liveClass._id.toString();
        await stopActiveRecording(roomId, global.io);

        global.io.to(roomId).emit('class-ended');
        global.io.to(roomId).emit('teacher-left');
        await LiveClass.updateOne({ _id: roomId }, { roomStatus: 'ended', endedAt: new Date(), liveParticipants: 0 });
        
        // Clean redis state
        try {
          await redisClient.del(`admitted:${roomId}`);
          const keys = await redisClient.keys(`waiting-room:${roomId}:*`);
          if (keys && keys.length > 0) {
            await redisClient.del(keys);
          }
          await redisClient.del(`hands:${roomId}`);
          await clearRoomModerationState(roomId);
        } catch (err) {
          console.error('Redis cleanup error on end class via controller:', err);
        }

        if (activeRooms && activeRooms[roomId]) {
          delete activeRooms[roomId];
        }
      }
    }

    res.status(200).json({ success: true, data: liveClass });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete live class
// @route   DELETE /api/v1/live-classes/:id
// @access  Private (Admin)
exports.deleteLiveClass = async (req, res) => {
  try {
    const liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    if (liveClass.meetingProvider === 'zoom' && liveClass.zoomId) {
      await deleteZoomMeeting(liveClass.zoomId).catch(err => console.error("Could not delete zoom meeting:", err));
    }

    await liveClass.deleteOne();
    
    if (global.io) {
      global.io.emit('liveClassUpdate', { _id: req.params.id, deleted: true });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Log a diagnostic event for a live class
// @route   POST /api/v1/live-classes/:id/log
// @access  Private
exports.logLiveClassEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, details, userId, userName, role } = req.body;
    await LiveClass.findByIdAndUpdate(id, {
      $push: { logs: { action, details, userId, userName, role } }
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error saving live class log:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
