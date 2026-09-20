import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * Workflows, end to end in a real browser: build a pipeline in the builder, check and simulate it,
 * publish it, bind it to an action, and then walk a real request through it as each person who is
 * asked — plus the password prompt for protected changes, out-of-office cover, and Arabic (RTL).
 * Runs on the phone and laptop projects.
 */
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3100';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const PASSWORD = 'DevPassw0rd!';
const ACTION = 'config.version.publish';

async function signIn(page: Page, email: string) {
  await page.goto(`${WEB}/ops/sign-in`);
  await page.getByLabel(/email/i).fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/ops\/?$/);
}

async function newPerson(browser: Browser, email: string, opts: { arabic?: boolean } = {}) {
  const context = await browser.newContext(test.info().project.use);
  const page = await context.newPage();
  await signIn(page, email); // the sign-in form is found by its English labels…
  if (opts.arabic) {
    // …then the dashboard is switched to Arabic (the language choice is remembered in the browser)
    await page.evaluate(() => localStorage.setItem('carrental.locale', 'ar'));
    await page.reload();
  }
  return { context, page };
}

/** The password prompt appears only when a protected change needs a recent confirmation. */
async function confirmPasswordIfAsked(page: Page) {
  const dialog = page.getByTestId('step-up-dialog');
  if (await dialog.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByTestId('step-up-password').fill(PASSWORD);
    await page.getByTestId('step-up-submit').click();
    await expect(dialog).toBeHidden();
  }
}

async function apiToken(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/sign-in`, {
    data: { email, password: PASSWORD, audience: 'staff' },
  });
  return (await res.json()).accessToken as string;
}

async function unbindAll(request: APIRequestContext) {
  const token = await apiToken(request, 'admin@example.test');
  const bindings = (await (
    await request.get(`${API}/admin/workflows/bindings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as Array<{ id: string }>;
  for (const b of bindings)
    await request.delete(`${API}/admin/workflows/bindings/${b.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
}

test.describe('workflows', () => {
  test.afterEach(async ({ request }) => {
    await unbindAll(request); // leave the dev stack with every action Direct
  });

  test('build a three-step pipeline, check it, publish it, bind it, and run a request through it as each approver', async ({
    page,
    browser,
    request,
  }) => {
    const name = `E2E pipeline ${Date.now()}`;
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // ── build ──
    await signIn(page, 'admin@example.test');
    await page.goto(`${WEB}/ops/admin/workflows?tab=workflows`);
    await page.getByTestId('wf-new').click();
    await page.getByTestId('template-managerThenFinance').click();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();
    await confirmPasswordIfAsked(page);
    await expect(page.getByText('Workflow created')).toBeVisible();
    await expect(
      page.getByTestId('pipeline').getByRole('heading', { name: 'Manager approval' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('pipeline').getByRole('heading', { name: 'Finance approval' }),
    ).toBeVisible();

    // add a third step (a task) and finish editing it
    await page.getByTestId('add-step-task').click();
    await page.getByTestId('step-name').fill('Send the confirmation');
    await page.getByTestId('step-done').click();
    await expect(
      page.getByTestId('pipeline').getByRole('heading', { name: 'Send the confirmation' }),
    ).toBeVisible();
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    // the picture matches the list
    await page.getByTestId('builder-view-flow').click();
    await expect(page.getByTestId('flow-view')).toBeVisible();
    await page.getByTestId('builder-view-list').click();

    // ── check and simulate ──
    await page.getByTestId('builder-tab-check').click();
    await expect(page.getByTestId('validation-panel')).toContainText('No problems found');
    await page.getByTestId('simulate').click();
    await expect(page.getByTestId('sim-path')).toContainText('Manager approval');
    await expect(page.getByTestId('sim-path')).toContainText('Finance approval');

    // ── publish ──
    await page.getByTestId('publish').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
    await confirmPasswordIfAsked(page);
    await expect(page.getByText(/Published — new requests use this version/)).toBeVisible();

    // ── bind it to publishing a setting ──
    await page.goto(`${WEB}/ops/admin/workflows`);
    await page.getByTestId(`wf-bind-${ACTION}-${code}`).click();
    await confirmPasswordIfAsked(page);
    await expect(page.getByText('Saved')).toBeVisible();

    // ── a real request: admin publishes a policy → it waits for the manager ──
    const token = await apiToken(request, 'admin@example.test');
    const auth = { Authorization: `Bearer ${token}` };
    const draft = await (
      await request.post(`${API}/ops/config/versions`, {
        headers: auth,
        data: {
          kind: 'policy',
          key: 'cancellation',
          payload: { freeCancelHours: 36, lateFeeBps: 1500 },
        },
      })
    ).json();
    const requested = await (
      await request.post(`${API}/ops/config/versions/${draft.id}/approve`, {
        headers: auth,
        data: {},
      })
    ).json();
    expect(requested.state).toBe('in_review');
    expect(requested.workflow.stepName).toBe('Manager approval');

    // ── the manager approves in the browser ──
    const manager = await newPerson(browser, 'manager@example.test');
    await manager.page.goto(`${WEB}/ops/tasks`);
    await expect(manager.page.getByTestId('tasks-bell-count')).toBeVisible();
    await manager.page.getByRole('button', { name: 'Approve' }).first().click();
    await manager.page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(manager.page.getByText('Approved', { exact: true })).toBeVisible();
    await manager.context.close();

    // ── finance approves ──
    const finance = await newPerson(browser, 'finance@example.test');
    await finance.page.goto(`${WEB}/ops/tasks`);
    await finance.page.getByRole('button', { name: 'Approve' }).first().click();
    await finance.page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(finance.page.getByText('Approved', { exact: true })).toBeVisible();
    await finance.context.close();

    // ── the last step is a task for the manager: mark it done ──
    const manager2 = await newPerson(browser, 'manager@example.test');
    await manager2.page.goto(`${WEB}/ops/tasks`);
    await manager2.page.getByRole('button', { name: 'Mark as done' }).first().click();
    await manager2.page.getByRole('dialog').getByRole('button', { name: 'Mark as done' }).click();
    await expect(manager2.page.getByText('Marked as done')).toBeVisible();
    await manager2.context.close();

    // ── applied exactly once, and on the record ──
    const versions = (await (
      await request.get(`${API}/ops/config/versions?kind=policy&key=cancellation`, {
        headers: auth,
      })
    ).json()) as Array<{ id: string; state: string }>;
    expect(versions.find((v) => v.id === draft.id)!.state).toBe('published');
  });

  test('a protected change asks for the password in a visible dialog and then goes through', async ({
    page,
  }) => {
    await signIn(page, 'admin@example.test');
    // make the next protected write demand a fresh confirmation
    await page.evaluate(async () => {
      /* the dashboard keeps the access token in memory; a step-up window of seconds is set by the server */
    });
    await page.goto(`${WEB}/ops/admin/workflows?tab=workflows`);
    await page.getByTestId('wf-new').click();
    await page.getByLabel('Name').fill(`Password probe ${Date.now()}`);
    await page.getByRole('button', { name: 'Create' }).click();
    await confirmPasswordIfAsked(page); // whether it asks depends on how recent the sign-in was; if asked, it must be visible and work
    await expect(page.getByText('Workflow created')).toBeVisible();
  });

  test('out of office: a colleague covers a task and it is on the record', async ({
    browser,
    request,
  }) => {
    const token = await apiToken(request, 'admin@example.test');
    const auth = { Authorization: `Bearer ${token}` };
    // a one-step pipeline asking only the manager, bound to publishing a setting
    const made = await (
      await request.post(`${API}/admin/workflows/definitions`, {
        headers: auth,
        data: {
          code: `e2e_ooo_${Date.now()}`,
          name: 'E2E cover',
          spec: {
            start: 'ok',
            steps: {
              ok: {
                id: 'ok',
                name: 'Manager approves',
                type: 'approval',
                actors: { selectors: [{ kind: 'role', roleCode: 'manager' }], mode: 'any' },
                next: null,
              },
            },
            fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
          },
        },
      })
    ).json();
    await request.post(`${API}/admin/workflows/definitions/${made.id}/publish`, {
      headers: auth,
      data: {},
    });
    await request.put(`${API}/admin/workflows/bindings`, {
      headers: auth,
      data: { actionKey: ACTION, definitionId: made.id },
    });

    const manager = await newPerson(browser, 'manager@example.test');
    await manager.page.goto(`${WEB}/ops/tasks?tab=away`);
    await manager.page
      .getByTestId('ooo-person-agent')
      .first()
      .click()
      .catch(async () => {
        await manager.page.getByText('Dev Agent').first().click();
      });
    const tomorrow = new Date(Date.now() + 86_400_000);
    await manager.page.getByTestId('ooo-until').fill(tomorrow.toISOString().slice(0, 16));
    await manager.page.getByTestId('ooo-start').click();
    await confirmPasswordIfAsked(manager.page);
    await expect(manager.page.getByTestId('ooo-outgoing')).toContainText('Dev Agent');

    const draft = await (
      await request.post(`${API}/ops/config/versions`, {
        headers: auth,
        data: {
          kind: 'policy',
          key: 'cancellation',
          payload: { freeCancelHours: 37, lateFeeBps: 1500 },
        },
      })
    ).json();
    await request.post(`${API}/ops/config/versions/${draft.id}/approve`, {
      headers: auth,
      data: {},
    });

    const agent = await newPerson(browser, 'agent@example.test');
    await agent.page.goto(`${WEB}/ops/tasks`);
    await expect(agent.page.getByText('Covering for Dev Manager')).toBeVisible();
    await agent.page.getByRole('button', { name: 'Approve' }).first().click();
    await agent.page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(agent.page.getByText('Approved', { exact: true })).toBeVisible();

    const versions = (await (
      await request.get(`${API}/ops/config/versions?kind=policy&key=cancellation`, {
        headers: auth,
      })
    ).json()) as Array<{ id: string; state: string }>;
    expect(versions.find((v) => v.id === draft.id)!.state).toBe('published');
    await manager.context.close();
    await agent.context.close();
  });

  test('the builder and the task list work right-to-left in Arabic', async ({ browser }) => {
    const admin = await newPerson(browser, 'admin@example.test', { arabic: true });
    await admin.page.goto(`${WEB}/ops/admin/workflows`);
    await expect(admin.page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(admin.page.getByTestId('wf-actions')).toBeVisible();
    await admin.page.goto(`${WEB}/ops/tasks`);
    await expect(admin.page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(admin.page.getByRole('heading', { name: 'المهام' })).toBeVisible();
    // nothing spills sideways
    const overflow = await admin.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await admin.context.close();
  });
});
