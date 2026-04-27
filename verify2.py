import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 375, "height": 812})
        page = await context.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        await page.goto('http://localhost:5173/#/client/test-room?preview=true')
        await page.wait_for_selector('text=Your Hand')
        # tap first card (we'll just evaluate a click to be sure)
        await page.evaluate('''
            const cards = document.querySelectorAll('.aspect-\\\\[2\\\\/3\\\\]');
            if (cards.length > 0) {
                cards[0].click();
            }
        ''')
        await page.wait_for_timeout(500)
        # scroll to bottom to see buttons
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await page.wait_for_timeout(500)
        await page.screenshot(path='screenshot2.png')
        await browser.close()

asyncio.run(main())
