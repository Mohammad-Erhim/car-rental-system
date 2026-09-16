import { expect, test, type Page, type TestInfo } from '@playwright/test';

const PUBLIC_ROUTES = [
  { path: '/en', heading: 'Rent a car that fits the trip' },
  { path: '/en/search', heading: 'Available vehicles' },
  { path: '/en/vehicles', heading: 'A car for every kind of trip' },
  { path: '/en/locations', heading: 'Pickup locations' },
  { path: '/en/help', heading: 'Help & FAQ' },
  { path: '/en/sign-in', heading: 'Sign in' },
  { path: '/en/register', heading: 'Create account' },
  { path: '/en/recovery', heading: 'Recover your account' },
];

test.describe('public customer UI validation', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} renders without console or network failures`, async ({
      page,
    }, testInfo) => {
      const monitor = monitorPage(page);
      await page.goto(route.path, { waitUntil: 'networkidle' });

      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
      await attachScreenshot(page, testInfo, route.path);
      expect(monitor.errors).toEqual([]);
      expect(monitor.failedRequests).toEqual([]);
    });
  }

  test('search form can choose a location and navigate to priced results', async ({
    page,
  }, testInfo) => {
    const monitor = monitorPage(page);
    await page.goto('/en/search', { waitUntil: 'networkidle' });

    await page.getByTestId('search-location').selectOption({ index: 1 });
    await page.getByRole('button', { name: /search/i }).click();

    await expect(page).toHaveURL(/\/en\/search\?.*pickup=/);
    await expect(page.getByText(/available/i).first()).toBeVisible();
    await attachScreenshot(page, testInfo, 'search-results');
    expect(monitor.errors).toEqual([]);
    expect(monitor.failedRequests).toEqual([]);
  });

  test('fleet card opens vehicle detail and exposes reserve controls', async ({
    page,
  }, testInfo) => {
    const monitor = monitorPage(page);
    await page.goto('/en/vehicles', { waitUntil: 'networkidle' });

    await page
      .getByRole('link', { name: /economy/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/vehicles\//);
    await expect(page.getByRole('heading', { name: /economy/i }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /check availability|reserve/i }).first(),
    ).toBeVisible();
    await attachScreenshot(page, testInfo, 'vehicle-detail');
    expect(monitor.errors).toEqual([]);
    expect(monitor.failedRequests).toEqual([]);
  });
});

function monitorPage(page: Page) {
  const errors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    if (reason.includes('net::ERR_ABORTED')) return;
    failedRequests.push(`${request.method()} ${request.url()} ${reason}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) failedRequests.push(`${response.status()} ${response.url()}`);
  });

  return { errors, failedRequests };
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''), {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}
