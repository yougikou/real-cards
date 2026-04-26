import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 375, "height": 812})
        page = await context.new_page()

        # Handle alerts to prevent hanging
        page.on("dialog", lambda dialog: dialog.accept())

        print("Navigating to client preview...")
        await page.goto("http://localhost:4173/#/client/test-room?preview=true")
        await page.wait_for_selector("text=Your Hand", timeout=10000)

        # Scroll to bottom
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Take initial screenshot
        await page.screenshot(path="screenshot_initial.png")

        # Click the first card
        print("Selecting first card...")
        await page.click("text=10")

        # Wait for selection to apply visually
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshot_selected.png")

        # Check if the CTA is visible
        print("Checking CTA...")
        cta = await page.wait_for_selector("button:has-text('PLAY 1 CARD')", timeout=5000)
        if cta:
            print("CTA found!")

        # Click Play CTA
        print("Clicking PLAY CTA...")
        await cta.click()

        # Wait for the play action to apply
        await page.wait_for_timeout(500)
        await page.screenshot(path="screenshot_played.png")

        # Check if the card is in the play stack
        stack = await page.wait_for_selector("text=Latest Play (Top of Stack)", timeout=5000)
        if stack:
            print("Card found in play stack!")

        await browser.close()

asyncio.run(main())
