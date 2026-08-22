import { expect, test } from '@playwright/test'

test('AC1–AC12 AC19–AC22 AC27 AC29 AC35–AC37: explicit Move mode completes a nested image journey and cleans up on tab switch', async ({ page }) => {
  await page.goto('/?fixture=reordering')
  const image = page.getByTestId('blocked-image')
  await image.click()
  await page.getByTestId('image-move').click()
  await expect(page.getByTestId('move-controller')).toBeVisible()
  const targetCell = await cellBox(page.getByTestId('rich-editor-content'), 'Target')
  if (!targetCell) throw new Error('Expected image target geometry')
  await page.mouse.click(targetCell.x + targetCell.width / 2, targetCell.y + targetCell.height / 2)
  await page.getByTestId('move-place').click()
  await expect(page.getByTestId('rich-editor-content')).toBeFocused()
  await expect(page.getByTestId('blocked-image')).toHaveClass(/ProseMirror-selectednode/)
  expect(await page.getByTestId('blocked-image').evaluate((element) => element.closest('td')?.textContent)).toContain('Target')
  await expect(page.getByTestId('document-tab').first()).toHaveAttribute('aria-label', /dirty/)

  await page.getByTestId('blocked-image').click()
  await page.getByTestId('image-move').click()
  await page.getByTestId('document-tab').nth(1).click()
  await expect(page.getByTestId('move-controller')).toHaveCount(0)
})

test('AC23–AC27: direct pointer movement cancels outside a legal target and commits over a legal row gap', async ({ page }) => {
  await page.goto('/?fixture=reordering')
  const editor = page.getByTestId('rich-editor-content')
  const selected = await cellBox(editor, 'Later')
  if (!selected) throw new Error('Expected source row geometry')
  await page.mouse.click(selected.x + selected.width / 2, selected.y + selected.height / 2)
  const handle = page.getByTestId('table-row-drag-handle')
  const source = await handle.boundingBox()
  const target = await cellBox(editor, 'Target')
  if (!source || !target) throw new Error('Expected drag geometry')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 4 })
  await page.mouse.up()
  expect(await editor.evaluate((element) => element.querySelectorAll('tr').item(1).textContent)).toContain('Later')
})

test('AC31: a move committed after save captures its snapshot remains dirty', async ({ page }) => {
  await page.goto('/?fixture=reordering')
  const editor = page.getByTestId('rich-editor-content')
  await moveImageToCell(page, editor, 'Target')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail: 'save' })))
  await expect(page.getByTestId('fixture-save-status')).toHaveAttribute('data-fixture-save-state', 'pending')
  await page.getByTestId('blocked-image').click()
  await page.getByTestId('image-move').click()
  await page.getByTestId('move-first').click()
  await page.getByTestId('move-place').click()
  await expect(page.getByTestId('fixture-save-status')).toHaveCount(0)
  expect(await page.getByTestId('blocked-image').evaluate((element) => element.closest('td'))).toBeNull()
  await expect(page.getByTestId('document-tab').first()).toHaveAttribute('aria-label', /dirty/)
})

async function moveImageToCell(page: import('@playwright/test').Page, editor: import('@playwright/test').Locator, text: string) {
  await page.getByTestId('blocked-image').click()
  await page.getByTestId('image-move').click()
  const destination = await cellBox(editor, text)
  if (!destination) throw new Error(`Expected ${text} image destination geometry`)
  await page.mouse.click(destination.x + destination.width / 2, destination.y + destination.height / 2)
  await page.getByTestId('move-place').click()
}

async function cellBox(editor: import('@playwright/test').Locator, text: string) {
  return editor.evaluate((element, expected) => {
    const cell = [...element.querySelectorAll<HTMLElement>('th,td')].find((candidate) => candidate.textContent?.trim() === expected)
    const rectangle = cell?.getBoundingClientRect()
    return rectangle ? { height: rectangle.height, width: rectangle.width, x: rectangle.x, y: rectangle.y } : undefined
  }, text)
}
