import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        app_url = os.environ.get("APP_URL", "http://localhost:4173/")
        page.goto(app_url + "#/host")
        page.wait_for_selector(".absolute.top-4.right-4", state="attached")
        page.wait_for_timeout(3000)

        # Click the deck to draw to table
        page.click("text=Deck")
        page.wait_for_timeout(1000)

        page.screenshot(path="verification_host_playstack.png")

        # We might need to click the exact element by a different selector or text
        page.click("button:has-text('Clear to Discard')")
        page.wait_for_timeout(1000)

        page.screenshot(path="verification_host_discard.png")
        browser.close()

if __name__ == "__main__":
    run()