// demo comments

import path from 'path';
import {
  test,
  expect,
  cleanupRepositories,
  cleanupTemplates,
  randomName,
  waitWhileRepositoryIsPending,
} from 'test-utils';
import { RHSMClient, refreshSubscriptionManager } from './helpers/rhsmClient';
import { runCmd } from './helpers/helpers';
import { navigateToRepositories, navigateToTemplates } from '../UI/helpers/navHelpers';
import {
  closeGenericPopupsIfExist,
  getRowByNameOrUrl,
  retry,
  closeNotificationPopup,
} from '../UI/helpers/helpers';

const uploadRepoNamePrefix = 'Upload_Repo';
test.describe('Install Upload Repo Content', () => {
  test('Install Upload Repo Content', async ({ page, client, cleanup }) => {
    // Increase timeout for CI environment because template validation can take up to 11 minutes
    test.setTimeout(900000); // 15 minutes

    const uploadRepoName = `${uploadRepoNamePrefix}_${randomName()}`;
    const templateNamePrefix = 'integration_test_upload_repo';
    const templateName = `${templateNamePrefix}_${randomName()}`;
    const hostname = `RHSMClientTest_${randomName()}`;
    const regClient = new RHSMClient(hostname);

    await test.step('Set up cleanup for repositories, templates, and RHSM client', async () => {
      await cleanup.runAndAdd(() => cleanupRepositories(client, uploadRepoNamePrefix));
      await cleanup.runAndAdd(() => cleanupTemplates(client, templateNamePrefix));
      cleanup.add(() => regClient.Destroy('rhc'));
    });

    await closeGenericPopupsIfExist(page);
    await navigateToRepositories(page);

    await test.step('Create upload repository', async () => {
      await page.getByRole('button', { name: 'Add repositories' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Add custom repositories' })).toBeVisible();
      await page.getByPlaceholder('Enter name').fill(uploadRepoName);
      await page.getByLabel('Upload', { exact: true }).check();
      await page.getByRole('button', { name: 'filter architecture' }).click();
      await page.getByRole('menuitem', { name: 'x86_64' }).click();
      await page.getByRole('button', { name: 'filter OS version' }).click();
      await page.getByRole('menuitem', { name: 'el9' }).click();
      const [, bulkCreateResponse] = await Promise.all([
        page.getByRole('button', { name: 'Save and upload content' }).click(),
        page.waitForResponse(
          (resp) =>
            resp.url().includes('/bulk_create/') && resp.status() >= 200 && resp.status() < 300,
          { timeout: 600000 },
        ),
      ]);

      // Upload can fail if repository is not valid HMS-9856
      // Poll API until repository is no longer pending, then verify it's Valid
      const bulkCreateData = await bulkCreateResponse.json();
      const repoUuid = bulkCreateData[0]?.uuid;
      expect(repoUuid).toBeTruthy();
      const repo = await waitWhileRepositoryIsPending(client, repoUuid);
      expect(repo.status).toBe('Valid');

      const filePath = path.join(__dirname, '../UI/fixtures/bear-4.1-1.noarch.rpm');
      await retry(page, async (page) => {
        const fileInput = page.locator('input[type=file]').first();
        await fileInput.setInputFiles(filePath);
      });
      await expect(page.getByText('All uploads completed!')).toBeVisible({ timeout: 240000 });
      await page.getByRole('button', { name: 'Confirm changes' }).click();
      await expect(page.getByRole('dialog', { name: 'Upload content' })).toBeHidden({
        timeout: 30000,
      });
      await closeNotificationPopup(page, `One rpm successfully uploaded to ${uploadRepoName}`);
      // Wait for the repository row to appear and reach Valid status
      const row = await getRowByNameOrUrl(page, uploadRepoName);
      await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
    });

    await test.step('Navigate to templates, and create a template with the upload repository', async () => {
      await navigateToTemplates(page);
      await expect(page.getByRole('button', { name: 'Create template' })).toBeVisible();
      await page.getByRole('button', { name: 'Create template' }).click();
      await page.getByRole('button', { name: 'filter architecture' }).click();
      await page.getByRole('menuitem', { name: 'x86_64' }).click();
      await page.getByRole('button', { name: 'filter OS version' }).click();
      await page.getByRole('menuitem', { name: 'el9' }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Additional Red Hat repositories', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Other repositories', exact: true }),
      ).toBeVisible();
      const modalPage = page.getByTestId('add_template_modal');
      const rowUploadRepo = await getRowByNameOrUrl(modalPage, uploadRepoName);
      await expect(rowUploadRepo.getByText('Valid')).toBeVisible({ timeout: 60000 });
      await rowUploadRepo.getByLabel('Select row').click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('Use the latest content', { exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('Enter template details')).toBeVisible();
      await page.getByPlaceholder('Enter name').fill(`${templateName}`);
      await page.getByPlaceholder('Description').fill('Template test for upload repository');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Create other options' }).click();
      await page.getByText('Create template only', { exact: true }).click();
      const rowTemplate = await getRowByNameOrUrl(page, `${templateName}`);
      await expect(rowTemplate.getByText('Valid')).toBeVisible({ timeout: 660000 });
    });

    await test.step('Register system with template using RHSM client', async () => {
      await regClient.Boot('rhel9');

      const reg = await regClient.RegisterRHC(
        process.env.ACTIVATION_KEY_1,
        process.env.ORG_ID_1,
        templateName,
      );
      if (reg?.exitCode != 0) {
        console.log('Registration stdout:', reg?.stdout);
        console.log('Registration stderr:', reg?.stderr);
      }
      expect(reg?.exitCode, 'Expect registering to be successful').toBe(0);

      await refreshSubscriptionManager(regClient);
      await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);
    });

    await test.step('Install from the template and verify the upload repository content is installed', async () => {
      await runCmd(
        'bear package should not be installed',
        ['rpm', '-q', 'bear'],
        regClient,
        60000,
        1,
      );
      await runCmd('Install bear package', ['yum', 'install', '-y', 'bear'], regClient, 60000);
      await runCmd('bear package should be installed', ['rpm', '-q', 'bear'], regClient);
      const dnfVerifyRepo = await runCmd(
        'Verify that bear was installed from the upload repo',
        ['sh', '-c', "dnf info bear | grep '^From repo' | cut -d ':' -f2-"],
        regClient,
      );
      expect(dnfVerifyRepo?.stdout?.toString().trim()).toBe(uploadRepoName);
    });
  });
});
