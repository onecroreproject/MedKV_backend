const express = require('express');
const {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  addModule,
  updateModule,
  deleteModule,
  reorderModules,
  addLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  addResource,
  deleteResource
} = require('../controllers/course.controller');

const router = express.Router();

// Course routes
router.route('/')
  .get(getCourses)
  .post(createCourse);

router.route('/:id')
  .get(getCourse)
  .put(updateCourse)
  .delete(deleteCourse);

const upload = require('../middleware/upload');

// Module routes
router.route('/:courseId/modules')
  .post(addModule);

router.route('/:courseId/modules/reorder')
  .put(reorderModules);

router.route('/modules/:moduleId')
  .put(updateModule)
  .delete(deleteModule);

// Lesson routes
router.route('/modules/:moduleId/lessons')
  .post(upload.single('videoFile'), addLesson);

router.route('/modules/:moduleId/lessons/reorder')
  .put(reorderLessons);

router.route('/lessons/:lessonId')
  .put(upload.single('videoFile'), updateLesson)
  .delete(deleteLesson);

router.route('/lessons/:lessonId/resources')
  .post(upload.single('resourceFile'), addResource);

router.route('/lessons/:lessonId/resources/:resourceId')
  .delete(deleteResource);

module.exports = router;
