const express = require('express');
const auth = require('../../auth');

const companies = require('./companies');
const notes = require('./notes');
const settings = require('./settings');
const ai = require('./ai');
const stats = require('./stats');

const router = express.Router();

// 秋招追踪器所有接口均需登录
router.use(auth.requireAuth);

router.use('/companies', companies);
router.use('/notes', notes);
router.use('/settings', settings);
router.use('/ai', ai);
router.use('/stats', stats);

module.exports = router;
