import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Navigate to the preview URL with the base path
        app_url = os.environ.get("APP_URL", "http://localhost:4173/?preview=true")
        page.goto(app_url)
        # Wait for the app to load by checking for some text or element
        page.wait_for_selector("#root", state="attached")
        # Give it a tiny bit of time to render JS
        page.wait_for_timeout(2000)
        page.screenshot(path="verification.png")
        browser.close()

if __name__ == "__main__":
    run()
