import { test, expect } from '@playwright/test';

test.describe('Twoslash Basic Functionality', () => {
  test('Stage 1: should display type information with ^? syntax', async ({ page }) => {
    await page.goto('/twoslash-test/basic-test');
    
    // Wait for the twoslash code block to be rendered
    const codeBlock = page.locator('.twoslash-code pre, pre.shiki');
    await expect(codeBlock).toBeVisible({ timeout: 10000 });
    
    // Verify the code block contains the interface definition
    await expect(codeBlock).toContainText('interface User');
    await expect(codeBlock).toContainText('const user: User');
    
    // Verify type annotations are present (twoslash hover popups)
    // These should appear as elements with type information
    const typeAnnotations = page.locator('.twoslash-hover, [class*="twoslash"]');
    await expect(typeAnnotations.first()).toBeVisible();
    
    // Check that the User type properties are shown somewhere in the rendered output
    const pageContent = await page.content();
    expect(pageContent).toContain('string');
    expect(pageContent).toContain('number');
  });

  test('Stage 2: should display type information from file path', async ({ page }) => {
    await page.goto('/twoslash-test/code-import-test');

    // Wait for the twoslash code block to be rendered
    const codeBlock = page.locator('.twoslash-code pre, pre.shiki');
    await expect(codeBlock).toBeVisible({ timeout: 10000 });

    // Verify the code imported from examples package is rendered
    await expect(codeBlock).toContainText('interface Product');
    await expect(codeBlock).toContainText('myProduct');

    // Verify type annotations are present (twoslash hover popups)
    const typeAnnotations = page.locator('.twoslash-hover, [class*="twoslash"]');
    await expect(typeAnnotations.first()).toBeVisible();

    // Verify type information is shown in the rendered output
    const pageContent = await page.content();
    expect(pageContent).toContain('Product.name: string');
    expect(pageContent).toContain('Product.price: number');
  });

  test('Stage 3: should resolve @mionjs package imports', async ({ page }) => {
    await page.goto('/twoslash-test/import-resolution-test');

    // Wait for the twoslash code block to be rendered (use first() since popups also have pre elements)
    const codeBlock = page.locator('.twoslash-code pre.shiki.twoslash').first();
    await expect(codeBlock).toBeVisible({ timeout: 10000 });

    // Verify the code with @mionjs imports is rendered
    await expect(codeBlock).toContainText('@mionjs/router');
    await expect(codeBlock).toContainText('@mionjs/platform-node');

    // Verify type annotations are present (twoslash hover popups)
    const typeAnnotations = page.locator('.twoslash-hover, [class*="twoslash"]');
    await expect(typeAnnotations.first()).toBeVisible();

    // Verify @mionjs type information is resolved and shown
    const pageContent = await page.content();
    // Check for route function type signature
    expect(pageContent).toContain('route');
    expect(pageContent).toContain('Handler');
    // Check for initMionRouter type signature
    expect(pageContent).toContain('initMionRouter');
    expect(pageContent).toContain('Routes');
    // Check for startNodeServer type signature
    expect(pageContent).toContain('startNodeServer');
  });
});

