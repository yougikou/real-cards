import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("dialog", lambda dialog: dialog.accept())
        app_url = os.environ.get("APP_URL", "http://localhost:5173/")
        page.goto(app_url + "#/client/test-room?preview=true")
        page.wait_for_selector("text=Play Zone", state="attached")
        page.wait_for_timeout(2000)

        # Take a screenshot right away before scrolling
        page.screenshot(path="client_top_zone_empty.png")

        # Scroll down to draw a card
        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        page.click("button:has-text('DRAW 1')")
        page.wait_for_timeout(1000)

        # Click the first card
        card = page.locator(".grid > div").first
        card.click()
        page.wait_for_timeout(1000)

        # Scroll to top to see play zone
        page.evaluate('window.scrollTo(0, 0)')

        # Screenshot of the active play zone state
        page.screenshot(path="client_top_zone_active.png")

        # Click PLAY button
        page.click("button:has-text('PLAY')")
        page.wait_for_timeout(1000)

        # Screenshot after playing
        page.screenshot(path="client_top_zone_after_play.png")

        browser.close()

if __name__ == "__main__":
    run()
