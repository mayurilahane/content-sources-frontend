import { test, expect, cleanupTemplates, randomName, cleanupRepositories } from 'test-utils';
import { refreshSubscriptionManager, RHSMClient } from './helpers/rhsmClient';
import { runCmd } from './helpers/helpers';
import { navigateToRepositories, navigateToTemplates } from '../UI/helpers/navHelpers';
import { closePopupsIfExist, getRowByNameOrUrl, retry } from '../UI/helpers/helpers';
import path from 'path';

test.describe('Assign Template to System via UI', () => {
  const templateNamePrefix = 'Template_test_for_system_assignment';
  const uploadRepoNamePrefix = 'Upload_Repo';

  test('Create template and assign to system using "Assign to systems" button', async ({
    page,
    client,
    cleanup,
  }) => {
    const templateName = `${templateNamePrefix}-${randomName()}`;
    const containerName = `RHSMClientTest-${randomName()}`;
    const regClient = new RHSMClient(containerName);
    let hostname = '';
    const uploadRepoName = `${uploadRepoNamePrefix}${randomName()}`;

    await cleanup.runAndAdd(() => cleanupTemplates(client, templateName));
    await cleanup.runAndAdd(() => cleanupRepositories(client, uploadRepoNamePrefix));
    cleanup.add(() => regClient.Destroy('rhc'));
    await closePopupsIfExist(page);

    await test.step('Create upload repository', async () => {
      await navigateToRepositories(page);
      await page.getByRole('button', { name: 'Add repositories' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Add custom repositories' })).toBeVisible();
      await page.getByPlaceholder('Enter name').fill(uploadRepoName);
      await page.getByLabel('Upload', { exact: true }).check();
      await page.getByRole('button', { name: 'filter architecture' }).click();
      await page.getByRole('menuitem', { name: 'x86_64' }).click();
      await page.getByRole('button', { name: 'filter OS version' }).click();
      await page.getByRole('menuitem', { name: 'el9' }).click();
      await Promise.all([
        page.getByRole('button', { name: 'Save and upload content' }).click(),
        page.waitForResponse(
          (resp) =>
            resp.url().includes('/bulk_create/') && resp.status() >= 200 && resp.status() < 300,
          { timeout: 600000 },
        ),
      ]);
      const filePath = path.join(__dirname, '../UI/fixtures/bear-4.1-1.noarch.rpm');
      await retry(page, async (page) => {
        const fileInput = page.locator('input[type=file]').first();
        await fileInput.setInputFiles(filePath);
      });
      await expect(page.getByText('All uploads completed!')).toBeVisible({ timeout: 60000 });
      await page.getByRole('button', { name: 'Confirm changes' }).click();
      const row = await getRowByNameOrUrl(page, uploadRepoName);
      await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
    });

    await test.step('Create template', async () => {
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
      await page.getByPlaceholder('Enter name').fill(templateName);
      await page.getByPlaceholder('Description').fill('Test template for system assignment');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Create other options' }).click();
      await page.getByText('Create template only', { exact: true }).click();
      const rowTemplate = await getRowByNameOrUrl(page, templateName);
      await expect(rowTemplate.getByText('Valid')).toBeVisible({ timeout: 660000 });
    });

    await test.step('Boot and register RHSM client', async () => {
      await regClient.Boot('rhel9');
      const hostnameResult = await runCmd('Get hostname', ['hostname'], regClient);
      hostname = hostnameResult?.stdout?.toString().trim() || '';
      console.log('Container hostname:', hostname);

      const reg = await regClient.RegisterRHC(process.env.ACTIVATION_KEY_1, process.env.ORG_ID_1);
      if (reg?.exitCode != 0) {
        console.log('Registration stdout:', reg?.stdout);
        console.log('Registration stderr:', reg?.stderr);
      }
      expect(reg?.exitCode, 'Expect registering to be successful').toBe(0);
    });

    await test.step('Assign template to systems', async () => {
      await navigateToTemplates(page);
      await expect(page.getByRole('button', { name: templateName })).toBeVisible();
      await page.getByRole('button', { name: templateName }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(templateName);
      await page.getByRole('tab', { name: 'Systems' }).click();
      await expect(page.getByRole('button', { name: 'Assign to systems' })).toBeVisible({
        timeout: 30000,
      });

      await page.getByRole('button', { name: 'Assign to systems' }).click();
      const modalPage = page.getByTestId('system_modal');
      const rowSystem = await getRowByNameOrUrl(modalPage, hostname);
      await rowSystem.getByLabel('Select row').click();

      await expect(modalPage.getByRole('button', { name: 'Assign', exact: true })).toBeVisible({
        timeout: 30000,
      });
      await modalPage.getByRole('button', { name: 'Assign', exact: true }).click();
      await expect(modalPage.getByText('Template successfully added to 1 system')).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByRole('tab', { name: 'Systems' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        page.getByRole('grid', { name: 'assign systems table' }).getByText(hostname),
      ).toBeVisible({ timeout: 30000 });
      await expect(rowSystem).toBeVisible({ timeout: 30000 });
    });

    await test.step('Verify the host can install packages from the template', async () => {
      await runCmd(
        'bear should not be installed initially',
        ['rpm', '-q', 'bear'],
        regClient,
        60000,
        1,
      );

      await refreshSubscriptionManager(regClient);
      await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);

      await runCmd(
        'Install bear from template',
        ['yum', 'install', '-y', 'bear'],
        regClient,
        60000,
      );
      await runCmd('Verify bear is installed', ['rpm', '-q', 'bear'], regClient);
      const dnfVerifyRepo = await runCmd(
        'Verify that bear was installed from the upload repo',
        ['sh', '-c', "dnf info bear | grep '^From repo' | cut -d ':' -f2-"],
        regClient,
      );
      expect(dnfVerifyRepo?.stdout?.toString().trim()).toBe(uploadRepoName);
    });
  });

  test('Create template and assign to system using "Create template and add to systems" button', async ({
    page,
    client,
    cleanup,
  }) => {
    const templateName = `${templateNamePrefix}-${randomName()}`;
    const containerName = `RHSMClientTest-${randomName()}`;
    const regClient = new RHSMClient(containerName);
    let hostname = '';
    const uploadRepoName = `${uploadRepoNamePrefix}_${randomName()}`;

    await cleanup.runAndAdd(() => cleanupTemplates(client, templateName));
    await cleanup.runAndAdd(() => cleanupRepositories(client, uploadRepoNamePrefix));
    cleanup.add(() => regClient.Destroy('rhc'));
    await closePopupsIfExist(page);

    await test.step('Create upload repository', async () => {
      await navigateToRepositories(page);
      await page.getByRole('button', { name: 'Add repositories' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Add custom repositories' })).toBeVisible();
      await page.getByPlaceholder('Enter name').fill(uploadRepoName);
      await page.getByLabel('Upload', { exact: true }).check();
      await page.getByRole('button', { name: 'filter architecture' }).click();
      await page.getByRole('menuitem', { name: 'x86_64' }).click();
      await page.getByRole('button', { name: 'filter OS version' }).click();
      await page.getByRole('menuitem', { name: 'el9' }).click();
      await Promise.all([
        page.getByRole('button', { name: 'Save and upload content' }).click(),
        page.waitForResponse(
          (resp) =>
            resp.url().includes('/bulk_create/') && resp.status() >= 200 && resp.status() < 300,
          { timeout: 600000 },
        ),
      ]);
      const filePath = path.join(__dirname, '../UI/fixtures/cat-1.0-1.noarch.rpm');
      await retry(page, async (page) => {
        const fileInput = page.locator('input[type=file]').first();
        await fileInput.setInputFiles(filePath);
      });
      await expect(page.getByText('All uploads completed!')).toBeVisible({ timeout: 60000 });
      await page.getByRole('button', { name: 'Confirm changes' }).click();
      const row = await getRowByNameOrUrl(page, uploadRepoName);
      await expect(row.getByText('Valid')).toBeVisible({ timeout: 60000 });
    });

    await test.step('Create template', async () => {
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
      await page.getByPlaceholder('Enter name').fill(templateName);
      await page.getByPlaceholder('Description').fill('Test template for system assignment');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Create template and add to systems' }).click();
      await expect(page.getByText(`Content Template "${templateName}" created`)).toBeVisible({
        timeout: 30000,
      });
    });

    await test.step('Boot and register RHSM client', async () => {
      await regClient.Boot('rhel9');
      const hostnameResult = await runCmd('Get hostname', ['hostname'], regClient);
      hostname = hostnameResult?.stdout?.toString().trim() || '';
      console.log('Container hostname:', hostname);
      const reg = await regClient.RegisterRHC(process.env.ACTIVATION_KEY_1, process.env.ORG_ID_1);
      if (reg?.exitCode != 0) {
        console.log('Registration stdout:', reg?.stdout);
        console.log('Registration stderr:', reg?.stderr);
      }
      expect(reg?.exitCode, 'Expect registering to be successful').toBe(0);
      await refreshSubscriptionManager(regClient);
      await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);
    });

    await test.step('Assign template to systems', async () => {
      await expect(page.getByText('Assign template to systems')).toBeVisible({ timeout: 30000 });
      const modalPage = page.getByTestId('system_modal');
      const rowSystem = await getRowByNameOrUrl(modalPage, hostname);
      await rowSystem.getByLabel('Select row').click();

      await expect(modalPage.getByRole('button', { name: 'Assign', exact: true })).toBeVisible({
        timeout: 30000,
      });
      await modalPage.getByRole('button', { name: 'Assign', exact: true }).click();
      await expect(page.getByText('Template successfully added to 1 system')).toBeVisible({
        timeout: 30000,
      });

      await expect(page.getByRole('tab', { name: 'Systems' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        page.getByRole('grid', { name: 'assign systems table' }).getByText(hostname),
      ).toBeVisible({ timeout: 30000 });
      await expect(rowSystem).toBeVisible({ timeout: 30000 });
    });

    await test.step('Verify the host can install packages from the template', async () => {
      await runCmd(
        'cat should not be installed initially',
        ['rpm', '-q', 'cat'],
        regClient,
        60000,
        1,
      );

      await refreshSubscriptionManager(regClient);
      await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);

      await runCmd('Install cat from template', ['yum', 'install', '-y', 'cat'], regClient, 60000);
      await runCmd('Verify cat is installed', ['rpm', '-q', 'cat'], regClient);
      const dnfVerifyRepo = await runCmd(
        'Verify that cat was installed from the upload repo',
        ['sh', '-c', "dnf info cat | grep '^From repo' | cut -d ':' -f2-"],
        regClient,
      );
      expect(dnfVerifyRepo?.stdout?.toString().trim()).toBe(uploadRepoName);
    });
  });
});
