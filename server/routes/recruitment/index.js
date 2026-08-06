const express = require('express');
const auth = require('../../auth');

const companies = require('./companies');
const notes = require('./notes');
const settings = require('./settings');
const ai = require('./ai');
const stats = require('./stats');

const router = express.Router();

// 秋招追踪器接口：正式用户或游客空间均可访问
router.use(auth.requireSpace);

router.use('/companies', companies);
router.use('/notes', notes);
router.use('/settings', settings);
router.use('/ai', ai);
router.use('/stats', stats);

module.exports = router;
