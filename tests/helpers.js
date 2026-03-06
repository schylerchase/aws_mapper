const { expect } = require('@playwright/test');

const BASE = 'http://localhost:8377/index.html';

/**
 * Navigate to the app and load demo data.
 * Waits for the landing page to disappear and SVG VPC groups to render.
 */
async function loadDemo(page) {
  // Skip onboarding overlay — set before navigation to avoid race with setTimeout trigger
  await page.addInitScript(() => localStorage.setItem('aws_mapper_onboarded', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('#landingDash').waitFor({ state: 'visible', timeout: 10000 });
  // Click demo via CTA button or landing button (loadDemo may be hidden in new UX)
  await page.evaluate(() => document.getElementById('loadDemo').click());
  await page.locator('#landingDash').waitFor({ state: 'hidden', timeout: 15000 });
  await page.locator('.vpc-group').first().waitFor({ state: 'attached', timeout: 15000 });
  return page;
}

/**
 * Count elements matching a selector.
 */
async function countElements(page, selector) {
  return page.locator(selector).count();
}

/**
 * Open the unified dashboard to a specific tab.
 */
async function openDashTab(page, tabId) {
  await page.evaluate((id) => openUnifiedDash(id), tabId);
  await page.locator('#udash.open').waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Click a subnet node in the SVG by dispatching a click event.
 * Playwright can't natively click SVG <g> elements, so we use evaluate.
 * Returns the subnet ID that was clicked.
 */
async function clickSubnet(page, index = 0) {
  const subnetId = await page.evaluate((idx) => {
    const nodes = document.querySelectorAll('.subnet-node');
    if (!nodes[idx]) return null;
    nodes[idx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return nodes[idx].getAttribute('data-subnet-id');
  }, index);
  // Wait for detail panel to open
  if (subnetId) {
    await page.locator('#detailPanel.open').waitFor({ state: 'visible', timeout: 5000 });
  }
  return subnetId;
}

/**
 * Get all console errors during a callback.
 * Filters out 404 errors for static assets (favicon, logo, etc.)
 */
async function captureErrors(page, fn) {
  const errors = [];
  const handler = (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore 404s for static assets — expected when serving locally
      if (text.includes('404') && text.includes('Failed to load resource')) return;
      errors.push(text);
    }
  };
  page.on('console', handler);
  await fn();
  page.off('console', handler);
  return errors;
}

module.exports = { BASE, loadDemo, countElements, openDashTab, clickSubnet, captureErrors };
