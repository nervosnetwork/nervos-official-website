/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict')
const { test } = require('node:test')
// @ts-expect-error: Node's --experimental-strip-types loader accepts .ts imports here.
const { cellIntersectsRects, getDrawableCells, stepLife } = require('./guide-life.ts')

test('a blinker oscillates under Conway birth and survival rules', () => {
  const vertical = new Set(['2,1', '2,2', '2,3'])
  const horizontal = new Set(['1,2', '2,2', '3,2'])

  assert.deepEqual(stepLife(vertical, 5, 5), horizontal)
  assert.deepEqual(stepLife(horizontal, 5, 5), vertical)
})

test('dead and isolated cells stay dead, with no wrapping at the edge', () => {
  assert.deepEqual(stepLife(new Set(['0,0']), 5, 5), new Set())
  assert.deepEqual(stepLife(new Set(['0,0', '4,0', '0,4']), 5, 5), new Set())
})

test('a block survives while an overcrowded centre cell dies', () => {
  const block = new Set(['1,1', '1,2', '2,1', '2,2'])
  assert.deepEqual(stepLife(block, 5, 5), block)

  const crowded = new Set(['1,1', '1,2', '1,3', '2,1', '2,2', '2,3', '3,1', '3,2', '3,3'])
  assert.equal(stepLife(crowded, 5, 5).has('2,2'), false)
})

test('cells that touch a padded content exclusion zone are blocked', () => {
  const content = [{ left: 30, top: 20, right: 90, bottom: 70 }]

  assert.equal(cellIntersectsRects(15, 10, 10, content, 8), true)
  assert.equal(cellIntersectsRects(0, 0, 10, content, 8), false)
  assert.equal(cellIntersectsRects(98, 78, 10, content, 8), true)
  assert.equal(cellIntersectsRects(109, 89, 10, content, 8), false)
})

test('live cells hidden behind content do not count as visible life', () => {
  const live = new Set(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0'])
  const content = [{ left: 0, top: 0, right: 110, bottom: 20 }]

  assert.deepEqual(getDrawableCells(live, 15, 10, content, 0), [])
})
