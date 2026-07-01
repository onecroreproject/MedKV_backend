const User = require('../models/User.model');
const Course = require('../models/Course.model');
const Payment = require('../models/Payment.model');
const LiveClass = require('../models/LiveClass.model');

// @desc    Get dashboard stats
// @route   GET /api/v1/dashboard/stats
// @access  Private (Admin)
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run queries concurrently
    const [
      totalStudents,
      totalFaculty,
      totalCourses,
      totalRevenueObj,
      upcomingClasses,
      studentsData,
      revenueDataAgg,
      topCoursesAgg,
      recentEnrollmentsListAgg
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ['student', 'Student'] } }),
      User.countDocuments({ role: { $in: ['faculty', 'Faculty'] } }),
      Course.countDocuments(),
      Payment.aggregate([
        { $match: { status: { $in: ['Success', 'success', 'SUCCESS'] } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
      ]),
      LiveClass.find({ date: { $gte: today } })
        .populate('course', 'title')
        .populate('faculty', 'name')
        .sort({ date: 1, time: 1 })
        .limit(3), // Top 3 for the widget
      User.find({ role: { $in: ['student', 'Student'] } }), // For enrollments & daily active
      
      // 1. Revenue Analytics Overview (Monthly)
      Payment.aggregate([
        { $match: { status: { $in: ['Success', 'success', 'SUCCESS'] } } },
        {
          $group: {
            _id: { 
              year: { $year: "$createdAt" }, 
              month: { $month: "$createdAt" } 
            },
            courseRev: { $sum: { $cond: [{ $eq: ["$type", "Enrollment"] }, "$amount", 0] } },
            subRev: { $sum: { $cond: [{ $eq: ["$type", "Extension"] }, "$amount", 0] } },
            total: { $sum: "$amount" }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $limit: 12 }
      ]),

      // 2. Top Performing Courses
      Course.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "enrolledCourses.course",
            as: "students"
          }
        },
        {
          $project: {
            title: 1,
            studentCount: { $size: "$students" }
          }
        },
        { $sort: { studentCount: -1 } },
        { $limit: 5 }
      ]),

      // 3. Recent Enrollments Table
      User.aggregate([
        { $unwind: "$enrolledCourses" },
        { $sort: { "enrolledCourses.enrolledAt": -1 } },
        { $limit: 5 },
        { $lookup: { from: "courses", localField: "enrolledCourses.course", foreignField: "_id", as: "courseData" } },
        { $unwind: { path: "$courseData", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: 1,
            courseTitle: "$courseData.title",
            enrolledAt: "$enrolledCourses.enrolledAt",
            progress: "$enrolledCourses.progress",
            status: { $literal: 'Paid' } 
          }
        }
      ])
    ]);

    const totalRevenue = totalRevenueObj.length > 0 ? totalRevenueObj[0].totalAmount : 0;
    const upcomingLiveClassesCount = await LiveClass.countDocuments({ date: { $gte: today } });

    // Aggregate stats from users
    let activeSubscriptions = 0;
    let recentEnrollments = 0;
    let dailyActiveLearners = 0;

    // Monthly growth tracker (0-11 for Jan-Dec)
    const currentYear = today.getFullYear();
    const monthlyGrowth = Array(12).fill(0).map(() => ({ registrations: 0, active: 0 }));

    studentsData.forEach(student => {
      // Active Subscriptions & Recent Enrollments
      if (student.enrolledCourses && student.enrolledCourses.length > 0) {
        student.enrolledCourses.forEach(ec => {
          // Check if valid
          if (!ec.validUntil || ec.validUntil >= new Date()) {
            activeSubscriptions++;
          }
          // Check if recent
          if (ec.enrolledAt && ec.enrolledAt >= thirtyDaysAgo) {
            recentEnrollments++;
          }
        });
      }

      // Daily Active
      if (student.lastActiveDate && student.lastActiveDate >= today) {
        dailyActiveLearners++;
      }

      // Monthly Growth Data
      // For simplicity, we just look at the current year. 
      if (student.createdAt && student.createdAt.getFullYear() === currentYear) {
        const month = student.createdAt.getMonth(); // 0-11
        monthlyGrowth[month].registrations++;
      }
      
      // We will define "active learner" for the month if their lastActiveDate was in that month
      if (student.lastActiveDate && student.lastActiveDate.getFullYear() === currentYear) {
        const month = student.lastActiveDate.getMonth();
        monthlyGrowth[month].active++;
      }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Format Student Growth Data for chart
    const formattedStudentGrowth = monthlyGrowth.map((data, index) => ({
      name: monthNames[index],
      registrations: data.registrations,
      active: data.active
    })).filter(data => data.registrations > 0 || data.active > 0 || monthNames.indexOf(data.name) <= today.getMonth()); // Show up to current month

    // Format revenue data for charts (map month number to short name)
    const formattedRevenueData = revenueDataAgg.map(item => ({
      name: monthNames[item._id.month - 1] || 'Unknown',
      course: item.courseRev,
      subscription: item.subRev,
      total: item.total
    }));

    // Format top courses
    const formattedTopCourses = topCoursesAgg.map(item => ({
      name: item.title,
      students: item.studentCount
    }));

    // Format recent enrollments
    const formattedRecentEnrollments = recentEnrollmentsListAgg.map(item => ({
      id: item._id,
      name: item.name,
      course: item.courseTitle || 'Unknown Course',
      date: item.enrolledAt ? new Date(item.enrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
      status: item.status,
      progress: item.progress || 0
    }));

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalFaculty,
        totalCourses,
        totalRevenue,
        upcomingLiveClassesCount,
        upcomingClasses,
        activeSubscriptions,
        recentEnrollments,
        dailyActiveLearners,
        pendingApprovals: 0, // Placeholder for now
        totalMCQs: 0,        // Placeholder
        casesUploaded: 0,     // Placeholder
        revenueData: formattedRevenueData,
        topCourses: formattedTopCourses,
        recentEnrollmentsList: formattedRecentEnrollments,
        studentGrowthData: formattedStudentGrowth
      }
    });
  } catch (err) {
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ success: false, message: 'Server Error fetching dashboard stats' });
  }
};
