import { test, expect } from '@playwright/test';
import { navigateToRepositories, navigateToTemplates } from './helpers/navHelpers';
import { deleteAllRepos } from './helpers/deleteRepositories';
import {
  closePopupsIfExist,
  getRowByNameOrUrl,
  validateSnapshotTimestamp,
} from './helpers/helpers';

test.describe('Snapshot Repositories', () => {
  test('Snapshot a repository', async ({ page }) => {
    await navigateToRepositories(page);
    await closePopupsIfExist(page);

    const repoName = 'one';

    await test.step('Cleanup repository, if using the same url', async () => {
      await deleteAllRepos(
        page,
        `&url=https://jlsherrill.fedorapeople.org/fake-repos/revision/` + repoName,
      );
    });

    await test.step('Open the add repository modal', async () => {
      await page.getByRole('button', { name: 'Add repositories' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Add custom repositories' })).toBeVisible();
    });

    await test.step('Fill in the repository details', async () => {
      await page.getByLabel('Name').fill(repoName);
      await page
        .getByLabel('URL')
        .fill('https://jlsherrill.fedorapeople.org/fake-repos/revision/' + repoName);
    });

    await test.step('Filter by architecture', async () => {
      await page.getByRole('button', { name: 'filter architecture' }).click();
      await page.getByRole('option', { name: 'x86_64' }).click();
    });

    await test.step('Filter by version', async () => {
      const versionFilterButton = page.getByRole('button', { name: 'filter version' });
      await versionFilterButton.click();
      await page.getByRole('menuitem', { name: 'el9' }).locator('label').click();
      await page.getByRole('menuitem', { name: 'el8' }).locator('label').click();
      await versionFilterButton.click(); // Close the version filter dropdown
    });

    await test.step('Submit the form and wait for modal to disappear', async () => {
      await Promise.all([
        // Click on 'Save'
        page.getByRole('button', { name: 'Save' }).first().click(),
        page.waitForResponse(
          (resp) =>
            resp.url().includes('/bulk_create/') && resp.status() >= 200 && resp.status() < 300,
        ),
        expect(page.getByRole('dialog', { name: 'Add custom repositories' })).not.toBeVisible(),
      ]);
    });

    await test.step('Verify that snapshot is successful', async () => {
      const row = await getRowByNameOrUrl(page, repoName);
      await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
    });

    await test.step('Verify that snapshot is in snapshots list', async () => {
      const row = await getRowByNameOrUrl(page, repoName);
      await row.getByLabel('Kebab toggle').click();
      await page.getByRole('menuitem', { name: 'View all snapshots' }).click();
      await expect(page.getByLabel('SnapshotsView list of').locator('tbody')).toBeVisible();
      const snapshotTimestamp = await page
        .getByLabel('SnapshotsView list of')
        .locator('tbody')
        .textContent();
      if (snapshotTimestamp != null) {
        if ((await validateSnapshotTimestamp(snapshotTimestamp, 10)) == false) {
          throw new Error('Most recent snapshot timestamp is older than 10 minutes!');
        }
      } else {
        throw new Error('Snapshot timestamp not found!');
      }
      await page.getByLabel('Close', { exact: true }).click();
    });

    await test.step('Delete created repository', async () => {
      const row = await getRowByNameOrUrl(
        page,
        'https://jlsherrill.fedorapeople.org/fake-repos/revision/' + repoName,
      );
      await row.getByLabel('Kebab toggle').click();
      await row.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByText('Remove repositories?')).toBeVisible();

      await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes('bulk_delete') && resp.status() >= 200 && resp.status() < 300,
        ),
        page.getByRole('button', { name: 'Remove' }).click(),
      ]);

      await expect(row).not.toBeVisible();
    });
  });
});

test('Snapshot deletion', async ({ page }) => {
  await navigateToRepositories(page);
  await closePopupsIfExist(page);

  const repoNamePrefix = 'snapshot-deletion';
  const randomName = () => `${(Math.random() + 1).toString(36).substring(2, 6)}`;
  const repoName = `${repoNamePrefix}-${randomName()}`;
  const templateName = `Test-template-${randomName()}`;

  await test.step('Create a repository', async () => {
    await page.getByRole('button', { name: 'Add repositories' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Add custom repositories' })).toBeVisible();
    await page.getByLabel('Name').fill(`${repoName}`);
    await page.getByLabel('Snapshotting').click();
    await page.getByLabel('URL').fill('https://fedorapeople.org/groups/katello/fakerepos/zoo/');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const row = await getRowByNameOrUrl(page, repoName);
    await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
  });

  // Edit the repository and create snapshots
  await test.step('Create a repository', async () => {
    const row = await getRowByNameOrUrl(page, repoName);
    await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
    for (let i = 2; i <= 4; i++) {
      await test.step(`Edit repository and create snapshot ${i}`, async () => {
        // Open the edit modal
        await row.getByLabel('Kebab toggle').click();
        await row.getByRole('menuitem', { name: 'Edit' }).click();
        await page
          .getByLabel('URL')
          .fill(`https://fedorapeople.org/groups/katello/fakerepos/zoo/${i}/`);
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
      });
    }
    // Verify the snapshot count for the repo.
    await row.getByTestId('snapshot_list_table').textContent();
    // Create a template which uses the repo and assert that is uses the latest snapshot
    await navigateToTemplates(page);
    await page.getByRole('button', { name: 'Add content template' }).click();
    await page.getByRole('button', { name: 'Select architecture' }).click();
    await page.getByRole('option', { name: 'aarch64' }).click();
    await page.getByRole('button', { name: 'Select version' }).click();
    await page.getByRole('option', { name: 'el9' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // search for row in the add content template modal
    await page.getByRole('textbox', { name: 'Filter by name/url' }).fill(repoName);
    await page.getByRole('gridcell', { name: 'Select row' }).locator('label').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio', { name: 'Use latest content' }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByPlaceholder('Enter name').fill(``);
    await page.getByPlaceholder('Description').fill('Template test');
    await expect(page.getByText('Valid')).toBeVisible({ timeout: 60000 });
    // Verify the template is created and uses the latest snapshot
    const templateRow = await getRowByNameOrUrl(page, templateName);
    await expect(templateRow.getByText('Valid')).toBeVisible({ timeout: 60000 });
    const templateSnapshotCount = await templateRow
      .getByTestId('snapshot_list_table')
      .textContent();
  });

  // Assert that the template snapshot count matches the repo snapshot count
  // Test deletion of a single snapshot.
  // Test bulk deletion of multiple snapshots.
});
