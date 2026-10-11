import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, defaultConditions, validateConditions } from '../src/engine.js';
import { PRESETS, presetDraft } from '../public/presets.js';

const criteria = draft => draft.conditions.map(({ field, op, value }) => [field, op, value, FIELDS[field].unit]);

test('四个预制研究方案具有唯一标识，且全部条件可由筛选引擎执行', () => {
  assert.equal(PRESETS.length, 4);
  assert.equal(new Set(PRESETS.map(preset => preset.id)).size, PRESETS.length);
  for (const preset of PRESETS) {
    assert.deepEqual(validateConditions(preset.conditions), []);
    assert.ok(preset.name && preset.blurb && preset.category && preset.intent);
    assert.ok(preset.assumptions.every(text => typeof text === 'string' && text.length > 0));
    assert.ok(preset.conditions.every(item => item.enabled && item.origin.includes('需确认')));
    assert.ok(['全部行业', '银行'].includes(preset.industry));
    assert.equal('stocks' in preset, false);
    assert.equal('included' in preset, false);
    assert.equal('count' in preset, false);
  }
});

test('经营与估值保留四项默认条件，其他方案的阈值、单位与行业符合方案定义', () => {
  const defaults = presetDraft('business-valuation');
  assert.deepEqual(criteria(defaults), defaultConditions().map(({ field, op, value }) => [field, op, value, FIELDS[field].unit]));
  assert.equal(defaults.industry, '全部行业');

  const bank = presetDraft('bank-valuation');
  assert.equal(bank.industry, '银行');
  assert.deepEqual(criteria(bank), [['revenueGrowth', 'gte', 0, '%'], ['pe', 'lte', 15, '倍']]);

  const growth = presetDraft('growth-drawdown');
  assert.equal(growth.industry, '全部行业');
  assert.deepEqual(criteria(growth), [['revenueGrowth', 'gte', 0, '%'], ['profitGrowth', 'gte', 10, '%'], ['drawdown', 'lte', 10, '%']]);

  const volatility = presetDraft('low-volatility');
  assert.equal(volatility.industry, '全部行业');
  assert.deepEqual(criteria(volatility), [['revenueGrowth', 'gte', 0, '%'], ['profitGrowth', 'gte', 0, '%'], ['pe', 'lte', 25, '倍'], ['volatility', 'lte', 20, '%']]);
});

test('重复载入、编辑与保存的草稿互相隔离，且不污染原模板', () => {
  const first = presetDraft('bank-valuation');
  const saved = structuredClone(first);
  const second = presetDraft('bank-valuation');
  first.conditions[1].value = 8;
  first.conditions[0].enabled = false;
  first.conditions.push({ id: 'extra', field: 'volatility', op: 'lte', value: 20, enabled: true });
  first.assumptions[0] = '用户修改后的说明';
  first.industry = '全部行业';

  assert.deepEqual(second, saved);
  assert.deepEqual(presetDraft('bank-valuation'), saved);
  second.conditions[1].value = 12;
  second.assumptions.push('另一个草稿说明');
  assert.equal(saved.conditions[1].value, 15);
  assert.equal(saved.assumptions.length, 3);
  assert.ok(Object.isFrozen(PRESETS));
  assert.ok(Object.isFrozen(PRESETS[1].conditions[1]));
  assert.throws(() => { PRESETS[1].conditions[1].value = 1; }, TypeError);
});

test('未知预制标识不会生成替代条件或静默载入默认方案', () => {
  assert.equal(presetDraft('unknown'), null);
  assert.equal(presetDraft(undefined), null);
  assert.equal(presetDraft(null), null);
});
