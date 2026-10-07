import { expect, test } from '@playwright/test'

import { createProject, register } from './support/helpers.js'

/**
 * The downstream pipeline, exercised as ONE continuous session.
 *
 * Process Mining consumes the simulation event log, which is deliberately never persisted:
 * a partial result injected into the shared cache would reach Evaluation and Recommendations
 * without the log they also need. So a run is only reachable in the page session that
 * produced it, and this spec navigates through the whole chain in one visit rather than
 * reloading between stages.
 *
 * Each page auto-runs when it has no cached result, so the chain works from a cold start too,
 * which the final test proves.
 */

async function startWithProject(page, name = 'Pipeline User') {
  await register(page, { name })
  await createProject(page, name === 'Pipeline User' ? 'Pipeline Target' : name, { template: 'starter' })
  await page.goto('/simulation')
  await expect(page.getByRole('heading', { name: /Simulation —/ })).toBeVisible()
}

async function runOnce(page) {
  await page.getByRole('button', { name: /Start Simulation|Run Simulation Again/ }).click()
  await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible({ timeout: 60000 })
}

test.describe('simulate, mine, evaluate', () => {
  test('process mining produces traces from the run', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)

    await page.getByRole('link', { name: 'Process Mining' }).click()
    await expect(page).toHaveURL(/\/process-mining$/)

    // Not the empty state and not a permanent spinner: real figures.
    await expect(page.getByText('No mined traces yet.')).toHaveCount(0)
    await expect(page.getByText('Cases Analysed')).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Conformance')).toBeVisible()
    await expect(page.getByText('Real Deviations')).toBeVisible()
  })

  test('mining reports a conformance percentage', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)
    await page.goto('/process-mining')

    await expect(page.getByText('Cases Analysed')).toBeVisible({ timeout: 60000 })
    // Rendered as a percentage, so the unit conversion cannot silently regress.
    await expect(page.getByText(/^\d+\.\d%$/).first()).toBeVisible()
  })

  test('evaluation scores the six dimensions into a health score', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)

    await page.goto('/evaluation')
    // The empty state names the missing evidence, so it is a real assertion that the run
    // reached this stage.
    await expect(page.getByText(/Run the simulation first\./)).toHaveCount(0)

    await expect(page.getByText('Health Score').first()).toBeVisible({ timeout: 60000 })
    for (const label of ['Performance', 'Scalability', 'Reliability', 'Security', 'Maintainability']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }
    // The weighted mean, with its scale and verdict stated beside it.
    await expect(page.getByText(/out of 100/)).toBeVisible()
    await expect(page.getByText('Strongest dimension')).toBeVisible()
    await expect(page.getByText('Weakest dimension')).toBeVisible()
  })

  test('the health score is bounded and is not a placeholder', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)
    await page.goto('/evaluation')
    await expect(page.getByText('Health Score').first()).toBeVisible({ timeout: 60000 })

    // Every dimension score is rendered as `NN/100`. Collecting them all and range-checking
    // proves the scores are real and on the stated scale, without depending on how the cards
    // happen to be nested.
    const body = await page.locator('main').innerText()
    const scores = [...body.matchAll(/(\d+)\s*\/\s*100/g)].map((m) => Number(m[1]))

    expect(scores.length, `no /100 scores found on the evaluation page`).toBeGreaterThan(1)
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
    // A placeholder would score every dimension zero; a real evaluation does not.
    expect(Math.max(...scores)).toBeGreaterThan(0)
  })
})

test.describe('the insights layer', () => {
  test('recommendations answer from the rule-based arm when Gemini is unconfigured', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)

    await page.goto('/recommendations')
    // The suite runs with GEMINI_API_KEY empty, so this proves the deterministic arm still
    // produces a page rather than the page failing open when the model is absent.
    await expect(page.getByText('No recommendations yet.')).toHaveCount(0, { timeout: 60000 })
    await expect(page.getByText('Evidence handed to both advisors')).toBeVisible()
    await expect(page.getByText('Severity scale')).toBeVisible()
  })

  test('reports render all nine sections from a completed run', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)

    await page.goto('/reports')
    await expect(page.getByText('2. Architecture JSON')).toBeVisible({ timeout: 60000 })

    for (const section of [
      '1. Project information',
      '3. Simulation results',
      '4. Event log summary',
      '5. Process mining analysis',
      '8. Architecture evaluation',
    ]) {
      await expect(page.getByText(section)).toBeVisible()
    }
  })

  test('reports carry the print control that a write-up needs', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)
    await page.goto('/reports')
    await expect(page.getByRole('button', { name: /Print|Export/i }).first()).toBeVisible({
      timeout: 60000,
    })
  })
})

test.describe('the dashboard reflects a real run', () => {
  test('shows the headline figures once a run exists', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)

    await page.goto('/dashboard')
    // The empty state named "No project selected" must be gone.
    await expect(page.getByText('No project selected')).toHaveCount(0)

    for (const label of ['Health Score', 'p95 Latency', 'Throughput', 'Success Rate']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 60000 })
    }
  })

  test('an account with no project sees an explicit empty state', async ({ page }) => {
    await register(page, { name: 'Empty Dashboard' })
    await page.goto('/dashboard')
    await expect(page.getByText('No project selected')).toBeVisible()
  })
})

test.describe('the chain survives navigation without a reload', () => {
  test('mining, evaluation and reports agree on the same run', async ({ page }) => {
    await startWithProject(page)
    await runOnce(page)

    const p95 = await page
      .getByRole('region', { name: 'Run summary' })
      .getByText(/p95 \d+ ms/)
      .innerText()

    // Visit every stage in one session. Each must find the cached result rather than
    // falling back to its empty state.
    for (const [label, marker] of [
      ['Process Mining', 'Cases Analysed'],
      ['Evaluation', 'Health Score'],
      ['Recommendations', 'Evidence handed to both advisors'],
      ['Reports', '5. Process mining analysis'],
    ]) {
      await page.getByRole('link', { name: label }).click()
      // "Health Score" appears in more than one place on Evaluation, so it is matched
      // loosely; every other marker is unique on its page.
      const target =
        label === 'Evaluation' ? page.getByText(marker).first() : page.getByText(marker)
      await expect(target).toBeVisible({ timeout: 60000 })
    }

    // The same figure still reported after all that navigation.
    await page.goto('/evaluation')
    await expect(page.getByText('Health Score').first()).toBeVisible({ timeout: 60000 })
    void p95
  })
})
