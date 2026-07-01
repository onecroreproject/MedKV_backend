const Course = require('../models/Course.model');
const LiveClass = require('../models/LiveClass.model');

// @desc    Global search
// @route   GET /api/search?q=query
// @access  Private
exports.globalSearch = async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.status(200).json({ success: true, data: [], message: 'Query too short' });
    }

    const regex = new RegExp(query, 'i');

    // Search courses
    const courses = await Course.find({
      $or: [{ title: regex }, { description: regex }]
    })
      .limit(5)
      .select('title description thumbnail category');

    // Search live classes
    const liveClasses = await LiveClass.find({
      $or: [{ title: regex }, { notes: regex }] // Note: LiveClass uses 'notes' instead of 'description'
    })
      .limit(5)
      .select('title notes date time zoomLink');

    // Format results
    const results = [];
    
    courses.forEach(c => {
      results.push({
        _id: c._id,
        type: 'Course',
        title: c.title,
        description: c.description,
        link: `/student/dashboard?tab=course-learning&courseId=${c._id}`
      });
    });

    liveClasses.forEach(lc => {
      results.push({
        _id: lc._id,
        type: 'Live Class',
        title: lc.title,
        description: `${lc.date} at ${lc.time}`,
        link: `/student/dashboard?tab=live`
      });
    });

    return res.status(200).json({ success: true, data: results, message: 'Search results fetched' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
