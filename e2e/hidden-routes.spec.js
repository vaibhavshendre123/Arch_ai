import { expect, test } from '@playwright/test'

import { register } from './support/helpers.js'

/**
 * The routes that Phase 8 left at URL-only coverage: proven to render, never exercised.
 *
 * `/comparison` re-simulates both of a project's versions under the current workload, and
 * `/interview` and `/learning` are self-contained browser features. None of them needs the
 * simulation, so they are covered on their own rather than as part of the pipeline chain.
 */

test.describe('architecture comparison', () => {
  /** Registers, creates a versioned project, and opens the comparison page. */
  async function openComparison(page) {
    await register(page, { name: 'Compare User' })
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Create Project' }).first().click()
    const form = page.locator('form').filter({ hasText: 'Create project' })
    await form.getByPlaceholder('Payments Platform — v1').fill('Compare Target')
    await form.getByRole('button', { name: 'Create project' }).click()
    await expect(page.locator('tr').filter({ has: page.getByText('Compare Target', { exact: true }) })).toBeVisible()

    await page.goto('/comparison')
    await expect(page).toHaveURL(/\/comparison$/)
  }

  test('loads for a project and declares its method', async ({ page }) => {
    await openComparison(page)
    await expect(page.getByRole('heading', { name: 'Architecture Comparison' })).toBeVisible({
      timeout: 60000,
    })
    await expect(page.getByText(/Two versions of the same project/)).toBeVisible()
  })

  test('is reachable by URL while absent from the sidebar', async ({ page }) => {
    await openComparison(page)
    await expect(page.getByRole('heading', { name: 'Architecture Comparison' })).toBeVisible({
      timeout: 60000,
    })
    // Withdrawn in the navigation cleanup, but deliberately not deleted.
    await expect(page.locator('nav').getByRole('link', { name: 'Compare Architectures' })).toHaveCount(0)
  })

  test('asks for saved versions rather than inventing a verdict', async ({ page }) => {
    await openComparison(page)
    // A brand new project has no version history, so the honest outcome is a prompt to make
    // one — not a comparison invented from nothing.
    await expect(
      page.getByText(/no saved versions|version history could not be read/i),
    ).toBeVisible({ timeout: 60000 })
  })
})

test.describe('interview practice', () => {
  test('starts a session with an unanswered question', async ({ page }) => {
    await register(page, { name: 'Interview User' })
    await page.goto('/interview')

    await expect(page.getByRole('heading', { name: 'AI Interview Practice' })).toBeVisible()
    await expect(page.getByText('Questions Attempted')).toBeVisible()
    await expect(page.getByText('Current Topic')).toBeVisible()
    await expect(page.getByText('Scalability')).toBeVisible()
    await expect(page.getByRole('textbox')).toBeVisible()
  })

  test('keeps the score unanswered until something is submitted', async ({ page }) => {
    await register(page, { name: 'Interview Score' })
    await page.goto('/interview')

    await expect(page.getByText('Questions Attempted')).toBeVisible()
    // "0" alone also matches the average-score placeholder, so the counter is read from the
    // card that carries the label rather than matched page-wide. StatCard renders the label
    // and the value as siblings, so the card is their common ancestor.
    const attempted = page
      .getByText('Questions Attempted')
      .locator('xpath=ancestor::div[contains(@class,"p-4")][1]')
    await expect(attempted).toContainText('0')
    // The average score stays a dash until an answer is submitted.
    await expect(page.getByText('Answer a question to begin')).toBeVisible()
    await expect(page.getByText('15 questions in the bank')).toBeVisible()
  })
})

test.describe('learning path', () => {
  test('renders its progress view with no interview history', async ({ page }) => {
    await register(page, { name: 'Learning User' })
    await page.goto('/learning')

    await expect(page.getByRole('heading', { name: 'Learning Progress' })).toBeVisible()
    await expect(page.getByText('Learning Analytics')).toBeVisible()
  })
})

test.describe('sign-in is still required', () => {
  test('each hidden route redirects to login when signed out', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)

    for (const route of ['/comparison', '/interview', '/learning']) {
      await page.goto(route)
      await expect(page, `${route} must not render while signed out`).toHaveURL(/\/login/)
    }
  })
})