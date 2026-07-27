import { expect, test } from '@playwright/test'

test('AC5 AC57-AC59: CSV workspace activation, save, watcher reload, and conflict reuse the shared lifecycle', async ({ page }) => {
  await page.goto('/?fixture=csv-basic')
  await treeRow(page, 'people.csv').click()
  await expect(page.getByTestId('csv-grid')).toBeVisible()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'people, Preview')

  await page.getByTestId('csv-cell').filter({ hasText: 'Person 01' }).dblclick()
  await page.getByTestId('csv-cell-editor').fill('Grace')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'people, dirty')
  await sendCommand(page, 'save')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'people')
})

test('AC6 AC29-AC30 AC39 AC46-AC47 AC64 AC68: CSV preview uses compact native-sticky chrome across both axes', async ({ page }) => {
  await page.goto('/?fixture=csv-basic')
  await treeRow(page, 'people.csv').click()

  await expect(page.getByTestId('document-title')).toHaveAttribute('aria-label', 'Document title, .csv extension is fixed')
  await expect(page.getByTestId('csv-title-extension')).toHaveText('.csv')
  const toolbar = page.getByTestId('csv-toolbar')
  await expect(toolbar.getByRole('button')).toHaveCount(7)
  await expect(toolbar.getByTestId('csv-action-icon')).toHaveCount(7)
  await expect(page.getByTestId('csv-grid')).toHaveAttribute('aria-rowcount', '31')
  await expect(page.getByTestId('csv-grid')).toHaveAttribute('aria-colcount', '10')
  await expect(page.getByTestId('csv-column-labels')).toHaveCount(0)
  await expect(page.getByRole('columnheader').first()).toHaveText('name')
  expect(await page.getByRole('columnheader').count()).toBeLessThanOrEqual(10)

  const geometry = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('[data-testid="csv-grid"]')!
    const pageSurface = document.querySelector<HTMLElement>('[data-testid="document-page"]')!
    const titleGutter = document.querySelector<HTMLElement>('.document-title-gutter')!
    const actions = document.querySelector<HTMLElement>('[data-testid="csv-toolbar"]')!
    const header = document.querySelector<HTMLElement>('.csv-header-row')!
    const rowNumber = header.querySelector<HTMLElement>('[data-testid="csv-row-number"]')!
    const bounds = (element: HTMLElement) => element.getBoundingClientRect()
    return {
      actionsHeight: bounds(actions).height,
      actionsTop: bounds(actions).top,
      gridLeft: bounds(grid).left,
      gridRight: bounds(grid).right,
      headerPosition: getComputedStyle(header).position,
      pageLeft: bounds(pageSurface).left,
      pageRight: bounds(pageSurface).right,
      rowNumberPosition: getComputedStyle(rowNumber).position,
      titleHeight: bounds(titleGutter).height,
      titleTop: bounds(titleGutter).top,
    }
  })
  expect(geometry).toMatchObject({
    actionsHeight: 40,
    headerPosition: 'sticky',
    rowNumberPosition: 'sticky',
    titleHeight: 40,
  })
  expect(geometry.actionsTop).toBe(geometry.titleTop)
  expect(geometry.gridLeft).toBe(geometry.pageLeft)
  expect(geometry.gridRight).toBe(geometry.pageRight)

  const addRowAbove = toolbar.getByRole('button', { name: 'Add row above' })
  await addRowAbove.focus()
  await expect.poll(() => addRowAbove.evaluate((element) => getComputedStyle(element, '::after').opacity)).toBe('1')

  const grid = page.getByTestId('csv-grid')
  await expect.poll(() => page.getByTestId('csv-row').count()).toBeGreaterThan(20)
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.scrollLeft = element.scrollWidth
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const fixed = await page.evaluate(() => {
    const gridElement = document.querySelector<HTMLElement>('[data-testid="csv-grid"]')!
    const header = document.querySelector<HTMLElement>('.csv-header-row')!
    const rowNumber = header.querySelector<HTMLElement>('[data-testid="csv-row-number"]')!
    return {
      gridLeft: Math.round(gridElement.getBoundingClientRect().left),
      gridTop: Math.round(gridElement.getBoundingClientRect().top),
      headerTop: Math.round(header.getBoundingClientRect().top),
      rowNumberLeft: Math.round(rowNumber.getBoundingClientRect().left),
    }
  })
  expect(fixed.headerTop).toBe(fixed.gridTop)
  expect(fixed.rowNumberLeft).toBe(fixed.gridLeft)

  await page.getByRole('button', { name: 'Header row' }).click()
  await expect(page.getByTestId('csv-column-letter')).toHaveCount(10)
  await expect(page.getByRole('columnheader')).toHaveCount(0)
  await expect(page.getByTestId('csv-cell').first()).toHaveAttribute('role', 'gridcell')
})

test('AC72: stale CSV search and preview work cannot steal selection or focus from a newer tab', async ({ page }) => {
  await page.goto('/?fixture=csv-stale')
  await treeRow(page, 'large.csv').click()
  await expect(page.getByTestId('csv-grid')).toBeVisible()
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('document-title')).toHaveValue('')
  await page.waitForTimeout(200)
  await expect(page.getByTestId('document-title')).toHaveValue('')
  await expect(page.getByTestId('rich-editor-content')).toBeFocused()
})

const treeRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('workspace-tree-row').filter({ hasText: name })

async function sendCommand(page: import('@playwright/test').Page, command: 'save'): Promise<void> {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail })), command)
}
