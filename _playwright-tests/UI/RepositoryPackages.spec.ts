import { test, expect } from '@playwright/test';
import { navigateToRepositories } from './helpers/navHelpers';
import { deleteAllRepos } from './helpers/deleteRepositories';
import { closePopupsIfExist, getRowByNameOrUrl } from './helpers/helpers';
const repoNamePrefix = 'snapshot-package-list-test';
const randomName = () => `${(Math.random() + 1).toString(36).substring(2, 6)}`;
const repoName = `${repoNamePrefix}-${randomName()}`;
const editedRepo = `${repoName}-Edited`;

test.describe('Snapshot Package Count and List', async () => {
  test('Verify package count and search functionality in snapshot details', async ({ page }) => {
    await navigateToRepositories(page);
    await closePopupsIfExist(page);
    await deleteAllRepos(page, `&search=${repoNamePrefix}`);

    await test.step('Create a repository', async () => {
      await page.getByRole('button', { name: 'Add repositories' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Add custom repositories' })).toBeVisible();
      await page.getByLabel('Name').fill(`${repoName}`);
      await page.getByLabel('Snapshotting').click();
      await page.getByLabel('URL').fill('https://jlsherrill.fedorapeople.org/fake-repos/signed/');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
    });

    await test.step('Wait for status to be "Valid"', async () => {
      const row = await getRowByNameOrUrl(page, repoName);
      await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
    });

    await test.step('Verify the package count matches the snapshot', async () => {
      const row = await getRowByNameOrUrl(page, repoName);
      const packageCountValue = await row.getByTestId('package_count_button').textContent();
      await page.getByRole('button', { name: 'Kebab toggle' }).click();
      await page.getByRole('menuitem', { name: 'View all snapshots' }).click();
      // click on the first row to view the snapshot details
      const snapshotPackagesColumn = await page
        .getByTestId('snapshot_package_count_button')
        .textContent();
      // assert the package count matches the after snapshot packages count
      expect(packageCountValue).toBe(snapshotPackagesColumn);
      await page.getByText('Close').click();
    });

    // Edit the repository to change number of packages
    await test.step('Update the repository', async () => {
      const row = await getRowByNameOrUrl(page, repoName);
      await row.getByLabel('Kebab toggle').click();
      await row.getByRole('menuitem', { name: 'Edit' }).click();
      await page.getByPlaceholder('Enter name', { exact: true }).fill(editedRepo);
      await page
        .getByLabel('URL')
        .fill('http://jlsherrill.fedorapeople.org/fake-repos/needed-errata/');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      const editedRow = await getRowByNameOrUrl(page, editedRepo);
      await expect(editedRow.getByText('Valid')).toBeVisible({ timeout: 60000 });
    });

    await test.step('Verify the package count matches the edited snapshot', async () => {
      const editedRow = await getRowByNameOrUrl(page, editedRepo);
      const editedRepoPackageCountValue = await editedRow
        .getByTestId('package_count_button')
        .textContent();
      await editedRow.getByRole('button', { name: 'Kebab toggle' }).click();
      await page.getByRole('menuitem', { name: 'View all snapshots' }).click();
      // refresh page to get the updated snapshot
      await page.reload();
      const editedRepoSnapshotPackagesColumn = await page
        .getByTestId('snapshot_package_count_button')
        .first()
        .textContent();
      expect(editedRepoPackageCountValue).toBe(editedRepoSnapshotPackagesColumn);
      await page.getByText('Close').click();
    });

    // Search the random predefined package in the package list on snapshot details page modal
    await test.step('Search for a predefined package in the package list', async () => {
      const editedRow = await getRowByNameOrUrl(page, editedRepo);
      await editedRow.getByTestId('package_count_button').click();
      await expect(page.getByRole('dialog', { name: 'Packages' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Filter by name' }).fill('bear');
      await expect(page.getByText('bear')).toBeVisible();
      // check that non exixiting package is not visible in the list
      await page.getByRole('textbox', { name: 'Filter by name' }).fill('non-existing-package');
      await expect(page.getByText('non-existing-package')).not.toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'No packages match the filter criteria' }),
      ).toBeVisible();
      await page.getByText('Close').click();
    });
    await test.step('Post test cleanup', async () => {
      await deleteAllRepos(page, `&search=${repoNamePrefix}`);
    });
  });
});
