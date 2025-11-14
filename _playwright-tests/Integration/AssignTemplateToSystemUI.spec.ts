import { test, expect, cleanupTemplates, randomName } from 'test-utils';
import { refreshSubscriptionManager, RHSMClient } from './helpers/rhsmClient';
import { runCmd } from './helpers/helpers';
import { navigateToTemplates } from '../UI/helpers/navHelpers';
import { closePopupsIfExist, getRowByNameOrUrl } from '../UI/helpers/helpers';

test.describe('Assign Template to System via UI', () => {
  const templateNamePrefix = 'Template only_ui_test';

  test('Assign Template to System via UI - "Template only" button', async ({
    page,
    client,
    cleanup,
  }) => {
    const templateName = `${templateNamePrefix}-${randomName()}`;
    const containerName = `RHSMClientTest-${randomName()}`;
    const regClient = new RHSMClient(containerName);
    let hostname = '';

    await cleanup.runAndAdd(() => cleanupTemplates(client, templateNamePrefix));
    cleanup.add(() => regClient.Destroy('rhc'));

    await test.step('Create template', async () => {
      await navigateToTemplates(page);
      await closePopupsIfExist(page);
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

      await refreshSubscriptionManager(regClient);
      await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);
    });

    await test.step('Assign template to systems', async () => {
      await navigateToTemplates(page);
      await closePopupsIfExist(page);
      await expect(page.getByRole('button', { name: templateName })).toBeVisible();
      await page.getByRole('button', { name: templateName }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(templateName);
      await page.getByRole('tab', { name: 'Systems' }).click();
      await expect(page.getByRole('button', { name: 'Assign to systems' })).toBeVisible({
        timeout: 30000,
      });
      await page.getByRole('button', { name: 'Assign to systems' }).click();
      await expect(page.getByText('Assign template to systems')).toBeVisible({ timeout: 30000 });
      await page.getByRole('searchbox', { name: 'Filter by name' }).fill(hostname);
      const systemRow = page.getByRole('row').filter({ hasText: hostname });
      await expect(systemRow).toBeVisible({ timeout: 30000 });
      await systemRow.getByRole('checkbox').click();
      await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeVisible({
        timeout: 30000,
      });
      await page.getByRole('button', { name: 'Assign', exact: true }).click();
      //   await expect(page.getByText('Template successfully added to 1 system')).toBeVisible({
      //     timeout: 30000,
      //   });
      await expect(page.getByRole('tab', { name: 'Systems' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        page.getByRole('grid', { name: 'assign systems table' }).getByText(hostname),
      ).toBeVisible({ timeout: 30000 });
      await expect(systemRow).toBeVisible({ timeout: 30000 });
    });

    await test.step('Verify the host can install packages from the template', async () => {
      await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);

      await runCmd(
        'vim-enhanced should not be installed initially',
        ['rpm', '-q', 'vim-enhanced'],
        regClient,
        60000,
        1,
      );

      await runCmd(
        'Install vim-enhanced from template',
        ['yum', 'install', '-y', 'vim-enhanced'],
        regClient,
        60000,
      );
      await runCmd('Verify vim-enhanced is installed', ['rpm', '-q', 'vim-enhanced'], regClient);
    });
  });

  await test.step('Verify the host can install packages from the template', async () => {
    await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);

    await runCmd(
      'vim-enhanced should not be installed initially',
      ['rpm', '-q', 'vim-enhanced'],
      regClient,
      60000,
      1,
    );

    await runCmd(
      'Install vim-enhanced from template',
      ['yum', 'install', '-y', 'vim-enhanced'],
      regClient,
      60000,
    );
    await runCmd('Verify vim-enhanced is installed', ['rpm', '-q', 'vim-enhanced'], regClient);
  });
});

test('Assign Template to System via UI - "Create template and add to systems" button', async ({
  page,
  client,
  cleanup,
}) => {
  const templateNamePrefix = 'Template_and_add_to_systems_ui_test';

  const templateName = `${templateNamePrefix}-${randomName()}`;
  const containerName = `RHSMClientTest-${randomName()}`;
  const regClient = new RHSMClient(containerName);
  let hostname = '';

  await cleanup.runAndAdd(() => cleanupTemplates(client, templateNamePrefix));
  cleanup.add(() => regClient.Destroy('rhc'));
  await test.step('Create template', async () => {
    await navigateToTemplates(page);
    await closePopupsIfExist(page);
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
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByText('Use the latest content', { exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Enter template details')).toBeVisible();
    await page.getByPlaceholder('Enter name').fill(templateName);
    await page.getByPlaceholder('Description').fill('Test template for system assignment');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Create template and add to systems' }).click();
    //   await expect(page.getByText(`Content Template "${templateName}" created`)).toBeVisible({
    //     timeout: 30000,
    //   });

    // Boot and register RHSM client
    await regClient.Boot('rhel9');
    const hostnameResult = await runCmd('Get hostname', ['hostname'], regClient);
    hostname = hostnameResult?.stdout?.toString().trim() || '';
    console.log('Container hostname:', hostname);

    const reg = await regClient.RegisterRHC(process.env.ACTIVATION_KEY_1, process.env.ORG_ID_1);
    if (reg?.exitCode != 0) {
      console.log('Registration stdout:', reg?.stdout);
      console.log('Registration stderr:', reg?.stderr);
    }
    expect(reg?.exitCode).toBe(0);
    await refreshSubscriptionManager(regClient);
    await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);

    // Assign template to systems
    await expect(page.getByText('Assign template to systems')).toBeVisible({ timeout: 30000 });
    await page.getByRole('searchbox', { name: 'Filter by name' }).fill(hostname);
    const systemRow = page.getByRole('row').filter({ hasText: hostname });
    await expect(systemRow).toBeVisible({ timeout: 30000 });
    await systemRow.getByRole('checkbox').click();
    await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    //   await expect(page.getByText('Template successfully added to 1 system')).toBeVisible({
    //     timeout: 30000,
    //   });

    await expect(page.getByRole('tab', { name: 'Systems' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('grid', { name: 'assign systems table' }).getByText(hostname),
    ).toBeVisible({ timeout: 30000 });
    await expect(systemRow).toBeVisible({ timeout: 30000 });
  });

  await test.step('Verify the host can install packages from the template', async () => {
    await runCmd('Clean cached metadata', ['dnf', 'clean', 'all'], regClient);

    await runCmd(
      'vim-enhanced should not be installed initially',
      ['rpm', '-q', 'vim-enhanced'],
      regClient,
      60000,
      1,
    );

    await runCmd(
      'Install vim-enhanced from template',
      ['yum', 'install', '-y', 'vim-enhanced'],
      regClient,
      60000,
    );
    await runCmd('Verify vim-enhanced is installed', ['rpm', '-q', 'vim-enhanced'], regClient);
  });
});
