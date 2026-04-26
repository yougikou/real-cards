import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 375, "height": 812})
        page = await context.new_page()

        page.on("dialog", lambda dialog: dialog.accept())

        await page.goto("http://localhost:4173/#/client/test-room?preview=true")
        await page.wait_for_selector("text=Your Hand", timeout=10000)

        # Take initial screenshot of top section
        await page.screenshot(path="screenshot_top_section.png")

        await page.click("text=10")
        await page.wait_for_timeout(500)

        # Take screenshot of top section with card selected
        await page.screenshot(path="screenshot_top_section_selected.png")

        await browser.close()

asyncio.run(main())
